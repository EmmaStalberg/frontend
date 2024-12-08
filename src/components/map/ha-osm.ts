import { isToday } from "date-fns";
import type {
  Circle,
  CircleMarker,
  LatLngExpression,
  LatLngTuple,
  Map,
  Marker,
  Polyline,
} from "leaflet";
import { TileLayer } from "leaflet";
import type { CSSResultGroup, PropertyValues } from "lit";
import { ReactiveElement, css } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatDateTime } from "../../common/datetime/format_date_time";
import {
  formatTimeWeekday,
  formatTimeWithSeconds,
} from "../../common/datetime/format_time";
import type { LeafletModuleType } from "../../common/dom/setup-leaflet-map";
import {
  setupOSMMap,
  createCyclOSMTileLayer,
  createTileLayer,
  createCycleMapTileLayer,
  createTransportMapTileLayer,
  createHotMapTileLayer,
} from "../../common/dom/setup-leaflet-map";
import { computeStateDomain } from "../../common/entity/compute_state_domain";
import { computeStateName } from "../../common/entity/compute_state_name";
import type { HomeAssistant, ThemeMode } from "../../types";
import { isTouch } from "../../util/is_touch";
import "../ha-icon-button";
import "../search-input";
import "./ha-entity-marker";
import type { OpenStreetMapPlace } from "../../data/openstreetmap";
import { reverseGeocode } from "../../data/openstreetmap";

const getEntityId = (entity: string | HaMapEntity): string =>
  typeof entity === "string" ? entity : entity.entity_id;

export interface HaMapPathPoint {
  point: LatLngTuple;
  timestamp: Date;
}
export interface HaMapPaths {
  points: HaMapPathPoint[];
  color?: string;
  name?: string;
  gradualOpacity?: number;
  fullDatetime?: boolean;
}

export interface HaMapEntity {
  entity_id: string;
  color: string;
  label_mode?: "name" | "state";
  name?: string;
  focus?: boolean;
}

