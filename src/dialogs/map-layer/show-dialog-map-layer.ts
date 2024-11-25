import { fireEvent } from "../../common/dom/fire_event";

export interface UpdateMapLayerDialogParams {
  confirm?: (layer?: string) => false;
  cancel?: () => void;
}

export const showMapLayerDialog = (
  element: HTMLElement,
  dialogParams: UpdateMapLayerDialogParams
) =>
  new Promise<string | null>((resolve) => {
    const origConfirm = dialogParams.confirm;
    const origCancel = dialogParams.cancel;

    fireEvent(element, "show-dialog", {
      dialogTag: "ha-map-layer-dialog",
      dialogImport: () => import("./dialog-map-layer"),
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
