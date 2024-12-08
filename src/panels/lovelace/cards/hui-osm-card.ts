import {
  mdiImageFilterCenterFocus,
  mdiLayersTriple,
  mdiShare,
  mdiNearMe,
} from "@mdi/js";
import type { HassEntities } from "home-assistant-js-websocket";
import type { LatLngTuple } from "leaflet";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { getColorByIndex } from "../../../common/color/colors";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { computeDomain } from "../../../common/entity/compute_domain";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { deepEqual } from "../../../common/util/deep-equal";
import parseAspectRatio from "../../../common/util/parse-aspect-ratio";
import "../../../components/ha-alert";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/map/ha-osm";
import "../../../components/search-input-outlined";
import type {
  HaOSM,
  HaMapEntity,
  HaMapPathPoint,
  HaMapPaths,
} from "../../../components/map/ha-osm";
import type { HistoryStates } from "../../../data/history";
import { subscribeHistoryStatesTimeWindow } from "../../../data/history";
import type { HomeAssistant } from "../../../types";
import { findEntities } from "../common/find-entities";
import {
  hasConfigChanged,
  hasConfigOrEntitiesChanged,
} from "../common/has-changed";
import { processConfigEntities } from "../common/process-config-entities";
import type { EntityConfig } from "../entity-rows/types";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import type { MapCardConfig } from "./types";
import "../../../components/ha-icon-button-group";
import "../../../components/ha-icon-button-toggle";
import { showMapLayerDialog } from "../../../dialogs/map-layer/show-dialog-map-layer";
import {
  CYCLEMAP,
  CYCLOSM,
  HUMANITARIAN,
  STANDARD,
  TRANSPORTMAP,
} from "../../../data/map_layer";
import { showMapSearchDialog } from "../../../dialogs/map-layer/show-dialog-map-search";
import { showConfirmationDialog } from "../custom-card-helpers";
import { fireEvent } from "../../../common/dom/fire_event";

export const DEFAULT_HOURS_TO_SHOW = 0;
export const DEFAULT_ZOOM = 14;

interface MapEntityConfig extends EntityConfig {
  label_mode?: "state" | "name";
  focus?: boolean;
}

interface GeoEntity {
  entity_id: string;
  focus: boolean;
}

