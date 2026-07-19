import {
  getNextDonationReminderAt,
  isDonationReminderDue,
} from "../../domains/donation/donationReminder";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export interface DonationReminderView {
  showDonationReminder(nextReminderAt: unknown): void;
}

export const createDonationReminderView = (deps: {
  modal: HTMLElement;
  closeButton: HTMLElement;
  now?: () => number;
  random?: () => number;
}): DonationReminderView => {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;

  deps.closeButton.addEventListener("click", () => {
    deps.modal.style.display = "none";
    void chrome.storage.local.set({
      [STORAGE_KEYS.DONATION_REMINDER_AT]: getNextDonationReminderAt(
        now(),
        random(),
      ),
    });
  });

  return {
    showDonationReminder: (nextReminderAt) => {
      if (isDonationReminderDue(nextReminderAt, now())) {
        deps.modal.style.display = "block";
        deps.closeButton.focus();
      }
    },
  };
};
