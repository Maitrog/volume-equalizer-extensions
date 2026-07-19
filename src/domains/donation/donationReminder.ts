const DAY_MS = 24 * 60 * 60 * 1000;

export const getNextDonationReminderAt = (
  now = Date.now(),
  random = Math.random(),
): number => now + (7 + Math.floor(random * 8)) * DAY_MS;

export const isDonationReminderDue = (
  value: unknown,
  now = Date.now(),
): boolean =>
  typeof value === "number" && Number.isFinite(value) && value <= now;
