import { describe, expect, test, vi } from "vitest";
import { createControlsView } from "./controlsView";

class FakeInput extends EventTarget {
  value = "0";
}

class FakeClassList {
  private readonly values = new Set<string>();

  toggle(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.values.has(name);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }

  contains(name: string): boolean {
    return this.values.has(name);
  }
}

class FakeElement extends EventTarget {
  classList = new FakeClassList();
  className = "";
  textContent = "";
}

describe("createControlsView", () => {
  test("toggles the equalizer when the power button is clicked in window mode", () => {
    const changeEqButton = new FakeElement();
    const onToggleEqualizer = vi.fn(async () => undefined);

    createControlsView({
      changeEqButton: changeEqButton as unknown as HTMLButtonElement,
      resetButton: new FakeElement() as unknown as HTMLButtonElement,
      masterVolume: new FakeInput() as unknown as HTMLInputElement,
      masterVolumeValue: new FakeElement() as unknown as HTMLOutputElement,
      clippingIndicator: new FakeElement() as unknown as HTMLElement,
      volumeMuteButton: new FakeElement() as unknown as HTMLElement,
      tabCaptureButton: new FakeElement() as unknown as HTMLElement,
      getMessage: (name) => name,
      onToggleEqualizer,
      onReset: async () => undefined,
      onVolumeInput: async () => undefined,
      onToggleMute: async () => undefined,
      onTabCapture: async () => undefined,
      onMuteStateApplied: () => undefined,
    });

    changeEqButton.dispatchEvent(new Event("click"));

    expect(onToggleEqualizer).toHaveBeenCalledOnce();
  });

  test("updates the gain value output while moving the master volume slider", () => {
    const masterVolume = new FakeInput();
    const masterVolumeValue = new FakeElement();
    const onVolumeInput = vi.fn(async () => undefined);

    createControlsView({
      changeEqButton: new FakeElement() as unknown as HTMLButtonElement,
      resetButton: new FakeElement() as unknown as HTMLButtonElement,
      masterVolume: masterVolume as unknown as HTMLInputElement,
      masterVolumeValue: masterVolumeValue as unknown as HTMLOutputElement,
      clippingIndicator: new FakeElement() as unknown as HTMLElement,
      volumeMuteButton: new FakeElement() as unknown as HTMLElement,
      tabCaptureButton: new FakeElement() as unknown as HTMLElement,
      getMessage: (name) => name,
      onToggleEqualizer: async () => undefined,
      onReset: async () => undefined,
      onVolumeInput,
      onToggleMute: async () => undefined,
      onTabCapture: async () => undefined,
      onMuteStateApplied: () => undefined,
    });

    masterVolume.value = "12";
    masterVolume.dispatchEvent(new Event("input"));

    expect(masterVolumeValue.textContent).toBe("12.0 dB");
    expect(onVolumeInput).toHaveBeenCalledWith(12);
  });

  test("holds the clipping indicator for 1.5 seconds and resets it explicitly", () => {
    vi.useFakeTimers();
    const clippingIndicator = new FakeElement();
    const view = createControlsView({
      changeEqButton: new FakeElement() as unknown as HTMLButtonElement,
      resetButton: new FakeElement() as unknown as HTMLButtonElement,
      masterVolume: new FakeInput() as unknown as HTMLInputElement,
      masterVolumeValue: new FakeElement() as unknown as HTMLOutputElement,
      clippingIndicator: clippingIndicator as unknown as HTMLElement,
      volumeMuteButton: new FakeElement() as unknown as HTMLElement,
      tabCaptureButton: new FakeElement() as unknown as HTMLElement,
      getMessage: (name) => name,
      onToggleEqualizer: async () => undefined,
      onReset: async () => undefined,
      onVolumeInput: async () => undefined,
      onToggleMute: async () => undefined,
      onTabCapture: async () => undefined,
      onMuteStateApplied: () => undefined,
    });

    view.setClipping(true);
    expect(clippingIndicator.classList.contains("clipping-indicator-active")).toBe(true);

    vi.advanceTimersByTime(1499);
    expect(clippingIndicator.classList.contains("clipping-indicator-active")).toBe(true);

    vi.advanceTimersByTime(1);
    expect(clippingIndicator.classList.contains("clipping-indicator-active")).toBe(false);

    view.setClipping(true);
    view.resetClipping();
    expect(clippingIndicator.classList.contains("clipping-indicator-active")).toBe(false);
    vi.useRealTimers();
  });
});
