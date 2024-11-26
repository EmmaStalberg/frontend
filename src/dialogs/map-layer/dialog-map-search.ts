import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import type { HomeAssistant } from "../../types";
import "../../components/ha-button-menu";
import "../../components/ha-dialog";
import type { UpdateMapSearchDialogParams } from "./show-dialog-map-search";
import "../../components/ha-button-toggle-group";
import "../../components/ha-icon-button-group";
import "../../components/ha-icon-button-toggle";

@customElement("ha-map-search-dialog")
export class MapSearchDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _dialogParams?: UpdateMapSearchDialogParams;

  public showDialog(dialogParams: UpdateMapSearchDialogParams): void {
    this._dialogParams = dialogParams;
  }

  public _dialogClosed(): void {
    this.closeDialog();
  }

  public closeDialog(): void {
    if (!this._dialogParams) {
      return;
    }
    this._dialogParams = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._dialogParams) {
      return nothing;
    }

    return html`
      <ha-dialog
        open
        @closed=${this._dialogClosed}
        escapeKeyAction
        .heading=${this.hass.localize("ui.dialogs.map_search.title")}
      >
        <div class="actions">
          <ha-button @click=${this._searchMap} style="color:#000000"
            >${this.hass.localize("ui.dialogs.map_search.search")}
          </ha-button>
          >
        </div>
      </ha-dialog>
    `;
  }

  private _searchMap(): void {
    // this._dialogParams?.confirm?.(STANDARD);
    // handle search action 
    this.closeDialog();
  }

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
    "ha-map-search-dialog": MapLayerDialog;
  }
}
