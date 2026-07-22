import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { prepareInstallUpdateNotice } from "./installUpdateNotice";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.stubGlobal("chrome", {
    runtime: { getManifest: () => ({ version: "1.8.0" }) },
    storage: { local: { set: vi.fn(async () => undefined) } },
  });
});

afterEach(() => vi.unstubAllGlobals());

test.each(["install", "update"] as const)(
  "schedules the donation reminder on %s",
  async (reason) => {
    await prepareInstallUpdateNotice({ reason }, 1_000, 0);

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.INSTALL_UPDATE_NOTICE]: {
        reason,
        version: "1.8.0",
      },
      [STORAGE_KEYS.DONATION_REMINDER_AT]: 1_000 + 7 * DAY_MS,
    });
  },
);
