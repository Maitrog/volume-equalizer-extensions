import type { ToolkitShortcutAction } from "../../infrastructure/chrome/runtimeMessages";

export const resolveTabEnabled = (
  requestedEnabled: boolean,
  isToolkitCaptured: boolean,
): boolean => {
  return requestedEnabled && !isToolkitCaptured;
};

export const isLatestModeCheck = (generation: number, currentGeneration: number): boolean =>
  generation === currentGeneration;

export const resolveShortcutToggle = ({
  key,
  currentValue,
  enabledKey,
  enableTab,
  isToolkitCaptured,
  toolkitAction,
}: {
  key: string;
  currentValue: unknown;
  enabledKey: string;
  enableTab: boolean;
  isToolkitCaptured: boolean;
  toolkitAction: ToolkitShortcutAction;
}): { toolkitAction: ToolkitShortcutAction } | { storageValues: Record<string, boolean> } => {
  if (isToolkitCaptured) return { toolkitAction };

  const values = { [key]: !currentValue };
  if (enableTab && !isToolkitCaptured) {
    values[enabledKey] = true;
  }
  return { storageValues: values };
};
