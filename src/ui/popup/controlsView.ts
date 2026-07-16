export interface ControlsView {
  setEnableButtonClass(enabled: boolean): void;
  setMuteButtonClass(muted: boolean): void;
}

export const formatGainValue = (value: number): string => `${value.toFixed(1)} dB`;

export const createControlsView = (deps: {
  changeEqButton: HTMLImageElement;
  resetButton: HTMLButtonElement;
  masterVolume: HTMLInputElement;
  masterVolumeValue: HTMLOutputElement;
  volumeMuteButton: HTMLElement;
  windowModeButton: HTMLElement;
  isToolkitWindow: boolean;
  getMessage(messageName: string): string;
  onToggleEqualizer(): Promise<void>;
  onReset(): Promise<void>;
  onVolumeInput(value: number): Promise<void>;
  onToggleMute(): Promise<void>;
  onWindowMode(): Promise<void>;
  onMuteStateApplied(): void;
}): ControlsView => {
  deps.changeEqButton.addEventListener("click", () => {
    if (deps.isToolkitWindow) return;
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

  deps.windowModeButton.addEventListener("click", () => {
    void deps.onWindowMode();
  });

  return {
    setEnableButtonClass: (enabled) => {
      deps.changeEqButton.classList.toggle("change-eq-active", enabled);
    },

    setMuteButtonClass: (muted) => {
      deps.volumeMuteButton.className = muted ? "volume-mute-active" : "volume-mute";
      deps.onMuteStateApplied();
    },
  };
};
