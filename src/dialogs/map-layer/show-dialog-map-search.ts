import { fireEvent } from "../../common/dom/fire_event";

// TODO - need to change this method, now same as layer
export interface UpdateMapSearchDialogParams {
  submit?: (locationInfo?: [string, string, string]) => false;
  cancel?: () => void;
}

export const showMapSearchDialog = (
  element: HTMLElement,
  dialogParams: UpdateMapSearchDialogParams
) =>
  new Promise<[string, string, string] | null>((resolve) => {
    const origSubmit = dialogParams.submit;
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
        submit: (locationInfo: [string, string, string]) => {
          resolve(locationInfo);
          if (origSubmit) {
            origSubmit(locationInfo);
          }
        },
      },
    });
  });
