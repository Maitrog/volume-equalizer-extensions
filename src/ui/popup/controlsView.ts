export interface ControlsView {
  setEnableButtonText(enabled: boolean): void;
  setMuteButtonClass(muted: boolean): void;
}

export const createControlsView = (deps: {
  changeEqButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  masterVolume: HTMLInputElement;
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
    void deps.onVolumeInput(Number(deps.masterVolume.value));
  });

  deps.volumeMuteButton.addEventListener("click", () => {
    void deps.onToggleMute();
  });

  deps.windowModeButton.addEventListener("click", () => {
    void deps.onWindowMode();
  });

  return {
    setEnableButtonText: (enabled) => {
      deps.changeEqButton.textContent = deps.getMessage(
        enabled ? "stop_eq_button_label" : "enable_eq_button_label",
      );
    },

    setMuteButtonClass: (muted) => {
      deps.volumeMuteButton.className = muted ? "volume-mute-active" : "volume-mute";
      deps.onMuteStateApplied();
    },
  };
};
