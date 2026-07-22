import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import {
  createInstallUpdateNoticeView,
  getPendingInstallUpdateNotice,
} from "./installUpdateNoticeView";

describe("getPendingInstallUpdateNotice", () => {
  const stored = {
    [STORAGE_KEYS.INSTALL_UPDATE_NOTICE]: {
      reason: "update",
      version: "1.7.0",
    },
  };

  it("returns the current install/update notice outside toolkit window mode", () => {
    expect(
      getPendingInstallUpdateNotice({
        stored,
        currentVersion: "1.7.0",
        isToolkitWindow: false,
      }),
    ).toEqual({
      reason: "update",
      version: "1.7.0",
    });
  });

  it("does not return notices in toolkit window mode", () => {
    expect(
      getPendingInstallUpdateNotice({
        stored,
        currentVersion: "1.7.0",
        isToolkitWindow: true,
      }),
    ).toBeNull();
  });

  it("does not return stale notices for older versions", () => {
    expect(
      getPendingInstallUpdateNotice({
        stored,
        currentVersion: "1.8.0",
        isToolkitWindow: false,
      }),
    ).toBeNull();
  });

  it("shows Patch Notes for updates but not installs", () => {
    const modal = { style: { display: "none" } } as HTMLElement;
    const closeButton = { addEventListener: vi.fn() } as unknown as HTMLElement;
    const view = createInstallUpdateNoticeView({
      modal,
      closeButton,
    });

    view.showInstallUpdateNotice({ reason: "install", version: "1.8.0" });
    expect(modal.style.display).toBe("none");

    view.showInstallUpdateNotice({ reason: "update", version: "1.8.0" });
    expect(modal.style.display).toBe("block");
  });
});