@customElement("hui-osm-card")
class HuiOSMCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public layout?: string;

  @state() private _stateHistory?: HistoryStates;

  @state()
  private _config?: MapCardConfig;

  @query("ha-osm")
  private _map?: HaOSM;

  private _configEntities?: MapEntityConfig[];

  @state() private _mapEntities: HaMapEntity[] = [];

  private _colorDict: Record<string, string> = {};

  private _colorIndex = 0;

  @state() private _error?: { code: string; message: string };

  private _subscribed?: Promise<(() => Promise<void>) | void>;

  @state() private _filter?: string;

  public setConfig(config: MapCardConfig): void {
    if (!config) {
      throw new Error("Error in card configuration.");
    }

    if (!config.entities?.length && !config.geo_location_sources) {
      throw new Error(
        "Either entities or geo_location_sources must be specified"
      );
    }
    if (config.entities && !Array.isArray(config.entities)) {
      throw new Error("Entities need to be an array");
    }
    if (
      config.geo_location_sources &&
      !Array.isArray(config.geo_location_sources)
    ) {
      throw new Error("Parameter geo_location_sources needs to be an array");
    }

    this._config = config;
    this._configEntities = config.entities
      ? processConfigEntities<MapEntityConfig>(config.entities)
      : [];
    this._mapEntities = this._getMapEntities();
  }

  public getCardSize(): number {
    if (!this._config?.aspect_ratio) {
      return 7;
    }

    const ratio = parseAspectRatio(this._config.aspect_ratio);
    const ar =
      ratio && ratio.w > 0 && ratio.h > 0
        ? `${((100 * ratio.h) / ratio.w).toFixed(2)}`
        : "100";

    return 1 + Math.floor(Number(ar) / 25) || 3;
  }

  public static async getConfigElement() {
    await import("../editor/config-elements/hui-map-card-editor");
    return document.createElement("hui-map-card-editor");
  }

  public static getStubConfig(
    hass: HomeAssistant,
    entities: string[],
    entitiesFallback: string[]
  ): MapCardConfig {
    const includeDomains = ["device_tracker"];
    const maxEntities = 2;
    const foundEntities = findEntities(
      hass,
      maxEntities,
      entities,
      entitiesFallback,
      includeDomains
    );

    return { type: "map", entities: foundEntities, theme_mode: "auto" };
  }

  protected render() {
    if (!this._config) {
      return nothing;
    }
    if (this._error) {
      return html`<ha-alert alert-type="error">
        ${this.hass.localize("ui.components.map.error")}: ${this._error.message}
        (${this._error.code})
      </ha-alert>`;
    }

    const isDarkMode =
      this._config.dark_mode || this._config.theme_mode === "dark"
        ? true
        : this._config.theme_mode === "light"
          ? false
          : this.hass.themes.darkMode;

    const themeMode =
      this._config.theme_mode || (this._config.dark_mode ? "dark" : "auto");

    return html`
      <ha-card id="card" .header=${this._config.title}>
        <div id="root">
          <ha-osm
            .hass=${this.hass}
            .entities=${this._mapEntities}
            .zoom=${this._config.default_zoom ?? DEFAULT_ZOOM}
            .paths=${this._getHistoryPaths(this._config, this._stateHistory)}
            .autoFit=${this._config.auto_fit || false}
            .fitZones=${this._config.fit_zones}
            .themeMode=${themeMode}
            interactiveZones
            renderPassive
          ></ha-osm>
          <search-input-outlined
            id="search-bar"
            .hass=${this.hass}
            @value-changed=${this._handleSearchInputChange}
            @keypress=${this._handleSearch}
            .label=${this.hass.localize(
              "ui.panel.lovelace.editor.edit_card.search_cards"
            )}
          ></search-input-outlined>
          <ha-icon-button-group tabindex="0">
            <ha-icon-button-toggle
              .label=${this.hass.localize(
                `ui.panel.lovelace.cards.map.reset_focus`
              )}
              .path=${mdiImageFilterCenterFocus}
              style=${isDarkMode ? "color:#ffffff" : "color:#000000"}
              @click=${this._fitMap}
            ></ha-icon-button-toggle>
            <ha-icon-button-toggle
              .label=${this.hass.localize(
                `ui.panel.lovelace.cards.map.change_layer`
              )}
              .path=${mdiLayersTriple}
              style=${isDarkMode ? "color:#ffffff" : "color:#000000"}
              @click=${this._changeLayer}
            ></ha-icon-button-toggle>
            <ha-icon-button-toggle
              .label=${this.hass.localize(
                `ui.panel.lovelace.cards.map.share_location`
              )}
              .path=${mdiShare}
              style=${isDarkMode ? "color:#ffffff" : "color:#000000"}
              @click=${this._shareLocation}
            ></ha-icon-button-toggle>
            <ha-icon-button-toggle
              .label=${this.hass.localize(
                `ui.panel.lovelace.cards.map.navigation`
              )}
              .path=${mdiNearMe}
              style=${isDarkMode ? "color:#ffffff" : "color:#000000"}
              @click=${this._openNavigationDialog}
            ></ha-icon-button-toggle>
          </ha-icon-button-group>
          <div slot="heading">Dialog Title</div>
          <ha-dialog id="layer-dialog"> </ha-dialog>
        </div>
      </ha-card>
    `;
  }

  protected shouldUpdate(changedProps: PropertyValues) {
    if (!changedProps.has("hass") || changedProps.size > 1) {
      return true;
    }

    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;

    if (!oldHass || !this._configEntities) {
      return true;
    }

    if (oldHass.themes.darkMode !== this.hass.themes.darkMode) {
      return true;
    }

    if (changedProps.has("_stateHistory")) {
      return true;
    }

    if (this._config?.geo_location_sources) {
      if (oldHass.states !== this.hass.states) {
        return true;
      }
    }

    return this._config?.entities
      ? hasConfigOrEntitiesChanged(this, changedProps)
      : hasConfigChanged(this, changedProps);
  }

  protected willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);
    if (
      changedProps.has("hass") &&
      this._config?.geo_location_sources &&
      !deepEqual(
        this._getSourceEntities(changedProps.get("hass")?.states),
        this._getSourceEntities(this.hass.states)
      )
    ) {
      this._mapEntities = this._getMapEntities();
    }
  }

  public connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated && this._configEntities?.length) {
      this._subscribeHistory();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHistory();
  }

  private _subscribeHistory() {
    if (
      !isComponentLoaded(this.hass!, "history") ||
      this._subscribed ||
      !(this._config?.hours_to_show ?? DEFAULT_HOURS_TO_SHOW)
    ) {
      return;
    }
    this._subscribed = subscribeHistoryStatesTimeWindow(
      this.hass!,
      (combinedHistory) => {
        if (!this._subscribed) {
          // Message came in before we had a chance to unload
          return;
        }
        this._stateHistory = combinedHistory;
      },
      this._config!.hours_to_show! ?? DEFAULT_HOURS_TO_SHOW,
      (this._configEntities || []).map((entity) => entity.entity)!,
      false,
      false,
      false
    ).catch((err) => {
      this._subscribed = undefined;
      this._error = err;
    });
  }

  private _unsubscribeHistory() {
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub?.());
      this._subscribed = undefined;
    }
  }

  protected updated(changedProps: PropertyValues): void {
    if (this._configEntities?.length) {
      if (!this._subscribed || changedProps.has("_config")) {
        this._unsubscribeHistory();
        this._subscribeHistory();
      }
    } else {
      this._unsubscribeHistory();
    }
    if (changedProps.has("_config")) {
      this._computePadding();
    }
  }

  private _computePadding(): void {
    const root = this.shadowRoot!.getElementById("root");

    const ignoreAspectRatio = this.layout === "panel" || this.layout === "grid";
    if (!this._config || ignoreAspectRatio || !root) {
      return;
    }

    if (!this._config.aspect_ratio) {
      root.style.paddingBottom = "100%";
      return;
    }

    root.style.height = "auto";

    const ratio = parseAspectRatio(this._config.aspect_ratio);

    root.style.paddingBottom =
      ratio && ratio.w > 0 && ratio.h > 0
        ? `${((100 * ratio.h) / ratio.w).toFixed(2)}%`
        : (root.style.paddingBottom = "100%");
  }

  private _fitMap() {
    this._map?.fitMap();
  }

  private _shareLocation() {
    const currentUrl = window.location.href; // Get the current page URL
    showConfirmationDialog(this, {
      title: "Share Location",
      text: `${currentUrl}`,
      confirm: async () => {
        try {
          await navigator.clipboard.writeText(currentUrl); // Copy URL to clipboard
          showConfirmationDialog(this, {
            title: "Share Location",
            text: "The URL has been copied to your clipboard!",
            confirmText: "OK",
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Failed to copy URL:", error);
        }
      },
    });
  }

  private _handleSearchInputChange(ev: CustomEvent) {
    this._filter = ev.detail.value;
  }

  private async _handleSearch(event: KeyboardEvent): Promise<void> {
    if (event.key !== "Enter") return;

    // console.log("ENTER IS PRESSED");

    const searchterm = this._filter?.trim();
    if (!searchterm) return;
    await this._map?._handleSearchAction(searchterm);
  }

  private async _openNavigationDialog(): Promise<void> {
    const response = await showMapSearchDialog(this, {});
    if (!response) return;
    await this._map?._handleNavigationAction(response[0], response[1]);
  }

  private async _changeLayer(): Promise<void> {
    const response = await showMapLayerDialog(this, {});
    if (response == null) return;
    if (response === STANDARD) {
      this._map?.changeToStandardLayer();
    }
    if (response === CYCLOSM) {
      this._map?.changeToCyclOSMLayer();
    }
    if (response === CYCLEMAP) {
      this._map?.changeToCycleMapLayer();
    }
    if (response === TRANSPORTMAP) {
      this._map?.changeToTransportMapLayer();
    }
    if (response === HUMANITARIAN) {
      this._map?.changeToHotMapLayer();
    }
  }

  private _getColor(entityId: string): string {
    let color = this._colorDict[entityId];
    if (color) {
      return color;
    }
    color = getColorByIndex(this._colorIndex);
    this._colorIndex++;
    this._colorDict[entityId] = color;
    return color;
  }

  private _getSourceEntities(states?: HassEntities): GeoEntity[] {
    if (!states || !this._config?.geo_location_sources) {
      return [];
    }

    const sourceObjs = this._config.geo_location_sources.map((source) =>
      typeof source === "string" ? { source } : source
    );

    const geoEntities: GeoEntity[] = [];
    // Calculate visible geo location sources
    const allSource = sourceObjs.find((s) => s.source === "all");
    for (const stateObj of Object.values(states)) {
      const sourceObj = sourceObjs.find(
        (s) => s.source === stateObj.attributes.source
      );
      if (
        computeDomain(stateObj.entity_id) === "geo_location" &&
        (allSource || sourceObj)
      ) {
        geoEntities.push({
          entity_id: stateObj.entity_id,
          focus: sourceObj
            ? (sourceObj.focus ?? true)
            : (allSource?.focus ?? true),
        });
      }
    }
    return geoEntities;
  }

  private _getMapEntities(): HaMapEntity[] {
    return [
      ...(this._configEntities || []).map((entityConf) => ({
        entity_id: entityConf.entity,
        color: this._getColor(entityConf.entity),
        label_mode: entityConf.label_mode,
        focus: entityConf.focus,
        name: entityConf.name,
      })),
      ...this._getSourceEntities(this.hass?.states).map((entity) => ({
        entity_id: entity.entity_id,
        focus: entity.focus,
        color: this._getColor(entity.entity_id),
      })),
    ];
  }

  private _getHistoryPaths = memoizeOne(
    (
      config: MapCardConfig,
      history?: HistoryStates
    ): HaMapPaths[] | undefined => {
      if (!history || !(config.hours_to_show ?? DEFAULT_HOURS_TO_SHOW)) {
        return undefined;
      }

      const paths: HaMapPaths[] = [];

      for (const entityId of Object.keys(history)) {
        if (computeDomain(entityId) === "zone") {
          continue;
        }
        const entityStates = history[entityId];
        if (!entityStates?.length) {
          continue;
        }
        // filter location data from states and remove all invalid locations
        const points: HaMapPathPoint[] = [];
        for (const entityState of entityStates) {
          const latitude = entityState.a.latitude;
          const longitude = entityState.a.longitude;
          if (!latitude || !longitude) {
            continue;
          }
          const p = {} as HaMapPathPoint;
          p.point = [latitude, longitude] as LatLngTuple;
          p.timestamp = new Date(entityState.lu * 1000);
          points.push(p);
        }

        const entityConfig = this._configEntities?.find(
          (e) => e.entity === entityId
        );
        const name =
          entityConfig?.name ??
          (entityId in this.hass.states
            ? computeStateName(this.hass.states[entityId])
            : entityId);

        paths.push({
          points,
          name,
          fullDatetime: (config.hours_to_show ?? DEFAULT_HOURS_TO_SHOW) > 144,
          color: this._getColor(entityId),
          gradualOpacity: 0.8,
        });
      }
      return paths;
    }
  );

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: "full",
      rows: 4,
      min_columns: 6,
      min_rows: 2,
    };
  }

  static get styles(): CSSResultGroup {
    return css`
      ha-card {
        overflow: hidden;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      ha-osm {
        z-index: 0;
        border: none;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: inherit;
      }

      ha-icon-button-group {
        position: absolute;
        top: 75px;
        left: 3px;
        display: flex;
        flex-direction: column;
        outline: none;
      }

      #root {
        position: relative;
        height: 100%;
      }

      search-input-outlined {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 10;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-osm-card": HuiOSMCard;
  }
}
