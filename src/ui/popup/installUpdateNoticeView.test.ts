import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { getPendingInstallUpdateNotice } from "./installUpdateNoticeView";

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
});
