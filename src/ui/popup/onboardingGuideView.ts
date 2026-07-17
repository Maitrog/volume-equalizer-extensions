export type GuideTarget =
  | "volumeMute"
  | "changeEq"
  | "settings"
  | "autostart"
  | "windowMode"
  | "equalizer"
  | "volume"
  | "presets";

export interface GuideScreen {
  stage: number;
  kind: "language" | "appearance" | "shortcuts" | "spotlight";
  titleKey: string;
  messageKey?: string;
  target?: GuideTarget;
  substep?: readonly [number, number];
}

export const GUIDE_SCREENS: readonly GuideScreen[] = [
  { stage: 1, kind: "language", titleKey: "language_setting_option" },
  { stage: 2, kind: "appearance", titleKey: "settings_title" },
  {
    stage: 3,
    kind: "shortcuts",
    titleKey: "shortcuts_settings_title",
    messageKey: "guide_shortcuts_hint",
  },
  {
    stage: 4,
    kind: "spotlight",
    target: "volumeMute",
    titleKey: "volume_mute_button_tooltip",
    substep: [1, 2],
  },
  {
    stage: 4,
    kind: "spotlight",
    target: "changeEq",
    titleKey: "enable_eq_button_label",
    substep: [2, 2],
  },
  {
    stage: 5,
    kind: "spotlight",
    target: "settings",
    titleKey: "settings_button_tooltip",
    substep: [1, 3],
  },
  {
    stage: 5,
    kind: "spotlight",
    target: "autostart",
    titleKey: "add_to_autostart_tooltip",
    substep: [2, 3],
  },
  {
    stage: 5,
    kind: "spotlight",
    target: "windowMode",
    titleKey: "window_mode_button_tooltip",
    substep: [3, 3],
  },
  {
    stage: 6,
    kind: "spotlight",
    target: "equalizer",
    titleKey: "extName",
    messageKey: "guide_canvas_hint",
  },
  {
    stage: 7,
    kind: "spotlight",
    target: "volume",
    titleKey: "global_controls_title",
    messageKey: "guide_volume_hint",
  },
  {
    stage: 8,
    kind: "spotlight",
    target: "presets",
    titleKey: "preset_controls_title",
    messageKey: "guide_presets_hint",
  },
];

export interface GuideNavigation {
  canGoBack: boolean;
  canSkip: boolean;
  isLast: boolean;
}

export const getGuideNavigation = (index: number): GuideNavigation => ({
  canGoBack: index > 0,
  canSkip: GUIDE_SCREENS[index].stage >= 4,
  isLast: index === GUIDE_SCREENS.length - 1,
});

interface RectEdges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PositionedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const getSpotlightPanels = (
  target: RectEdges,
  viewportWidth: number,
  viewportHeight: number,
): Record<"top" | "left" | "right" | "bottom", PositionedRect> => ({
  top: { left: 0, top: 0, width: viewportWidth, height: target.top },
  left: {
    left: 0,
    top: target.top,
    width: target.left,
    height: target.bottom - target.top,
  },
  right: {
    left: target.right,
    top: target.top,
    width: viewportWidth - target.right,
    height: target.bottom - target.top,
  },
  bottom: {
    left: 0,
    top: target.bottom,
    width: viewportWidth,
    height: viewportHeight - target.bottom,
  },
});

export interface OnboardingGuideView {
  start(): Promise<void>;
  refresh(): void;
}

