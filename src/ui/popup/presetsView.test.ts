import { afterEach, describe, expect, test, vi } from "vitest";

import { createPresetsView } from "./presetsView";

class FakeElement extends EventTarget {
  style = { display: "" };
  textContent = "";
  value = "";
  focused = false;

  focus(): void {
    this.focused = true;
  }

  contains(): boolean {
    return false;
  }

  appendChild(): FakeElement {
    return new FakeElement();
  }

  setAttribute(): void {}

  getAttribute(): null {
    return null;
  }
}

type SavePreset = Parameters<typeof createPresetsView>[0]["savePreset"];

const setup = (providedSavePreset?: SavePreset) => {
  const savePreset =
    providedSavePreset ??
    vi.fn(async () => ({
      ok: true as const,
      name: "Mine",
      presetNames: ["Mine"],
    }));
  const saveButton = new FakeElement();
  const saveModal = new FakeElement();
  const nameInput = new FakeElement();
  const saveError = new FakeElement();
  const saveForm = new FakeElement();
  createPresetsView({
    dropdown: new FakeElement() as unknown as HTMLElement,
    toggle: new FakeElement() as unknown as HTMLElement,
    menu: new FakeElement() as unknown as HTMLElement,
    saveButton: saveButton as unknown as HTMLButtonElement,
    saveModal: saveModal as unknown as HTMLDivElement,
    saveModalClose: new FakeElement() as unknown as HTMLButtonElement,
    saveForm: saveForm as unknown as HTMLFormElement,
    nameInput: nameInput as unknown as HTMLInputElement,
    saveError: saveError as unknown as HTMLDivElement,
    saveCancel: new FakeElement() as unknown as HTMLButtonElement,
    getMessage: (name) => name,
    getCurrentFilters: vi.fn(() => []),
    savePreset,
    deletePreset: vi.fn(async () => ({ ok: true as const, presetNames: [] })),
    selectPreset: vi.fn(async () => null),
    setCurrentFilters: vi.fn(),
    saveLoadedFilters: vi.fn(async () => undefined),
    redraw: vi.fn(),
  });
  return { nameInput, saveButton, saveError, saveForm, saveModal, savePreset };
};

afterEach(() => vi.unstubAllGlobals());

describe("createPresetsView", () => {
  test("opens the save modal with a cleared field and error", () => {
    vi.stubGlobal("document", new FakeElement());
    const { nameInput, saveButton, saveError, saveModal } = setup();
    nameInput.value = "stale";
    saveError.textContent = "old error";

    saveButton.dispatchEvent(new Event("click"));

    expect(saveModal.style.display).toBe("block");
    expect(nameInput.value).toBe("");
    expect(saveError.textContent).toBe("");
    expect(nameInput.focused).toBe(true);
  });

  test("shows an action validation error without changing the view", async () => {
    vi.stubGlobal("document", new FakeElement());
    const savePreset = vi.fn(async () => ({
      ok: false as const,
      reason: "duplicate" as const,
    }));
    const { nameInput, saveError, saveForm } = setup(savePreset);
    nameInput.value = "Mine";

    saveForm.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(savePreset).toHaveBeenCalledWith("Mine"));

    expect(saveError.textContent).toBe("preset_name_duplicate_error");
  });
});

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
