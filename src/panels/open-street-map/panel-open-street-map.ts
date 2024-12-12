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
 * Represents the OpenStreetMap panel in the Home Assistant interface.
 * This component integrates a map and provides a search functionality to interact with OpenStreetMap data.
 * It is responsible for displaying the map, allowing zone editing (for admins), and handling search functionality.
 */

@customElement("open-street-map-panel")
class OpenStreetMapPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Object }) public route?: object;

  @property({ type: Object }) public panel?: { config: object };

  @state() private _filter?: string; // EMMA

  protected render() {
    return html`
    <div class="container"></div>
      <ha-top-app-bar-fixed>
        <ha-menu-button
          slot="navigationIcon"
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></ha-menu-button>
        <div slot="title">OpenStreetMap Panel</div>
        ${
          !__DEMO__ && this.hass.user?.is_admin
            ? html`<ha-icon-button
                slot="actionItems"
                .label=${this.hass!.localize("ui.panel.map.edit_zones")}
                .path=${mdiPencil}
                @click=${this._openZonesEditor}
              ></ha-icon-button>`
            : ""
        }
        <ha-osm .hass=${this.hass} autoFit interactiveZones></ha-osm>
      </ha-top-app-bar-fixed>

      <search-input
        class="search-bar"
        .hass=${this.hass}
        .filter=${this._filter}
        @value-changed=${this._handleSearch}
      >
      </search-input>
    </div>
    `;
  }

  /**
   * Handles the search input and triggers the OpenStreetMap search service.
   * When the user enters a search term, the method sends a request to the Home Assistant backend
   * to search for the address or location in OpenStreetMap.
   *
   * @param event The custom event containing the search term.
   */
  //EMMA - also check hui osm card
  private async _handleSearch(event: CustomEvent): Promise<void> {
    const searchterm = event.detail.value.toLowerCase().trim();
    this._filter = searchterm;
    if (!searchterm) return;

    const results = await this.hass.callService("openstreetmap", "search", {
      query: searchterm,
    });
  }

  private _openZonesEditor() {
    navigate("/config/zone?historyBack=1");
  }

  /**
   * Lifecycle method that runs before the component updates.
   * It checks if the Home Assistant instance (`hass`) has changed and stores the previous value.
   * This can be useful for handling changes in the Home Assistant instance.
   *
   * @param changedProps The properties that have changed.
   */
  public willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);
    if (!changedProps.has("hass")) {
      return;
    }
    const _oldHass = changedProps.get("hass") as HomeAssistant | undefined;
  }

  /**
   * Defines the styles for the OpenStreetMap panel.
   * This includes styling for the map and the search bar's positioning.
   *
   * @returns An array of CSS styles applied to the component.
   */
  "Added .top-bar and search-input to try and place search-input to the left";
  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        ha-osm {
          height: calc(100vh - var(--header-height));
        }

        .container {
          position: relative;
        }

        .search-bar {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 10;
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
