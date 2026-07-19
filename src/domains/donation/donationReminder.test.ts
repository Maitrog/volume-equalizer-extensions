import {
  getNextDonationReminderAt,
  isDonationReminderDue,
} from "./donationReminder";

const DAY_MS = 24 * 60 * 60 * 1000;

test("schedules both inclusive interval boundaries", () => {
  expect(getNextDonationReminderAt(1_000, 0)).toBe(1_000 + 7 * DAY_MS);
  expect(getNextDonationReminderAt(1_000, 0.999999)).toBe(
    1_000 + 14 * DAY_MS,
  );
});

test("recognizes only finite timestamps that are due", () => {
  expect(isDonationReminderDue(999, 1_000)).toBe(true);
  expect(isDonationReminderDue(1_001, 1_000)).toBe(false);
  expect(isDonationReminderDue("999", 1_000)).toBe(false);
  expect(isDonationReminderDue(Number.NaN, 1_000)).toBe(false);
});
