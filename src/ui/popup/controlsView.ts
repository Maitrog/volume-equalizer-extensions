export const formatGainValue = (value: number): string => `${value.toFixed(1)} dB`;

const CLIPPING_HOLD_MS = 1500;

export const createControlsView = (deps: {
  changeEqButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  masterVolume: HTMLInputElement;
  masterVolumeValue: HTMLOutputElement;
  clippingIndicator: HTMLElement;
  volumeMuteButton: HTMLElement;
  tabCaptureButton: HTMLElement;
  getMessage(messageName: string): string;
  onToggleEqualizer(): Promise<void>;
  onReset(): Promise<void>;
  onVolumeInput(value: number): Promise<void>;
  onToggleMute(): Promise<void>;
  onTabCapture(): Promise<void>;
  onMuteStateApplied(): void;
}) => {
  let clippingTimeout: ReturnType<typeof setTimeout> | null = null;

  const resetClipping = (): void => {
    if (clippingTimeout) clearTimeout(clippingTimeout);
    clippingTimeout = null;
    deps.clippingIndicator.classList.toggle("clipping-indicator-active", false);
  };

  const setClipping = (clipping: boolean): void => {
    if (!clipping) return;

    if (clippingTimeout) clearTimeout(clippingTimeout);
    deps.clippingIndicator.classList.toggle("clipping-indicator-active", true);
    clippingTimeout = setTimeout(resetClipping, CLIPPING_HOLD_MS);
  };

  deps.changeEqButton.addEventListener("click", () => {
    void deps.onToggleEqualizer();
  });

  deps.resetButton.addEventListener("click", () => {
    void deps.onReset();
  });

  deps.masterVolume.addEventListener("input", () => {
    const value = Number(deps.masterVolume.value);
    deps.masterVolumeValue.textContent = formatGainValue(value);
    void deps.onVolumeInput(value);
  });

  deps.volumeMuteButton.addEventListener("click", () => {
    void deps.onToggleMute();
  });

  deps.tabCaptureButton.addEventListener("click", () => {
    void deps.onTabCapture();
  });

  return {
    setClipping,
    resetClipping,

    setEnableButtonClass: (enabled: boolean) => {
      deps.changeEqButton.classList.toggle("change-eq-active", enabled);
      deps.changeEqButton.setAttribute("aria-pressed", String(enabled));
    },

    setMuteButtonClass: (muted: boolean) => {
      deps.volumeMuteButton.className = muted ? "volume-mute-active" : "volume-mute";
      deps.volumeMuteButton.setAttribute("aria-pressed", String(muted));
      deps.onMuteStateApplied();
    },
  };
};
