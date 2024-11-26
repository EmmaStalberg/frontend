import { fireEvent } from "../../common/dom/fire_event";

//TODO - need to change this method, now same as layer
export interface UpdateMapSearchDialogParams {
  confirm?: (layer?: string) => false;
  cancel?: () => void;
}

export const showMapSearchDialog = (
  element: HTMLElement,
  dialogParams: UpdateMapLayerDialogParams
) =>
  new Promise<string | null>((resolve) => {
    const origConfirm = dialogParams.confirm;
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
        confirm: (layer: string) => {
          resolve(layer);
          if (origConfirm) {
            origConfirm(layer);
          }
        },
      },
    });
  });
