import { describe, expect, test, vi } from "vitest";
import { createControlsView } from "./controlsView";

class FakeInput extends EventTarget {
  value = "0";
}

class FakeElement extends EventTarget {
  className = "";
  textContent = "";
}

describe("createControlsView", () => {
  test("updates the gain value output while moving the master volume slider", () => {
    const masterVolume = new FakeInput();
    const masterVolumeValue = new FakeElement();
    const onVolumeInput = vi.fn(async () => undefined);

    createControlsView({
      changeEqButton: new FakeElement() as unknown as HTMLImageElement,
      resetButton: new FakeElement() as unknown as HTMLButtonElement,
      masterVolume: masterVolume as unknown as HTMLInputElement,
      masterVolumeValue: masterVolumeValue as unknown as HTMLOutputElement,
      volumeMuteButton: new FakeElement() as unknown as HTMLElement,
      windowModeButton: new FakeElement() as unknown as HTMLElement,
      isToolkitWindow: false,
      getMessage: (name) => name,
      onToggleEqualizer: async () => undefined,
      onReset: async () => undefined,
      onVolumeInput,
      onToggleMute: async () => undefined,
      onWindowMode: async () => undefined,
      onMuteStateApplied: () => undefined,
    });

    masterVolume.value = "12";
    masterVolume.dispatchEvent(new Event("input"));

    expect(masterVolumeValue.textContent).toBe("12.0 dB");
    expect(onVolumeInput).toHaveBeenCalledWith(12);
  });
});
