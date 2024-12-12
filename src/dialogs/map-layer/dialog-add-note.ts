import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import "../../components/ha-control-button";
import "../../components/ha-textfield";
import type { HaTextField } from "../../components/ha-textfield";
import type { HomeAssistant } from "../../types";
import type { HassDialog } from "../make-dialog-manager";
import type { AddNoteDialogParams } from "./show-add-note";
import "../../components/ha-dialog";

@customElement("dialog-add-note")
export class DialogAddNote
  extends LitElement
  implements HassDialog<AddNoteDialogParams>
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _dialogParams?: AddNoteDialogParams;

  @state() private _existingNote?: string; 

  @query("#note") private _input?: HaTextField;

  public async showDialog(dialogParams: AddNoteDialogParams): Promise<void> {
    this._dialogParams = dialogParams;
    this._existingNote = dialogParams.existingNote || "";
    const noteTest = this._existingNote;
    console.log("existing note is this ", this._dialogParams.existingNote)
    await this.updateComplete;
  }

  public closeDialog(): void {
    this._dialogParams = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _submit(): void {
    this._dialogParams?.submit?.(this._input?.value ?? "");
    this.closeDialog();
  }

  private _cancel(): void {
    this._dialogParams?.cancel?.();
    this.closeDialog();
  }

  protected render() {
    if (!this._dialogParams || !this.hass) {
      return nothing;
    }
    return html`
      <ha-dialog
        open
        @closed=${this._cancel}
        .heading=${this.hass.localize("ui.dialogs.add_note.title")}
      >
        <ha-textfield
          class="input"
          dialogInitialFocus
          id="note"
          .value=${this._existingNote}
          .label=${this.hass.localize("ui.dialogs.add_note.input_label")}
          type="text"
          inputmode="text"
        ></ha-textfield>
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
      ha-dialog {
        /* Place above other dialogs */
        --dialog-z-index: 104;
      }
      ha-textfield {
        width: 100%;
        max-width: 300px;
        margin: auto;
      }
      .container {
        display: flex;
        align-items: center;
        flex-direction: column;
      }
      .keypad {
        --keypad-columns: 3;
        margin-top: 12px;
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(var(--keypad-columns), auto);
        grid-auto-rows: auto;
        grid-gap: 24px;
        justify-items: center;
        align-items: center;
      }
      .clear {
        grid-row-start: 4;
        grid-column-start: 0;
      }
      @media all and (max-height: 450px) {
        .keypad {
          --keypad-columns: 6;
        }
        .clear {
          grid-row-start: 1;
          grid-column-start: 6;
        }
      }

      ha-control-button {
        width: 56px;
        height: 56px;
        --control-button-border-radius: 28px;
        --mdc-icon-size: 24px;
        font-size: 24px;
      }
      .submit {
        --control-button-background-color: var(--green-color);
        --control-button-icon-color: var(--green-color);
      }
      .clear {
        --control-button-background-color: var(--red-color);
        --control-button-icon-color: var(--red-color);
      }
      .hidden {
        display: none;
      }
      .buttons {
        margin-top: 12px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-add-note": DialogAddNote;
  }
}
