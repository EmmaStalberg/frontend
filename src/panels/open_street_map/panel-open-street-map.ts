import { mdiPencil } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { navigate } from "../../common/navigate";
import "../../components/ha-card";
import "../../components/ha-icon-button";
import "../../components/ha-menu-button";
import "../../components/ha-top-app-bar-fixed";
import "../../components/map/ha-osm";
import "../../components/search-input";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";

/**
 * `OpenStreetMapPanel` is a custom web component that integrates OpenStreetMap
 * into the Home Assistant user interface.
 * It provides functionalities for viewing the map, editing zones (admin only),
 * and interacting with the map's features.
 */
@customElement("open-street-map-panel")
class OpenStreetMapPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Object }) public route?: object;

  @property({ type: Object }) public panel?: { config: object };

  /**
   * Renders the OpenStreetMap panel content, including the top app bar, map, and zone editing button.
   *
   * @returns The HTML template for the panel.
   */
  protected render() {
    return html`
      <ha-top-app-bar-fixed class="top-bar">
        <ha-menu-button
          slot="navigationIcon"
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></ha-menu-button>
        <div slot="title">OpenStreetMap Panel</div>
        ${!__DEMO__ && this.hass.user?.is_admin
          ? html`<ha-icon-button
              slot="actionItems"
              .label=${this.hass!.localize("ui.panel.map.edit_zones")}
              .path=${mdiPencil}
              @click=${this._openZonesEditor}
            ></ha-icon-button>`
          : ""}
      </ha-top-app-bar-fixed>
      <ha-osm .hass=${this.hass} autoFit interactiveZones></ha-osm>
    `;
  }

  private _openZonesEditor() {
    navigate("/config/zone?historyBack=1");
  }

  /**
   * Lifecycle method that is invoked before the component updates.
   * It checks if the `hass` property has changed and stores the previous value.
   *
   * @param changedProps The properties that have changed since the last update.
   */
  public willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);
    if (!changedProps.has("hass")) {
      return;
    }
    const _oldHass = changedProps.get("hass") as HomeAssistant | undefined;
  }

  /**
   * Defines the styles for the OpenStreetMap panel, including layout and component-specific styling.
   *
   * @returns An array of CSS styles for the component.
   */
  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        ha-osm {
          height: calc(100vh - var(--header-height));
        }

        .top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        search-input {
          margin-left: auto;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "open-street-map-panel": OpenStreetMapPanel;
  }
}
