import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export interface InstallUpdateNotice {
  reason: "install" | "update";
  version: string;
}

export interface PendingInstallUpdateNoticeOptions {
  stored: Record<string, unknown>;
  currentVersion: string;
  isToolkitWindow: boolean;
}

export const getPendingInstallUpdateNotice = ({
  stored,
  currentVersion,
  isToolkitWindow,
}: PendingInstallUpdateNoticeOptions): InstallUpdateNotice | null => {
  const notice = stored[STORAGE_KEYS.INSTALL_UPDATE_NOTICE];
  if (isToolkitWindow) return null;
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
}) => {
  const closeInstallUpdateNotice = async (): Promise<void> => {
    deps.modal.style.display = "none";
    await chrome.storage.local.remove(STORAGE_KEYS.INSTALL_UPDATE_NOTICE);
  };

  deps.closeButton.addEventListener("click", () => {
    void closeInstallUpdateNotice();
  });

  return {
    showInstallUpdateNotice: (notice: InstallUpdateNotice | null) => {
      if (notice?.reason !== "update") return;

      deps.modal.style.display = "block";
    },
  };
};
