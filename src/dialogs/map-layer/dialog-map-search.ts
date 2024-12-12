import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import type { HomeAssistant } from "../../types";
import "../../components/ha-button-menu";
import "../../components/ha-dialog";
import type { UpdateMapSearchDialogParams } from "./show-dialog-map-search";
import "../../components/ha-button-toggle-group";
import "../../components/ha-icon-button-group";
import "../../components/ha-icon-button-toggle";
import "../../components/ha-textfield";
import type { HaTextField } from "../../components/ha-textfield";
import "@material/mwc-list/mwc-list-item";
import "../../components/ha-select";

@customElement("ha-map-search-dialog")
export class MapSearchDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _dialogParams?: UpdateMapSearchDialogParams;

  @query("#from") private _inputFrom?: HaTextField;

  @query("#to") private _inputTo?: HaTextField;

  @query("#transportation-mode")
  private _transportationMode?: HTMLSelectElement;

  public showDialog(dialogParams: UpdateMapSearchDialogParams): void {
    this._dialogParams = dialogParams;
  }

  public closeDialog(): void {
    this._dialogParams = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _submit(): void {
    const valueFrom = this._inputFrom?.value ?? "";
    const valueTo = this._inputTo?.value ?? "";
    const transportMode = this._transportationMode?.value ?? "car";
    this._dialogParams?.submit?.([valueFrom, valueTo, transportMode]);
    this.closeDialog();
  }

  private _cancel(): void {
    this._dialogParams?.cancel?.();
    this.closeDialog();
  }

  private _handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      this._submit(); // Prevent the default behavior
    }
  }

  protected render() {
    if (!this._dialogParams || !this.hass) {
      return nothing;
    }

    return html`
      <ha-dialog
        open
        @closed=${this._cancel}
        @keydown=${this._handleKeyDown}
        escapeKeyAction
        .heading=${this.hass.localize("ui.dialogs.map_search.title")}
      >
        <div id="textInput">
          <ha-textfield
            class="input"
            dialogInitialFocus
            id="from"
            placeholder="Leave blank to use current location"
            .label=${this.hass.localize("ui.dialogs.map_search.input_from")}
            type="text"
            inputmode="text"
          ></ha-textfield>
          <ha-textfield
            class="input"
            id="to"
            placeholder="Leave blank to use current location"
            .label=${this.hass.localize("ui.dialogs.map_search.input_to")}
            type="text"
            inputmode="text"
          ></ha-textfield>
          <select id="transportation-mode">
            <option value="car">Car</option>
            <option value="bicycle">Bicycle</option>
            <option value="foot">Foot</option>
          </select>
        </div>
        <ha-button slot="secondaryAction" dialogAction="cancel">
          ${this.hass.localize("ui.common.cancel")}
        </ha-button>
        <ha-button @click=${this._submit} slot="primaryAction">
          ${this.hass.localize("ui.common.submit")}
        </ha-button>
      </ha-dialog>
    `;
  }

  static get styles(): CSSResultGroup {
    return css`
      p {
        margin: 0;
        color: var(--primary-text-color);
      }
      p.helper-text {
        font-size: 14px;
        color: var(--secondary-text-color);
        margin: 8px 0 0;
        text-align: center;
      }

      ha-dialog {
        /* Place above other dialogs */
        --dialog-z-index: 104;
      }
      ha-textfield,
      select {
        width: 100%;
        max-width: 300px;
        margin: auto;
      }
      @media all and (min-width: 600px) {
        ha-dialog {
          --mdc-dialog-min-width: 400px;
        }
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-map-search-dialog": MapSearchDialog;
  }
}
