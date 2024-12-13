import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import type { HomeAssistant } from "../../types";
import "../../components/ha-button-menu";
import "../../components/ha-dialog";
import type { UpdateMapLayerDialogParams } from "./show-dialog-map-layer";
import "../../components/ha-button-toggle-group";
import "../../components/ha-icon-button-group";
import "../../components/ha-icon-button-toggle";
import {
  CYCLEMAP,
  CYCLOSM,
  STANDARD,
  TRANSPORTMAP,
  HUMANITARIAN,
} from "../../data/map_layer";

/**
 * A dialog component to select and apply map layers.
 * The component allows the user to select from different map layers such as Standard, CyclOSM, CycleMap, TransportMap, and Humanitarian.
 */
@customElement("ha-map-layer-dialog")
export class MapLayerDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _dialogParams?: UpdateMapLayerDialogParams;

  /**
   * Opens the dialog and passes the parameters for updating the map layer.
   *
   * @param dialogParams - The parameters for the dialog that include a confirm callback.
   */
  public showDialog(dialogParams: UpdateMapLayerDialogParams): void {
    this._dialogParams = dialogParams;
  }

  /**
   * Closes the dialog and triggers the 'dialog-closed' event.
   */
  public _dialogClosed(): void {
    this.closeDialog();
  }

  /**
   * Resets the dialog parameters and closes the dialog.
   */
  public closeDialog(): void {
    if (!this._dialogParams) {
      return;
    }
    this._dialogParams = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  /**
   * Renders the dialog's HTML content.
   * Displays a set of buttons for selecting the map layer.
   */
  protected render() {
    if (!this._dialogParams) {
      return nothing;
    }

    return html`
      <ha-dialog
        open
        @closed=${this._dialogClosed}
        escapeKeyAction
        .heading=${this.hass.localize("ui.dialogs.map_layer.title")}
      >
        <div class="actions">
          <ha-button @click=${this._showStandardLayer} style="color:#000000"
            >${this.hass.localize("ui.dialogs.map_layer.standard")}
          </ha-button>

          <ha-button @click=${this._showCyclOSMLayer}
            >${this.hass.localize("ui.dialogs.map_layer.cyclosm")}
          </ha-button>

          <ha-button @click=${this._showcCyclemapLayerList}
            >${this.hass.localize("ui.dialogs.map_layer.cyclemap")}</ha-button
          >

          <ha-button @click=${this._showTransportmapLayerList}
            >${this.hass.localize(
              "ui.dialogs.map_layer.transportmap"
            )}</ha-button
          >

          <ha-button @click=${this._showHumanitarianLayerList}
            >${this.hass.localize(
              "ui.dialogs.map_layer.humanitarian"
            )}</ha-button
          >
        </div>
      </ha-dialog>
    `;
  }

  /**
   * Handles the selection of the Standard map layer.
   * Confirms the selection and closes the dialog.
   */
  private _showStandardLayer(): void {
    this._dialogParams?.confirm?.(STANDARD);
    this.closeDialog();
  }

  /**
   * Handles the selection of the CyclOSM map layer.
   * Confirms the selection and closes the dialog.
   */
  private _showCyclOSMLayer(): void {
    this._dialogParams?.confirm?.(CYCLOSM);
    this.closeDialog();
  }

  /**
   * Handles the selection of the Cycle map layer.
   * Confirms the selection and closes the dialog.
   */
  private _showcCyclemapLayerList(): void {
    this._dialogParams?.confirm?.(CYCLEMAP);
    this.closeDialog();
  }

  /**
   * Handles the selection of the Transport map layer.
   * Confirms the selection and closes the dialog.
   */
  private _showTransportmapLayerList(): void {
    this._dialogParams?.confirm?.(TRANSPORTMAP);
    this.closeDialog();
  }

  /**
   * Handles the selection of the Humanitarian map layer.
   * Confirms the selection and closes the dialog.
   */
  private _showHumanitarianLayerList(): void {
    this._dialogParams?.confirm?.(HUMANITARIAN);
    this.closeDialog();
  }

  /**
   * Returns the styles for the dialog, including responsive behavior and appearance for buttons and the dialog itself.
   */
  static get styles(): CSSResultGroup {
    return css`
      p {
        margin: 0;
        color: var(--primary-text-color);
      }
      ha-dialog {
        /* Place above other dialogs */
        --dialog-z-index: 104;
      }
      @media all and (min-width: 600px) {
        ha-dialog {
          --mdc-dialog-min-width: 400px;
        }
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        flex-direction: column;
        justify-content: center;
      }

      ha-button {
        color: #000000;
        font-size: 16px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-map-layer-dialog": MapLayerDialog;
  }
}