export const createOnboardingGuideView = (deps: {
  root: HTMLElement;
  inertElements: HTMLElement[];
  targets: Record<GuideTarget, HTMLElement>;
  sourceLanguageSelect: HTMLSelectElement;
  sourceThemeSelect: HTMLSelectElement;
  sourcePointCountSelect: HTMLSelectElement;
  getMessage(name: string): string;
  setLanguage(language: string): Promise<void>;
  setTheme(theme: string): Promise<void>;
  setPointCount(count: string): Promise<void>;
  onShown(): Promise<void>;
}): OnboardingGuideView => {
  const getPart = <T extends Element>(selector: string): T => {
    const element = deps.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing onboarding element: ${selector}`);
    return element;
  };
  const title = getPart<HTMLHeadingElement>("#guide-title");
  const content = getPart<HTMLDivElement>(".guide-content");
  const progress = getPart<HTMLDivElement>(".guide-progress");
  const card = getPart<HTMLElement>(".guide-card");
  const spotlight = getPart<HTMLDivElement>(".guide-spotlight");
  const backButton = getPart<HTMLButtonElement>("[data-guide-action='back']");
  const nextButton = getPart<HTMLButtonElement>("[data-guide-action='next']");
  const skipButton = getPart<HTMLButtonElement>("[data-guide-action='skip']");
  const panels = {
    top: getPart<HTMLElement>("[data-guide-panel='top']"),
    left: getPart<HTMLElement>("[data-guide-panel='left']"),
    right: getPart<HTMLElement>("[data-guide-panel='right']"),
    bottom: getPart<HTMLElement>("[data-guide-panel='bottom']"),
  };
  let currentIndex = 0;
  let started = false;

  const setRect = (element: HTMLElement, rect: PositionedRect): void => {
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.width = `${Math.max(0, rect.width)}px`;
    element.style.height = `${Math.max(0, rect.height)}px`;
  };

  const createSelectField = (
    labelText: string,
    source: HTMLSelectElement,
    onChange: (value: string) => Promise<void>,
  ): HTMLLabelElement => {
    const field = document.createElement("label");
    field.className = "guide-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const select = source.cloneNode(true) as HTMLSelectElement;
    select.removeAttribute("id");
    select.value = source.value;
    select.addEventListener("change", () => {
      void onChange(select.value).then(() => render());
    });
    field.append(label, select);
    return field;
  };

  const renderContent = (screen: GuideScreen): void => {
    content.replaceChildren();
    if (screen.kind === "language") {
      content.append(
        createSelectField(
          deps.getMessage("language_setting_option"),
          deps.sourceLanguageSelect,
          deps.setLanguage,
        ),
      );
      return;
    }
    if (screen.kind === "appearance") {
      content.append(
        createSelectField(
          deps.getMessage("theme_setting_option"),
          deps.sourceThemeSelect,
          deps.setTheme,
        ),
        createSelectField(
          deps.getMessage("points_count_setting_option"),
          deps.sourcePointCountSelect,
          deps.setPointCount,
        ),
      );
      return;
    }
    if (screen.kind === "shortcuts") {
      const mute = document.createElement("div");
      mute.className = "guide-shortcut";
      mute.innerHTML = `<span>${deps.getMessage("shortcut_mute_label")}</span><kbd>Alt+M</kbd>`;
      const toggle = document.createElement("div");
      toggle.className = "guide-shortcut";
      toggle.innerHTML = `<span>${deps.getMessage("shortcut_toggle_eq_label")}</span><kbd>Alt+K</kbd>`;
      content.append(mute, toggle);
    }
    if (screen.messageKey) {
      const message = document.createElement("p");
      message.textContent = deps.getMessage(screen.messageKey);
      content.append(message);
    }
  };

  const positionSpotlight = (target: HTMLElement): void => {
    const padding = 6;
    const rect = target.getBoundingClientRect();
    const focus = {
      left: Math.max(0, rect.left - padding),
      top: Math.max(0, rect.top - padding),
      right: Math.min(window.innerWidth, rect.right + padding),
      bottom: Math.min(window.innerHeight, rect.bottom + padding),
    };
    const panelRects = getSpotlightPanels(
      focus,
      window.innerWidth,
      window.innerHeight,
    );
    Object.entries(panels).forEach(([name, panel]) => {
      setRect(panel, panelRects[name as keyof typeof panelRects]);
    });
    setRect(spotlight, {
      left: focus.left,
      top: focus.top,
      width: focus.right - focus.left,
      height: focus.bottom - focus.top,
    });

    const margin = 12;
    const cardRect = card.getBoundingClientRect();
    const center = Math.max(
      margin + cardRect.width / 2,
      Math.min(
        window.innerWidth - margin - cardRect.width / 2,
        (focus.left + focus.right) / 2,
      ),
    );
    const below = focus.bottom + margin;
    const above = focus.top - cardRect.height - margin;
    const top =
      below + cardRect.height <= window.innerHeight - margin
        ? below
        : above >= margin
          ? above
          : window.innerHeight - cardRect.height - margin;
    card.style.left = `${center}px`;
    card.style.top = `${Math.max(margin, top)}px`;
    card.style.transform = "translateX(-50%)";
  };

  const render = (): void => {
    const screen = GUIDE_SCREENS[currentIndex];
    const navigation = getGuideNavigation(currentIndex);
    deps.root.classList.toggle("card-mode", screen.kind !== "spotlight");
    title.textContent = deps.getMessage(screen.titleKey);
    progress.textContent = `${screen.stage}/8${
      screen.substep ? ` · ${screen.substep[0]}/${screen.substep[1]}` : ""
    }`;
    backButton.hidden = !navigation.canGoBack;
    skipButton.hidden = !navigation.canSkip;
    backButton.textContent = deps.getMessage("guide_back");
    skipButton.textContent = deps.getMessage("guide_skip");
    nextButton.textContent = deps.getMessage(
      navigation.isLast ? "guide_finish" : "guide_next",
    );
    renderContent(screen);

    card.style.left = "";
    card.style.top = "";
    card.style.transform = "";
    if (screen.kind === "spotlight" && screen.target) {
      positionSpotlight(deps.targets[screen.target]);
    }
    title.focus();
  };

  const close = (): void => {
    deps.root.hidden = true;
    deps.inertElements.forEach((element) => {
      element.inert = false;
    });
    window.removeEventListener("resize", render);
    started = false;
  };

  backButton.addEventListener("click", () => {
    currentIndex = Math.max(0, currentIndex - 1);
    render();
  });
  nextButton.addEventListener("click", () => {
    if (getGuideNavigation(currentIndex).isLast) {
      close();
      return;
    }
    currentIndex += 1;
    render();
  });
  skipButton.addEventListener("click", close);
  deps.root.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key !== "Tab") return;
    const controls = Array.from(
      deps.root.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
        "button:not([hidden]):not(:disabled), select:not(:disabled)",
      ),
    );
    if (controls.length === 0) return;
    const current = controls.indexOf(document.activeElement as typeof controls[number]);
    const next = event.shiftKey
      ? (current - 1 + controls.length) % controls.length
      : (current + 1) % controls.length;
    event.preventDefault();
    controls[next].focus();
  });

  return {
    start: async () => {
      if (started) return;
      started = true;
      currentIndex = 0;
      deps.inertElements.forEach((element) => {
        element.inert = true;
      });
      deps.root.hidden = false;
      render();
      window.addEventListener("resize", render);
      await deps.onShown();
    },
    refresh: () => {
      if (started) render();
    },
  };
};
