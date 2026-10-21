import type {
  ImportSession,
  PreparedSettingsImport,
  SettingsTransferActions,
} from "../../app/popup/settingsTransferActions";
import { isEqualizerFilterEnabled } from "../../domains/equalizer/defaultFilters";
import type { EqualizerFilter } from "../../domains/equalizer/types";
import type { ImportConflict, ImportDecisions } from "../../domains/settings/settingsImport";
import type { SettingsGroup, TransferIssue } from "../../domains/settings/settingsTransfer";
import type { Shortcut } from "../../domains/shortcuts/shortcuts";
import { attachModalFocus } from "./modalFocus";

export type SettingsImportElements = {
  modal: HTMLElement;
  title: HTMLElement;
  groups: HTMLElement;
  conflicts: HTMLElement;
  summary: HTMLElement;
  status: HTMLElement;
  resetConfirm: HTMLInputElement;
  fileInput: HTMLInputElement;
  back: HTMLButtonElement;
  next: HTMLButtonElement;
  apply: HTMLButtonElement;
  cancel: HTMLButtonElement;
  close: HTMLButtonElement;
  importButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
};
type Dependencies = {
  elements: SettingsImportElements;
  actions: SettingsTransferActions;
  getMessage(name: string): string;
  applyCommitted(prepared: PreparedSettingsImport): Promise<void>;
};
const groups: SettingsGroup[] = ["general", "shortcuts", "autostartRules", "presets"];
type Step = "reading" | "groups" | "conflicts" | "summary" | "saving" | "result";

