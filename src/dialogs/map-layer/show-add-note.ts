import { fireEvent } from "../../common/dom/fire_event";

export interface AddNoteDialogParams {
  existingNote?: string;
  submit?: (layer?: string) => void;
  cancel?: () => void;
}

export const showAddNoteDialog = (
  element: HTMLElement,
  dialogParams: AddNoteDialogParams
) =>
  new Promise<string | null>((resolve) => {
    const origSubmit = dialogParams.submit;
    const origCancel = dialogParams.cancel;

    fireEvent(element, "show-dialog", {
      dialogTag: "dialog-add-note",
      dialogImport: () => import("./dialog-add-note"),
      dialogParams: {
        ...dialogParams,
        existingNote: dialogParams.existingNote || "",
        cancel: () => {
          resolve(null);
          if (origCancel) {
            origCancel();
          }
        },
        submit: (layer: string) => {
          resolve(layer);
          if (origSubmit) {
            origSubmit(layer);
          }
        },
      },
    });
  });
