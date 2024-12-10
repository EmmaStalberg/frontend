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
import { showAlertDialog } from "../../panels/lovelace/custom-card-helpers";
import { showToast } from "../../util/toast";

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

  private _routeLayer: L.GeoJSON | null = null;

  private noteMarkers: L.Marker[] = [];

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
      this._location = [Number(e.latlng.lat), Number(e.latlng.lng)];
      // this.markers.forEach((marker) => marker.remove());
      // this.markers = [];
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

    // Clear previoud markers
    this._clearRouteLayer();
    const foundAddress = this.Leaflet.marker([lat, lon]).addTo(this.leafletMap);
    this.markers.push(foundAddress);
  }

  async fetchApiJson(url: string): Promise<any> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jsonData = await response.json();
    return jsonData;
  }

  private async _fetchAdressInfo(searchterm: string): Promise<any> {
    try {
      const data = await this.fetchApiJson(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchterm)}&format=json&polygon=1&addressdetails=1`
      );
      if (!data || data.length === 0) {
        showAlertDialog(this, {
          title: "Oops, we can't find this place!",
          text: "Please try a new place!",
          warning: true,
        });
        return null;
      }
      const node = data[0];
      return node;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching coordinates:", error);
      return null; // Return null or handle the error as needed
    }
  }

  public async _handleSearchAction(searchterm: string) {
    // Search action
    if (!searchterm) return;
    const data = await this._fetchAdressInfo(searchterm);
    if (!data) return;
    // Extract latitudes and longitudes
    const latValues = data.lat;
    const lonValues = data.lon;

    const leaflet = this.Leaflet;
    const map = this.leafletMap;
    if (!map || !leaflet) return;
    map.setView([latValues, lonValues], this.zoom);
    // Clear previoud markers
    this._clearRouteLayer();
    const foundAddress = leaflet.marker([latValues, lonValues]).addTo(map);
    // Create popup content
    const popupContent = `
      <div>
        <strong>${data.name || "Unknown Location"}</strong><br/>
        ${data.display_name || "No address available"}
      </div>
    `;

    // Bind popup to the marker
    foundAddress.bindPopup(popupContent).openPopup();
    this.markers.push(foundAddress);
  }

  private _clearRouteLayer() {
    // Clear previoud markers
    this.markers.forEach((marker) => marker.remove());
    this.markers = [];
    if (this._routeLayer) {
      this.leafletMap?.removeLayer(this._routeLayer); // Remove the route from the map
      this._routeLayer = null; // Reset the reference
    }
  }

  public _handleAddANote() {
    const map = this.leafletMap;
    const leaflet = this.Leaflet;
    if (!map || !leaflet) return;

    // Create a red marker icon
    const redIcon = leaflet.icon({
      iconUrl: "https://img.icons8.com/ios-filled/50/FA5252/marker.png", // URL for red marker icon
      iconSize: [35, 41], // Size of the icon
      iconAnchor: [12, 41], // Anchor point of the icon
      popupAnchor: [1, -34], // Anchor point of the popup relative to the icon
    });

    // Create a marker at the center of the map
    const initialLatLng = map.getCenter();
    const noteMarker = leaflet
      .marker(initialLatLng, { icon: redIcon, draggable: true }) // Make the marker draggable
      .addTo(map);

    // Bind popup to the marker
    noteMarker
      .bindPopup(
        `
        <div>
          <strong>Note:</strong><br/>
          Drag this marker to the desired location.<br/>
          <button id="remove-note" style="margin-top: 5px; color: red;">Remove Note</button>
        </div>
      `
      )
      .openPopup();

    // Add the marker to the noteMarkers array for tracking
    this.noteMarkers.push(noteMarker);

    // Add click event to remove the marker
    noteMarker.on("popupopen", () => {
      // Add event listener for the "Remove Note" button
      const popupContent = noteMarker.getPopup()?.getElement();
      if (!popupContent) {
        // eslint-disable-next-line no-console
        console.error("Popup content not found");
        return;
      }

      const removeButton = popupContent.querySelector(
        "#remove-note"
      ) as HTMLElement;
      if (!removeButton) {
        // eslint-disable-next-line no-console
        console.error("Remove button not found in popup");
        return;
      }

      // Add event listener for the "Remove Note" button
      removeButton.addEventListener("click", () => {
        // Remove the marker from the map and the array
        map.removeLayer(noteMarker);
        this.noteMarkers = this.noteMarkers.filter(
          (marker) => marker !== noteMarker
        );
      });
    });

    // Add dragend event to update marker position
    noteMarker.on("dragend", () => {
      const { lat, lng } = noteMarker.getLatLng();
      // eslint-disable-next-line no-console
      console.log(`Marker moved to: ${lat}, ${lng}`);
    });
  }

  public async _handleNavigationAction(
    // Show direction function
    startPoint: string,
    endPoint: string,
    transportMode: string
  ) {
    let startInfo: { name: string; lat: number; lon: number } | null = null;
    let endInfo: { name: string; lat: number; lon: number } | null = null;
    if (startPoint === "") {
      startInfo = {
        name: "Current location",
        lat: this._location[0],
        lon: this._location[1],
      };
    } else {
      const fetchedStart = await this._fetchAdressInfo(startPoint);
      if (!fetchedStart) {
        // eslint-disable-next-line no-console
        console.error("Failed to fetch start coordinates.");
        return; // Exit if start coordinates couldn't be fetched
      }
      startInfo = {
        name: fetchedStart.name,
        lat: fetchedStart.lat,
        lon: fetchedStart.lon,
      };
    }
    if (endPoint === "") {
      endInfo = {
        name: "Current location",
        lat: this._location[0],
        lon: this._location[1],
      };
    } else {
      const fetchedEnd = await this._fetchAdressInfo(endPoint);
      if (!fetchedEnd) {
        // eslint-disable-next-line no-console
        console.error("Failed to fetch end coordinates.");
        return; // Exit if end coordinates couldn't be fetched
      }
      endInfo = {
        name: fetchedEnd.name,
        lat: fetchedEnd.lat,
        lon: fetchedEnd.lon,
      };
    }
    if (startInfo.lat === endInfo.lat && startInfo.lon === endInfo.lon) {
      showToast(this, {
        message: "Please provide a valid destination!",
      });
      return;
    }

    try {
      // const route = await this._fetchRoute(
      //   startLatlon,
      //   endLatlon,
      //   transportMode
      // );
      const { route, duration, distance } = await this._fetchRoute(
        [startInfo.lat, startInfo.lon],
        [endInfo.lat, endInfo.lon],
        transportMode
      );
      const leaflet = this.Leaflet;
      const map = this.leafletMap;
      if (!map || !leaflet) return;
      this._clearRouteLayer();
      // Display the route on the map
      this._routeLayer = leaflet
        .geoJSON(route, {
          style: { color: "blue", weight: 5 },
        })
        .addTo(map);

      // Add start and end markers
      const startMarker = leaflet
        .marker([startInfo.lat, startInfo.lon])
        .addTo(map);
      startMarker.bindPopup("Start Point").openPopup();
      const endMarker = leaflet.marker([endInfo.lat, endInfo.lon]).addTo(map);
      endMarker.bindPopup(
        this._showEndpointPopup(endInfo.name, distance, duration)
      );
      this.markers.push(startMarker);
      this.markers.push(endMarker);
      // Fit the map bounds to the route
      map.fitBounds(this._routeLayer.getBounds());

      // Click to show restaurants
      const startRestaurants = await this._fetchRestaurantsNearLocation([
        startInfo.lat,
        startInfo.lon,
      ]);
      const endRestaurants = await this._fetchRestaurantsNearLocation([
        endInfo.lat,
        endInfo.lon,
      ]);
      this._addRestaurantMarkers(startRestaurants);
      this._addRestaurantMarkers(endRestaurants);
      this._routeLayer.on("click", (e: any) =>
        this._handleRouteClick(e.latlng)
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching or displaying route:", error);
    }
  }

  private _showEndpointPopup(name: string, distance: number, duration: number) {
    // Format distance and duration
    const formattedDistance =
      distance < 1000
        ? `${Math.round(distance)} m`
        : `${(distance / 1000).toFixed(1)} km`;
    const formattedDuration =
      duration >= 3600
        ? `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}min`
        : `${Math.floor(duration / 60)} min`;

    return `
      <div>
        <strong>End point</strong><br/>
        Name: ${name}<br/>
        Distance: ${formattedDistance}<br/>
        Duration: ${formattedDuration}
      </div>
    `;
  }

  private async _handleRouteClick(latlng: { lat: number; lng: number }) {
    try {
      const nearbyRestaurants = await this._fetchRestaurantsNearLocation([
        latlng.lat,
        latlng.lng,
      ]);
      this._addRestaurantMarkers(nearbyRestaurants);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching nearby restaurants:", error);
    }
  }

  private async _addRestaurantMarkers(restaurants: any[]) {
    const leaflet = this.Leaflet;
    const map = this.leafletMap;
    if (!map || !leaflet) return;
    const _icon = leaflet.icon({
      iconUrl: "https://img.icons8.com/glyph-neue/64/meal.png", // Restaurant icon
      iconSize: [25, 25],
      iconAnchor: [12, 25],
      popupAnchor: [0, -20],
    });
    restaurants.forEach((restaurant) => {
      const marker = leaflet
        .marker([restaurant.lat, restaurant.lon], { icon: _icon })
        .addTo(map);
      // marker.bindPopup(
      //   `<b>${restaurant.tags.name || "Unnamed Restaurant"}</b>`
      // );

      marker.on("click", async () => {
        const details = await this._showRestaurantDetails(
          restaurant.lat,
          restaurant.lon
        );
        const popupContent = this._generatePopupContent(details);
        marker.bindPopup(popupContent);
      });
      this.markers.push(marker);
    });
  }

  private async _showRestaurantDetails(lat: number, lon: number): Promise<any> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&extratags=1`;
      const details = await this.fetchApiJson(url);
      return details;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching restaurant details:", error);
      return null;
    }
  }

  private _generatePopupContent(details: any): string {
    if (!details) {
      return "<strong>Unable to fetch details</strong>";
    }

    const name = details.name || "Unnamed Restaurant";
    const type = details.type || "Unknown Type";
    const phone = details.extratags?.phone || "Not available";
    const address = details.display_name || "Unknown Address";
    const website = details.extratags?.website
      ? `<a href="${details.extratags.website}" target="_blank">${details.extratags.website}</a>`
      : "Not available";

    return `
      <div>
        <h3>${name}</h3>
        <p><strong>Type:</strong> ${type}</p>
        <p><strong>Address:</strong> ${address}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Website:</strong> ${website}</p>
      </div>
    `;
  }

  private async _fetchRestaurantsNearLocation(
    location: [number, number]
  ): Promise<any[]> {
    const [lat, lon] = location;
    try {
      // Query restaurants within a 500m radius (adjust as needed)
      const data = await this.fetchApiJson(
        `https://overpass-api.de/api/interpreter?data=[out:json];node["amenity"="restaurant"](around:500,${lat},${lon});out;`
      );

      const validRestaurants = data.elements.filter(
        (restaurant: any) => restaurant.tags && restaurant.tags.name
      );
      // Limit the number of restaurants to `count`
      return validRestaurants.slice(0, 10);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching restaurants:", error);
      return [];
    }
  }

  async _fetchRoute(
    start: [number, number],
    end: [number, number],
    transportMode: string
  ) {
    const transport_mode =
      transportMode === "car"
        ? "driving"
        : transportMode === "bicycle"
          ? "bicycle"
          : "foot";
    const [startLat, startLon] = start;
    const [endLat, endLon] = end;
    const data = await this.fetchApiJson(
      `https://router.project-osrm.org/route/v1/${transport_mode}/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`
    );

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        route: route.geometry,
        duration: route.duration, // Duration in seconds
        distance: route.distance, // Distance in meters
      };
    }
    throw new Error("No route found");
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
