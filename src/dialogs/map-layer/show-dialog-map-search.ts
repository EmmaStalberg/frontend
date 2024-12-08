import { fireEvent } from "../../common/dom/fire_event";

// TODO - need to change this method, now same as layer
export interface UpdateMapSearchDialogParams {
  submit?: (locationInfo?: [string, string]) => false;
  cancel?: () => void;
}

export const showMapSearchDialog = (
  element: HTMLElement,
  dialogParams: UpdateMapSearchDialogParams
) =>
  new Promise<[string, string] | null>((resolve) => {
    const origConfirm = dialogParams.submit;
    const origCancel = dialogParams.cancel;

    fireEvent(element, "show-dialog", {
      dialogTag: "ha-map-search-dialog",
      dialogImport: () => import("./dialog-map-search"),
      dialogParams: {
        ...dialogParams,
        cancel: () => {
          resolve(null);
          if (origCancel) {
            origCancel();
          }
        },
        confirm: (locationInfo: [string, string]) => {
          resolve(locationInfo);
          if (origConfirm) {
            origConfirm(locationInfo);
          }
        },
      },
    });
  });