export const createSettingsImportView = (deps: Dependencies) => {
  const { elements: e, actions } = deps;
  let session: ImportSession | null = null;
  let committed: PreparedSettingsImport | null = null;
  let selected: SettingsGroup[] = [];
  let decisions: ImportDecisions = {};
  let resetConfirmed = false;
  let generation = 0;
  let disposed = false;
  let step: Step = "reading";
  let exporting = false;
  const listeners: Array<() => void> = [];
  const dynamicListeners: Array<() => void> = [];
  const message = (key: string): string => deps.getMessage(`settings_transfer_${key}`);
  const listen = (element: EventTarget, name: string, handler: EventListener): void => {
    element.addEventListener(name, handler);
    listeners.push(() => element.removeEventListener(name, handler));
  };
  const focus = attachModalFocus(e.modal, e.importButton, { canClose: () => step !== "saving" });
  const node = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text = "",
  ): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  };
  const status = (key: string, error = false): void => {
    e.status.textContent = key ? message(key) : "";
    e.status.setAttribute("role", error ? "alert" : "status");
  };
  const preview = (): PreparedSettingsImport | null =>
    session ? actions.previewImport(session, selected, decisions) : null;
  const clearApprovals = (): void => {
    decisions = {};
    resetConfirmed = false;
    e.resetConfirm.checked = false;
  };
  const updateDecisions = (): void => {
    const ids = new Set(preview()?.plan.conflicts.map((conflict) => conflict.id));
    decisions = Object.fromEntries(Object.entries(decisions).filter(([id]) => ids.has(id)));
    resetConfirmed = false;
  };
  const listenChange = (input: HTMLInputElement, handler: () => void): void => {
    input.addEventListener("change", handler);
    dynamicListeners.push(() => input.removeEventListener("change", handler));
  };
  const showIssues = (container: HTMLElement, issues: TransferIssue[]): void => {
    for (const issue of issues) {
      const key =
        {
          "missing-preset": "missing_preset",
          "protected-preset": "protected_preset",
          "retained-rule-dependency": "dependency",
          "ambiguous-local-rule": "ambiguous_rule",
        }[issue.code] ?? "invalid";
      container.append(node("p", `${message(key)}: ${issue.path}`));
    }
  };
  const showFilters = (filters: EqualizerFilter[]): HTMLTableElement => {
    const table = node("table");
    const head = node("tr");
    for (const field of ["frequency", "gain", "q", "type", "enabled"]) {
      const cell = node("th", message(field));
      cell.scope = "col";
      head.append(cell);
    }
    const thead = node("thead");
    thead.append(head);
    table.append(thead);
    const body = node("tbody");
    for (const filter of filters) {
      const row = node("tr");
      for (const value of [
        Math.round(filter.freq),
        filter.gain.toFixed(2),
        filter.q.toFixed(2),
        filter.type,
        message(isEqualizerFilterEnabled(filter) ? "yes" : "no"),
      ])
        row.append(node("td", String(value)));
      body.append(row);
    }
    table.append(body);
    if (!filters.length) table.append(node("caption", message("empty_preset")));
    return table;
  };
  const showConflict = (conflict: ImportConflict): void => {
    const fieldset = node("fieldset");
    fieldset.append(node("legend", `${message(conflict.group)}: ${conflict.key}`));
    for (const choice of ["current", "incoming"] as const) {
      const version = node("section");
      version.append(node("h4", message(choice)));
      if (conflict.group === "presets") version.append(showFilters(conflict[choice]));
      else {
        const rule = conflict[choice];
        version.append(node("p", `${rule.type}: ${rule.value} → ${rule.presetName}`));
      }
      const label = node("label");
      const radio = node("input");
      radio.type = "radio";
      radio.name = conflict.id;
      radio.value = choice;
      radio.dataset.focusKey = `${conflict.id}:${choice}`;
      radio.checked = decisions[conflict.id] === choice;
      listenChange(radio, () => {
        if (step !== "conflicts" || !radio.checked) return;
        decisions = { ...decisions, [conflict.id]: choice };
        updateDecisions();
        render();
      });
      label.append(
        radio,
        node("span", message(choice === "current" ? "keep_current" : "use_incoming")),
      );
      version.append(label);
      fieldset.append(version);
    }
    if (conflict.group === "presets")
      fieldset.append(node("p", `${message("affected_rules")}: ${conflict.affectedRules}`));
    e.conflicts.append(fieldset);
  };
  const valueText = (value: unknown): string => {
    if (typeof value === "boolean") return message(value ? "yes" : "no");
    if (value === null) return message("disabled");
    if (typeof value === "object") {
      const shortcut = value as Shortcut;
      return [
        shortcut.ctrl && "Ctrl",
        shortcut.alt && "Alt",
        shortcut.shift && "Shift",
        shortcut.meta && "Meta",
        shortcut.key,
      ]
        .filter(Boolean)
        .join(" + ");
    }
    if (value === "light" || value === "dark") return message(value);
    return String(value);
  };
  const showPreferences = (container: HTMLElement, group: "general" | "shortcuts"): void => {
    if (!session) return;
    const incoming = session.source.groups[group];
    if (!incoming) return;
    const current = session.current[group];
    const fieldKeys: Record<string, string> = {
      theme: "theme",
      uiLanguage: "language",
      pointCount: "point_count",
      enableSpectrum: "spectrum",
      enableVolumeCompensation: "compensation",
      skipPointsResetConfirm: "skip_reset",
      mute: "mute",
      toggleEq: "toggle_eq",
    };
    container.append(
      node("h4", `${message(group)} — ${message("current")} → ${message("incoming")}`),
    );
    for (const key of Object.keys(incoming)) {
      container.append(
        node(
          "p",
          `${message(fieldKeys[key])}: ${valueText(current[key as keyof typeof current])} → ${valueText(incoming[key as keyof typeof incoming])}`,
        ),
      );
    }
  };
  const render = (): void => {
    dynamicListeners.splice(0).forEach((remove) => remove());
    const activeKey =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.focusKey
        : undefined;
    const prepared = step === "result" ? committed : preview();
    e.title.textContent = message(
      step === "saving"
        ? "saving"
        : step === "reading"
          ? "reading"
          : step === "result"
            ? "result"
            : step === "groups"
              ? "select_groups"
              : step === "conflicts"
                ? "resolve_conflicts"
                : "review",
    );
    e.groups.hidden = step !== "groups";
    e.conflicts.hidden = step !== "conflicts";
    e.summary.hidden = step !== "summary" && !(step === "result" && committed);
    e.back.hidden = step !== "conflicts" && step !== "summary";
    e.next.hidden = step !== "groups" && step !== "conflicts";
    e.apply.hidden = step !== "summary";
    e.cancel.disabled = e.close.disabled = step === "saving";
    e.cancel.dataset.i18n = step === "result" ? "ok" : "settings_transfer_cancel";
    e.cancel.textContent = deps.getMessage(e.cancel.dataset.i18n);
    e.modal.setAttribute("aria-busy", String(step === "reading" || step === "saving"));
    e.resetConfirm.checked = resetConfirmed;
    const needsConfirmation = prepared?.reset?.requiresConfirmation === true;
    e.resetConfirm.hidden = step !== "summary" || !needsConfirmation;
    e.resetConfirm.parentElement?.setAttribute(
      "data-reset-visible",
      String(!e.resetConfirm.hidden),
    );
    e.next.disabled = selected.length === 0 || (step === "conflicts" && !prepared?.plan.canApply);
    e.apply.disabled =
      !prepared?.plan.canApply || selected.length === 0 || (needsConfirmation && !resetConfirmed);
    if (step === "groups" && session) {
      e.groups.replaceChildren();
      e.groups.append(node("p", message("privacy")));
      for (const group of groups) {
        const label = node("label");
        const input = node("input");
        input.type = "checkbox";
        input.value = group;
        input.dataset.focusKey = group;
        const invalid = session.source.issues.some((issue) => issue.group === group);
        input.disabled = !session.source.groups[group] || invalid;
        input.checked = selected.includes(group);
        const count =
          group === "presets"
            ? session.source.groups.presets?.presetNames.length
            : group === "autostartRules"
              ? session.source.groups.autostartRules?.length
              : undefined;
        label.append(
          input,
          node(
            "span",
            `${message(group)}${input.disabled ? ` — ${message(invalid ? "invalid" : "absent")}` : count === undefined ? "" : `: ${count}`}`,
          ),
        );
        listenChange(input, () => {
          if (step !== "groups" || input.disabled) return;
          selected = input.checked
            ? [...selected, group]
            : selected.filter((value) => value !== group);
          // A changed group can alter rule dependencies and their conflict set.
          updateDecisions();
          render();
        });
        e.groups.append(label);
      }
      showIssues(e.groups, session.source.issues);
    }
    if (step === "conflicts" && prepared) {
      e.conflicts.replaceChildren();
      prepared.plan.conflicts.forEach(showConflict);
      showIssues(e.conflicts, prepared.plan.warnings);
      showIssues(e.conflicts, prepared.plan.blockers);
    }
    if (step === "summary" && prepared && session) {
      e.summary.replaceChildren();
      for (const group of selected) {
        if (group === "general" || group === "shortcuts") showPreferences(e.summary, group);
        else {
          e.summary.append(node("h4", message(group)));
          for (const [key, count] of Object.entries(prepared.plan.counts[group]))
            e.summary.append(node("p", `${message(key)}: ${count}`));
          if (group === "presets") {
            for (const name of session.source.groups.presets?.presetNames ?? [])
              e.summary.append(node("p", name));
            const hidden = session.source.groups.presets?.hideDefaultPresets;
            if (hidden !== undefined)
              e.summary.append(
                node(
                  "p",
                  `${message("hide_defaults")}: ${valueText(session.current.presets.hideDefaultPresets)} → ${valueText(hidden)}`,
                ),
              );
          }
        }
      }
      showIssues(e.summary, prepared.plan.warnings);
      showIssues(e.summary, prepared.plan.blockers);
      if (prepared.reset) {
        const reset = prepared.reset;
        e.summary.append(
          node(
            "p",
            `${message(reset.tabId === null ? "fallback_only" : "reset_warning")}: ${reset.title} (${reset.oldPointCount} → ${reset.newPointCount})`,
          ),
        );
        if (reset.tabId !== null) e.summary.append(node("p", message("fallback_reset")));
        if (reset.enableEq) e.summary.append(node("p", message("enable_eq")));
      }
    }
    if (step === "result" && prepared) {
      e.summary.replaceChildren();
      for (const group of selected) {
        if (group !== "presets" && group !== "autostartRules") continue;
        const section = node("section");
        section.append(node("h4", message(group)));
        for (const [key, count] of Object.entries(prepared.plan.counts[group]))
          section.append(node("p", `${message(key)}: ${count}`));
        e.summary.append(section);
      }
      if (prepared.plan.warnings.length) {
        const warnings = node("section");
        showIssues(warnings, prepared.plan.warnings);
        e.summary.append(warnings);
      }
    }
    if (activeKey)
      Array.from(e.modal.querySelectorAll<HTMLElement>("input"))
        .find((element) => element.dataset.focusKey === activeKey)
        ?.focus();
  };
  for (const [element, key] of [
    [e.back, "back"],
    [e.next, "next"],
    [e.apply, "apply"],
    [e.cancel, "cancel"],
  ] as const)
    element.textContent = message(key);
  e.close.setAttribute("aria-label", deps.getMessage("close"));
  e.resetConfirm.setAttribute("aria-label", message("reset_acknowledgement"));
  const resetLabel = e.resetConfirm.parentElement?.querySelector<HTMLElement>("[data-reset-label]");
  if (resetLabel) resetLabel.textContent = message("reset_acknowledgement");
  const open = (): void => {
    if (!disposed && step !== "saving") e.fileInput.click();
  };
  const readFile = (): void => {
    if (disposed || step === "saving") return;
    const file = e.fileInput.files?.[0];
    e.fileInput.value = "";
    if (!file) return;
    const token = ++generation;
    session = null;
    committed = null;
    selected = [];
    clearApprovals();
    step = "reading";
    status("reading");
    render();
    focus.open();
    const reader = new FileReader();
    const readError = (): void => {
      if (disposed || generation !== token) return;
      step = "result";
      render();
      status("read_error", true);
    };
    reader.onerror = readError;
    reader.onload = async () => {
      if (disposed || generation !== token) return;
      try {
        const result = await actions.prepareImport(String(reader.result));
        if (disposed || generation !== token) return;
        if (!result.ok) {
          step = "result";
          render();
          status(
            result.issues.some((issue) => issue.code === "version")
              ? "version_error"
              : "file_error",
            true,
          );
          return;
        }
        session = result.session;
        selected = groups.filter(
          (group) =>
            session?.source.groups[group] &&
            !session.source.issues.some((issue) => issue.group === group),
        );
        step = "groups";
        status("");
        render();
      } catch {
        if (disposed || generation !== token) return;
        step = "result";
        render();
        status("read_error", true);
      }
    };
    try {
      reader.readAsText(file, "UTF-8");
    } catch {
      readError();
    }
  };
  const save = async (): Promise<void> => {
    const prepared = preview();
    if (
      disposed ||
      step !== "summary" ||
      !session ||
      !selected.length ||
      !prepared?.plan.canApply ||
      (prepared.reset?.requiresConfirmation && !resetConfirmed)
    )
      return;
    const token = generation;
    step = "saving";
    status("saving");
    render();
    try {
      const result = await actions.commitImport(session, selected, decisions, resetConfirmed);
      if (disposed || token !== generation) return;
      if (result.status === "stale") {
        session = result.session;
        clearApprovals();
        step = "groups";
        render();
        status("stale", true);
        return;
      }
      if (result.status === "blocked") {
        step = "summary";
        render();
        status("blocked", true);
        return;
      }
      committed = result.prepared;
      try {
        if (result.status === "saved") await deps.applyCommitted(result.prepared);
        if (disposed || token !== generation) return;
        step = "result";
        render();
        status(result.status === "saved" ? "saved" : "unchanged");
      } catch {
        if (disposed || token !== generation) return;
        step = "result";
        render();
        status("refresh_error", true);
      }
    } catch {
      if (disposed || token !== generation) return;
      step = "summary";
      render();
      status("write_error", true);
    }
  };
  const exportFile = async (): Promise<void> => {
    if (disposed || exporting || step === "saving") return;
    exporting = true;
    e.exportButton.disabled = true;
    const token = generation;
    try {
      const json = await actions.exportSettings();
      if (disposed || generation !== token) return;
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const anchor = node("a");
      try {
        anchor.href = url;
        anchor.download = "eq_toolkit_settings.json";
        document.body.append(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      if (disposed || generation !== token) return;
      committed = null;
      step = "result";
      render();
      status("export_error", true);
      focus.open();
    } finally {
      exporting = false;
      if (!disposed) e.exportButton.disabled = false;
    }
  };
  listen(e.importButton, "click", open);
  listen(e.exportButton, "click", () => {
    void exportFile();
  });
  listen(e.fileInput, "change", readFile);
  listen(e.next, "click", () => {
    if (e.next.disabled) return;
    if (step === "groups") step = preview()?.plan.conflicts.length ? "conflicts" : "summary";
    else if (step === "conflicts") step = "summary";
    else return;
    status("");
    render();
    e.title.focus();
  });
  listen(e.back, "click", () => {
    if (step === "summary") step = preview()?.plan.conflicts.length ? "conflicts" : "groups";
    else if (step === "conflicts") step = "groups";
    else return;
    status("");
    render();
    e.title.focus();
  });
  listen(e.resetConfirm, "change", () => {
    if (step === "summary") {
      resetConfirmed = e.resetConfirm.checked;
      render();
    }
  });
  listen(e.apply, "click", () => {
    void save();
  });
  listen(e.cancel, "click", focus.close);
  listen(e.close, "click", focus.close);
  listen(e.modal, "click", (event) => {
    if (event.target === e.modal) focus.close();
  });
  listen(e.modal, "modal-closed", () => {
    ++generation;
    dynamicListeners.splice(0).forEach((remove) => remove());
    session = null;
    selected = [];
    clearApprovals();
    e.fileInput.value = "";
  });
  return {
    open,
    dispose: (): void => {
      disposed = true;
      ++generation;
      dynamicListeners.splice(0).forEach((remove) => remove());
      listeners.splice(0).forEach((remove) => remove());
      focus.dispose();
      session = null;
    },
  };
};
