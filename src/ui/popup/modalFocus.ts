const openDialogs: HTMLElement[] = [];

export const attachModalFocus = (
  dialog: HTMLElement,
  trigger: HTMLElement,
  options?: { canClose?: () => boolean },
) => {
  const inertStates = new Map<HTMLElement, boolean>();
  let returnFocus: HTMLElement = trigger;
  const focusableElements = (): HTMLElement[] =>
    Array.from(
      dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]"),
    ).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        !element.closest("[inert]") &&
        element.getClientRects().length > 0,
    );

  const release = (): void => {
    const index = openDialogs.indexOf(dialog);
    if (index < 0) return;
    openDialogs.splice(index, 1);
    dialog.style.display = "none";
    document.removeEventListener("keydown", onKeyDown, { capture: true });
    inertStates.forEach((inert, element) => {
      element.inert = inert;
    });
    inertStates.clear();
    returnFocus.focus();
    dialog.dispatchEvent(new Event("modal-closed"));
  };

  const close = (): void => {
    if (options?.canClose && !options.canClose()) return;
    release();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (openDialogs.at(-1) !== dialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    } else if (event.key === "Tab") {
      const elements = focusableElements();
      const first = elements[0] ?? dialog;
      const last = elements.at(-1) ?? dialog;
      if (
        !dialog.contains(document.activeElement) ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last) ||
        !elements.length
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  };

  return {
    open: (): void => {
      if (openDialogs.includes(dialog)) return;
      returnFocus =
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : trigger;
      dialog.style.display = "block";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.tabIndex = -1;
      // Preserve each sibling's state, including when a confirmation overlays settings.
      for (
        let ancestor: HTMLElement | null = dialog;
        ancestor?.parentElement;
        ancestor = ancestor.parentElement
      ) {
        for (const sibling of Array.from(ancestor.parentElement.children)) {
          if (!(sibling instanceof HTMLElement) || sibling === ancestor) continue;
          inertStates.set(sibling, sibling.inert);
          sibling.inert = true;
        }
        if (ancestor.parentElement === document.body) break;
      }
      // A sibling modal may have made this dialog inert before it was opened.
      inertStates.set(dialog, dialog.inert);
      dialog.inert = false;
      openDialogs.push(dialog);
      document.addEventListener("keydown", onKeyDown, true);
      (focusableElements()[0] ?? dialog).focus();
    },
    close,
    dispose: (): void => {
      release();
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    },
  };
};
