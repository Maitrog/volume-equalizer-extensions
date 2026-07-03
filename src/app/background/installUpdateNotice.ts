import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export interface InstallUpdateDetails {
  reason: chrome.runtime.OnInstalledReason;
}

export const prepareInstallUpdateNotice = async (
  details: InstallUpdateDetails
): Promise<void> => {
  if (!["install", "update"].includes(details.reason)) return;

  await chrome.storage.local.set({
    [STORAGE_KEYS.INSTALL_UPDATE_NOTICE]: {
      reason: details.reason,
      version: chrome.runtime.getManifest().version,
    },
  });
};
