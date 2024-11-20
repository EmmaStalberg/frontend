import type { PropertyValues } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import "../../components/ha-card";
import "../../components/ha-icon-button";
import "../../components/ha-menu-button";
import "../../components/ha-top-app-bar-fixed";
import "../../components/map/ha-map";
import type { HomeAssistant } from "../../types";

@customElement("open-street-map-panel")
class OpenStreetMapPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Object }) public route?: object;

  @property({ type: Object }) public panel?: { config: object };

  protected render() {
    return html`
      <ha-top-app-bar-fixed>
        <ha-menu-button
          slot="navigationIcon"
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></ha-menu-button>
        <div slot="title">OpenStreetMap Panel</div>
        <ha-card elevation="2">
          <p>There are ${Object.keys(this.hass.states).length} entities.</p>
          <p>Testing out the OpenStreetMap.</p>
          <p>The screen is${this.narrow ? "" : " not"} narrow.</p>
          <div>Configured panel config:</div>
          <pre>${JSON.stringify(this.panel?.config, undefined, 2)}</pre>
          <div>Current route:</div>
          <pre>${JSON.stringify(this.route, undefined, 2)}</pre>
        </ha-card>
      </ha-top-app-bar-fixed>
    `;
  }

  public willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);
  }

  static get styles() {
    return css`
      :host {
        background-color: #fafafa;
        padding: 16px;
        display: block;
      }
      wired-card {
        background-color: white;
        padding: 16px;
        display: block;
        font-size: 18px;
        max-width: 600px;
        margin: 0 auto;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "open-street-map-panel": OpenStreetMapPanel;
  }
}
