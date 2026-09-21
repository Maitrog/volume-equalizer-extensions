import { attachModalFocus } from "./modalFocus";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export interface InstallUpdateNotice {
  reason: "install" | "update";
  version: string;
}

export interface PendingInstallUpdateNoticeOptions {
  stored: Record<string, unknown>;
  currentVersion: string;
}

export const getPendingInstallUpdateNotice = ({
  stored,
  currentVersion,
}: PendingInstallUpdateNoticeOptions): InstallUpdateNotice | null => {
  const notice = stored[STORAGE_KEYS.INSTALL_UPDATE_NOTICE];
  if (!notice || typeof notice !== "object") return null;

  const pendingNotice = notice as Partial<InstallUpdateNotice>;
  if (pendingNotice.reason !== "install" && pendingNotice.reason !== "update") {
    return null;
  }
  if (pendingNotice.version !== currentVersion) return null;

  return {
    reason: pendingNotice.reason,
    version: pendingNotice.version,
  };
};

export const createInstallUpdateNoticeView = (deps: {
  modal: HTMLElement;
  closeButton: HTMLElement;
  topCloseButton: HTMLElement;
  returnFocusTo: HTMLElement;
}) => {
  const modalFocus = attachModalFocus(deps.modal, deps.returnFocusTo);
  deps.modal.addEventListener("modal-closed", () => {
    void chrome.storage.local.remove(STORAGE_KEYS.INSTALL_UPDATE_NOTICE);
  });
  const closeInstallUpdateNotice = async (): Promise<void> => {
    modalFocus.close();
  };

  [deps.closeButton, deps.topCloseButton].forEach((button) => {
    button.addEventListener("click", () => {
      void closeInstallUpdateNotice();
    });
  });

  return {
    showInstallUpdateNotice: (notice: InstallUpdateNotice | null) => {
      if (notice?.reason !== "update") return;

      modalFocus.open();
    },
  };
};