@customElement("ha-osm")
export class HaOSM extends ReactiveElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entities?: string[] | HaMapEntity[];

  @property({ attribute: false }) public paths?: HaMapPaths[];

  @property({ attribute: false }) public layer?: TileLayer;

  @property({ type: Boolean }) public autoFit = false;

  @property({ type: Boolean }) public renderPassive = false;

  @property({ type: Boolean }) public interactiveZones = false;

  @property({ type: Boolean }) public fitZones = false;

  @property({ attribute: "theme-mode", type: String })
  public themeMode: ThemeMode = "auto";

  @property({ type: Number }) public zoom = 13;

  @state() private _loaded = false;

  public leafletMap?: Map;

  private Leaflet?: LeafletModuleType;

  private _resizeObserver?: ResizeObserver;

  private _mapItems: Array<Marker | Circle> = [];

  private _mapFocusItems: Array<Marker | Circle> = [];

  private _mapZones: Array<Marker | Circle> = [];

  private _mapFocusZones: Array<Marker | Circle> = [];

  private _mapPaths: Array<Polyline | CircleMarker> = [];

  private markers: L.Marker[] = [];

  @state()
  private _location: [number, number] = [57.7072326, 11.9670171];

  @state() private _places?: OpenStreetMapPlace[] | null;

  public connectedCallback(): void {
    super.connectedCallback();
    this._loadMap();
    this._attachObserver();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = undefined;
      this.Leaflet = undefined;
    }

    this._loaded = false;

    if (this._resizeObserver) {
      this._resizeObserver.unobserve(this);
    }
  }

  protected update(changedProps: PropertyValues) {
    super.update(changedProps);
  }

  private get _darkMode() {
    return (
      this.themeMode === "dark" ||
      (this.themeMode === "auto" && Boolean(this.hass.themes.darkMode))
    );
  }

  private _loading = false;

  private async _loadMap(): Promise<void> {
    if (this._loading) return;
    let map = this.shadowRoot!.getElementById("map");
    if (!map) {
      map = document.createElement("div");
      map.id = "map";
      this.shadowRoot!.append(map);
    }
    this._loading = true;
    try {
      [this.leafletMap, this.Leaflet, this.layer] = await setupOSMMap(map);
      this._findCurrentLocation();
      this._loaded = true;
    } finally {
      this._loading = false;
    }
  }

  private _findCurrentLocation(): void {
    const map = this.leafletMap;
    const leaflet = this.Leaflet;
    if (!map || !leaflet) return;
    map.off("locationfound");
    map.locate({ setView: true, maxZoom: 13 });
    map.on("locationfound", (e: L.LocationEvent) => {
      this.markers.forEach((marker) => marker.remove());
      this.markers = [];
      this._location = [Number(e.latlng.lat), Number(e.latlng.lng)];
      const newMarker = leaflet.marker(e.latlng).addTo(map);
      this.markers.push(newMarker);
      map.setView(e.latlng);
    });
  }

  private async _reverseGeocode() {
    if (!this._location) {
      return;
    }
    this._places = null;
    const reverse = await reverseGeocode(this._location, this.hass);
    this._places = [reverse];
  }

  public fitMap(options?: { zoom?: number; pad?: number }): void {
    if (!this.leafletMap || !this.Leaflet || !this.hass) {
      return;
    }
    // clear marker created from search
    if (!this._mapFocusItems.length && !this._mapFocusZones.length) {
      const map = this.leafletMap;
      if (!map) return;
      // Re-trigger location detection
      map.locate({ setView: true, maxZoom: 13 });
      return;
    }

    let bounds = this.Leaflet.latLngBounds(
      this._mapFocusItems
        ? this._mapFocusItems.map((item) => item.getLatLng())
        : []
    );

    this._mapFocusZones?.forEach((zone) => {
      bounds.extend("getBounds" in zone ? zone.getBounds() : zone.getLatLng());
    });

    bounds = bounds.pad(options?.pad ?? 0.5);

    this.leafletMap.fitBounds(bounds, { maxZoom: options?.zoom || this.zoom });
  }

  // Note! This works for one pair of coordinates. If one want to later make this work for several
  // coordinates at once, it needs to be updated similar to fitMap
  public fitMapToCoordinates(
    coordinates: LatLngTuple,
    options?: { zoom?: number; pad?: number }
  ): void {
    if (!this.leafletMap || !this.Leaflet || !this.hass) {
      return;
    }

    const [lat, lon] = coordinates;

    this.leafletMap.setView(
      new this.Leaflet.LatLng(lat, lon),
      options?.zoom || this.zoom
    );

    const foundAddress = this.Leaflet.marker([lat, lon]).addTo(this.leafletMap);
    this.markers.push(foundAddress);
  }

  public fitBounds(
    boundingbox: LatLngExpression[],
    options?: { zoom?: number; pad?: number }
  ) {
    if (!this.leafletMap || !this.Leaflet || !this.hass) {
      return;
    }
    const bounds = this.Leaflet.latLngBounds(boundingbox).pad(
      options?.pad ?? 0.5
    );
    this.leafletMap.fitBounds(bounds, { maxZoom: options?.zoom || this.zoom });
  }

  public changeToStandardLayer(): void {
    const map = this.leafletMap!;
    const leaflet = this.Leaflet!;
    map.eachLayer((layer) => {
      if (layer instanceof TileLayer) {
        map.removeLayer(layer);
      }
    });
    this.layer = createTileLayer(leaflet)?.addTo(map);
  }

  public changeToCyclOSMLayer(): void {
    const map = this.leafletMap!;
    const leaflet = this.Leaflet!;

    const cyclOSMTileLayer = createCyclOSMTileLayer(leaflet);

    this.layer = cyclOSMTileLayer.addTo(map);
  }

  public changeToCycleMapLayer(): void {
    const map = this.leafletMap!;
    const leaflet = this.Leaflet!;

    const cyclOSMTileLayer = createCycleMapTileLayer(leaflet);

    this.layer = cyclOSMTileLayer.addTo(map);
  }

  public changeToTransportMapLayer(): void {
    const map = this.leafletMap!;
    const leaflet = this.Leaflet!;

    const cyclOSMTileLayer = createTransportMapTileLayer(leaflet);

    this.layer = cyclOSMTileLayer.addTo(map);
  }

  public changeToHotMapLayer(): void {
    const map = this.leafletMap!;
    const leaflet = this.Leaflet!;

    const cyclOSMTileLayer = createHotMapTileLayer(leaflet);

    this.layer = cyclOSMTileLayer.addTo(map);
  }

  private _computePathTooltip(path: HaMapPaths, point: HaMapPathPoint): string {
    let formattedTime: string;
    if (path.fullDatetime) {
      formattedTime = formatDateTime(
        point.timestamp,
        this.hass.locale,
        this.hass.config
      );
    } else if (isToday(point.timestamp)) {
      formattedTime = formatTimeWithSeconds(
        point.timestamp,
        this.hass.locale,
        this.hass.config
      );
    } else {
      formattedTime = formatTimeWeekday(
        point.timestamp,
        this.hass.locale,
        this.hass.config
      );
    }
    return `${path.name}<br>${formattedTime}`;
  }

  private _drawPaths(): void {
    const hass = this.hass;
    const map = this.leafletMap;
    const Leaflet = this.Leaflet;

    if (!hass || !map || !Leaflet) {
      return;
    }
    if (this._mapPaths.length) {
      this._mapPaths.forEach((marker) => marker.remove());
      this._mapPaths = [];
    }
    if (!this.paths) {
      return;
    }

    const darkPrimaryColor = getComputedStyle(this).getPropertyValue(
      "--dark-primary-color"
    );

    this.paths.forEach((path) => {
      let opacityStep: number;
      let baseOpacity: number;
      if (path.gradualOpacity) {
        opacityStep = path.gradualOpacity / (path.points.length - 2);
        baseOpacity = 1 - path.gradualOpacity;
      }

      for (
        let pointIndex = 0;
        pointIndex < path.points.length - 1;
        pointIndex++
      ) {
        const opacity = path.gradualOpacity
          ? baseOpacity! + pointIndex * opacityStep!
          : undefined;

        // DRAW point
        this._mapPaths.push(
          Leaflet!
            .circleMarker(path.points[pointIndex].point, {
              radius: isTouch ? 8 : 3,
              color: path.color || darkPrimaryColor,
              opacity,
              fillOpacity: opacity,
              interactive: true,
            })
            .bindTooltip(
              this._computePathTooltip(path, path.points[pointIndex]),
              { direction: "top" }
            )
        );

        // DRAW line between this and next point
        this._mapPaths.push(
          Leaflet!.polyline(
            [path.points[pointIndex].point, path.points[pointIndex + 1].point],
            {
              color: path.color || darkPrimaryColor,
              opacity,
              interactive: false,
            }
          )
        );
      }
      const pointIndex = path.points.length - 1;
      if (pointIndex >= 0) {
        const opacity = path.gradualOpacity
          ? baseOpacity! + pointIndex * opacityStep!
          : undefined;
        // DRAW end path point
        this._mapPaths.push(
          Leaflet!
            .circleMarker(path.points[pointIndex].point, {
              radius: isTouch ? 8 : 3,
              color: path.color || darkPrimaryColor,
              opacity,
              fillOpacity: opacity,
              interactive: true,
            })
            .bindTooltip(
              this._computePathTooltip(path, path.points[pointIndex]),
              { direction: "top" }
            )
        );
      }
      this._mapPaths.forEach((marker) => map.addLayer(marker));
    });
  }

  private _drawEntities(): void {
    const hass = this.hass;
    const map = this.leafletMap;
    const Leaflet = this.Leaflet;

    if (!hass || !map || !Leaflet) {
      return;
    }

    if (this._mapItems.length) {
      this._mapItems.forEach((marker) => marker.remove());
      this._mapItems = [];
      this._mapFocusItems = [];
    }

    if (this._mapZones.length) {
      this._mapZones.forEach((marker) => marker.remove());
      this._mapZones = [];
      this._mapFocusZones = [];
    }

    if (!this.entities) {
      return;
    }

    const computedStyles = getComputedStyle(this);
    const zoneColor = computedStyles.getPropertyValue("--accent-color");
    const passiveZoneColor = computedStyles.getPropertyValue(
      "--secondary-text-color"
    );

    const darkPrimaryColor = computedStyles.getPropertyValue(
      "--dark-primary-color"
    );

    const className = this._darkMode ? "dark" : "light";

    for (const entity of this.entities) {
      const stateObj = hass.states[getEntityId(entity)];
      if (!stateObj) {
        continue;
      }
      const customTitle = typeof entity !== "string" ? entity.name : undefined;
      const title = customTitle ?? computeStateName(stateObj);
      const {
        latitude,
        longitude,
        passive,
        icon,
        radius,
        entity_picture: entityPicture,
        gps_accuracy: gpsAccuracy,
      } = stateObj.attributes;

      if (!(latitude && longitude)) {
        continue;
      }

      if (computeStateDomain(stateObj) === "zone") {
        // DRAW ZONE
        if (passive && !this.renderPassive) {
          continue;
        }

        // create icon
        let iconHTML = "";
        if (icon) {
          const el = document.createElement("ha-icon");
          el.setAttribute("icon", icon);
          iconHTML = el.outerHTML;
        } else {
          const el = document.createElement("span");
          el.innerHTML = title;
          iconHTML = el.outerHTML;
        }

        // create marker with the icon
        this._mapZones.push(
          Leaflet.marker([latitude, longitude], {
            icon: Leaflet.divIcon({
              html: iconHTML,
              iconSize: [24, 24],
              className,
            }),
            interactive: this.interactiveZones,
            title,
          })
        );

        // create circle around it
        const circle = Leaflet.circle([latitude, longitude], {
          interactive: false,
          color: passive ? passiveZoneColor : zoneColor,
          radius,
        });
        this._mapZones.push(circle);
        if (
          this.fitZones &&
          (typeof entity === "string" || entity.focus !== false)
        ) {
          this._mapFocusZones.push(circle);
        }

        continue;
      }

      // DRAW ENTITY
      // create icon
      const entityName =
        typeof entity !== "string" && entity.label_mode === "state"
          ? this.hass.formatEntityState(stateObj)
          : (customTitle ??
            title
              .split(" ")
              .map((part) => part[0])
              .join("")
              .substr(0, 3));

      // create marker with the icon
      const marker = Leaflet.marker([latitude, longitude], {
        icon: Leaflet.divIcon({
          html: `
              <ha-entity-marker
                entity-id="${getEntityId(entity)}"
                entity-name="${entityName}"
                entity-picture="${
                  entityPicture ? this.hass.hassUrl(entityPicture) : ""
                }"
                ${
                  typeof entity !== "string"
                    ? `entity-color="${entity.color}"`
                    : ""
                }
              ></ha-entity-marker>
            `,
          iconSize: [48, 48],
          className: "",
        }),
        title: title,
      });
      this._mapItems.push(marker);
      if (typeof entity === "string" || entity.focus !== false) {
        this._mapFocusItems.push(marker);
      }

      // create circle around if entity has accuracy
      if (gpsAccuracy) {
        this._mapItems.push(
          Leaflet.circle([latitude, longitude], {
            interactive: false,
            color: darkPrimaryColor,
            radius: gpsAccuracy,
          })
        );
      }
    }

    this._mapItems.forEach((marker) => map.addLayer(marker));
    this._mapZones.forEach((marker) => map.addLayer(marker));
  }

  private async _attachObserver(): Promise<void> {
    if (!this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        this.leafletMap?.invalidateSize({ debounceMoveend: true });
      });
    }
    this._resizeObserver.observe(this);
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        display: block;
        height: 300px;
      }
      #map {
        height: 100%;
      }
      #map.dark {
        background: #090909;
      }
      #map.forced-dark {
        color: #ffffff;
        --map-filter: invert(0.9) hue-rotate(170deg) brightness(1.5)
          contrast(1.2) saturate(0.3);
      }
      #map.forced-light {
        background: #ffffff;
        color: #000000;
        --map-filter: invert(0);
      }
      #map:active {
        cursor: grabbing;
        cursor: -moz-grabbing;
        cursor: -webkit-grabbing;
      }
      .leaflet-tile-pane {
        filter: var(--map-filter);
      }
      .dark .leaflet-bar a {
        background-color: #1c1c1c;
        color: #ffffff;
      }
      .dark .leaflet-bar a:hover {
        background-color: #313131;
      }
      .leaflet-marker-draggable {
        cursor: move !important;
      }
      .leaflet-edit-resize {
        border-radius: 50%;
        cursor: nesw-resize !important;
      }
      .named-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        text-align: center;
        color: var(--primary-text-color);
      }
      .leaflet-pane {
        z-index: 0 !important;
      }
      .leaflet-control,
      .leaflet-top,
      .leaflet-bottom {
        z-index: 1 !important;
      }
      .leaflet-tooltip {
        padding: 8px;
        font-size: 90%;
        background: rgba(80, 80, 80, 0.9) !important;
        color: white !important;
        border-radius: 4px;
        box-shadow: none !important;
        text-align: center;
      }
      .leaflet-control {
        margin-top: 50px; /* Move zoom controls down */
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-osm": HaOSM;
  }
}
