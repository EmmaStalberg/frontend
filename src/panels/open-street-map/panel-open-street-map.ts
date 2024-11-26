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

@customElement("open-street-map-panel")
class OpenStreetMapPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Object }) public route?: object;

  @property({ type: Object }) public panel?: { config: object };

  @state() private _filter?: string; // EMMA

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

        <search-input
          slot="actionItems"
          .hass=${this.hass}
          .filter=${this._filter}
          @value-changed=${this._handleSearch}
        >
        </search-input>
      </ha-top-app-bar-fixed>
    `;
  }

  // <ha-osm .hass=${this.hass} autoFit interactiveZones></ha-osm. Add back over
  // search-input if needed.

  // Maybe needed to update when searching??
  // <search-input
  //       .filter=${this.searchTerm}
  //       @value-changed=${this._handleSearch}
  //       label="Search for an address"
  //       .hass=${this.hass}
  //       autofocus
  //     ></search-input>
  //     <div class="results">
  //       ${this.results.map(
  //         (result) => html`<div class="result-item">${result.display_name}</div>`
  //       )}
  //     </div>
  //   `;

  // eslint-disable-next-line spaced-comment
  //EMMA - also check hui osm card
  private async _handleSearch(event: CustomEvent): Promise<void> {
    const searchterm = event.detail.value.toLowerCase().trim();
    this._filter = searchterm;
    if (!searchterm) return;

    // call service from core
    // eslint-disable-next-line unused-imports/no-unused-vars
    const results = await this.hass.callService("openstreetmap", "search", {
      query: searchterm,
    });
  }

  private _openZonesEditor() {
    navigate("/config/zone?historyBack=1");
  }

  public willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);
    if (!changedProps.has("hass")) {
      return;
    }
    const _oldHass = changedProps.get("hass") as HomeAssistant | undefined;
  }

  "Added .top-bar and search-input to try and place search-input to the left";

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
