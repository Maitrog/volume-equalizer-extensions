import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import {
  createInstallUpdateNoticeView,
  getPendingInstallUpdateNotice,
} from "./installUpdateNoticeView";

describe("getPendingInstallUpdateNotice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stored = {
    [STORAGE_KEYS.INSTALL_UPDATE_NOTICE]: {
      reason: "update",
      version: "1.7.0",
    },
  };

  it("returns the current install/update notice", () => {
    expect(
      getPendingInstallUpdateNotice({
        stored,
        currentVersion: "1.7.0",
      }),
    ).toEqual({
      reason: "update",
      version: "1.7.0",
    });
  });

  it("does not return stale notices for older versions", () => {
    expect(
      getPendingInstallUpdateNotice({
        stored,
        currentVersion: "1.8.0",
      }),
    ).toBeNull();
  });

  it("shows Patch Notes for updates but not installs", () => {
    const modal = Object.assign(new EventTarget(), {
      style: { display: "none" },
    }) as unknown as HTMLElement;
    const closeButton = { addEventListener: vi.fn() } as unknown as HTMLElement;
    const view = createInstallUpdateNoticeView({
      modal,
      returnFocusTo: modal,
      closeButton,
      topCloseButton: closeButton,
    });

    view.showInstallUpdateNotice({ reason: "install", version: "1.8.0" });
    expect(modal.style.display).toBe("none");

    view.showInstallUpdateNotice({ reason: "update", version: "1.8.0" });
    expect(modal.style.display).toBe("block");
  });

  it("closes Patch Notes from either close button", () => {
    vi.stubGlobal("chrome", {
      storage: { local: { remove: vi.fn().mockResolvedValue(undefined) } },
    });
    const listeners: Array<() => void> = [];
    const createCloseButton = () =>
      ({
        addEventListener: (_event: string, listener: () => void) => {
          listeners.push(listener);
        },
      }) as unknown as HTMLElement;
    const modal = Object.assign(new EventTarget(), {
      style: { display: "block" },
    }) as unknown as HTMLElement;

    createInstallUpdateNoticeView({
      modal,
      returnFocusTo: modal,
      closeButton: createCloseButton(),
      topCloseButton: createCloseButton(),
    });

    expect(listeners).toHaveLength(2);
    for (const listener of listeners) {
      modal.style.display = "block";
      listener();
      expect(modal.style.display).toBe("none");
    }
  });
});

// Modal keyboard/inert behavior is exercised separately; these tests cover view actions.
vi.mock("./modalFocus", () => ({
  attachModalFocus: (modal: HTMLElement) => ({
    open: () => {
      modal.style.display = "block";
    },
    close: () => {
      modal.style.display = "none";
      modal.dispatchEvent(new Event("modal-closed"));
    },
  }),
}));
