import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createDonationReminderView } from "./donationReminderView";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.stubGlobal("chrome", {
    storage: { local: { set: vi.fn(async () => undefined) } },
  });
});

afterEach(() => vi.unstubAllGlobals());

test("shows only when the stored reminder is due", () => {
  const modal = { style: { display: "none" } } as HTMLElement;
  const closeButton = {
    addEventListener: vi.fn(),
    focus: vi.fn(),
  } as unknown as HTMLElement;
  const view = createDonationReminderView({
    modal,
    closeButton,
    now: () => 1_000,
  });

  view.showDonationReminder(1_001);
  expect(modal.style.display).toBe("none");
  view.showDonationReminder(1_000);
  expect(modal.style.display).toBe("block");
  expect(closeButton.focus).toHaveBeenCalledOnce();
});

test("dismisses and schedules the next reminder", async () => {
  let click: EventListener = () => undefined;
  const modal = { style: { display: "block" } } as HTMLElement;
  const closeButton = {
    addEventListener: vi.fn((_type: string, listener: EventListener) => {
      click = listener;
    }),
  } as unknown as HTMLElement;
  createDonationReminderView({
    modal,
    closeButton,
    now: () => 1_000,
    random: () => 0,
  });

  click(new Event("click"));

  expect(modal.style.display).toBe("none");
  await vi.waitFor(() =>
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.DONATION_REMINDER_AT]: 1_000 + 7 * DAY_MS,
    }),
  );
});
