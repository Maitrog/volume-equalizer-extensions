import { getNextDonationReminderAt } from "../../domains/donation/donationReminder";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export interface InstallUpdateDetails {
  reason: chrome.runtime.OnInstalledReason;
}

export const prepareInstallUpdateNotice = async (
  details: InstallUpdateDetails,
  now = Date.now(),
  random = Math.random(),
): Promise<void> => {
  if (!["install", "update"].includes(details.reason)) return;

  await chrome.storage.local.set({
    [STORAGE_KEYS.INSTALL_UPDATE_NOTICE]: {
      reason: details.reason,
      version: chrome.runtime.getManifest().version,
    },
    [STORAGE_KEYS.DONATION_REMINDER_AT]: getNextDonationReminderAt(now, random),
  });
};
