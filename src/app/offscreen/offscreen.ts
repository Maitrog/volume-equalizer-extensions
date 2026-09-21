import {
  RUNTIME_MESSAGES,
  type CaptureReply,
  type CaptureSettings,
  type OffscreenCommand,
} from "../../infrastructure/chrome/runtimeMessages";
import { createCaptureEngine } from "./captureEngine";

type CaptureEngine = Pick<
  ReturnType<typeof createCaptureEngine>,
  "start" | "stop" | "update" | "list" | "setSpectrumDemand"
>;

const isTabId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isCaptureSettings = (value: unknown): value is CaptureSettings => {
  if (!value || typeof value !== "object") return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.enabled === "boolean" &&
    typeof settings.gainValue === "number" &&
    Number.isFinite(settings.gainValue) &&
    typeof settings.muted === "boolean" &&
    typeof settings.volumeCompensationEnabled === "boolean" &&
    Array.isArray(settings.filterSettings)
  );
};

const isOffscreenCommand = (value: unknown): value is OffscreenCommand => {
  if (!value || typeof value !== "object") return false;
  const command = value as Record<string, unknown>;
  if (command.target !== "offscreen") return false;
  if (command.method === RUNTIME_MESSAGES.CAPTURE_LIST) return true;
  if (!isTabId(command.tabId)) return false;
  if (command.method === RUNTIME_MESSAGES.CAPTURE_STOP) return true;
  if (command.method === RUNTIME_MESSAGES.CAPTURE_SETTINGS) {
    return isCaptureSettings(command.settings);
  }
  if (command.method === RUNTIME_MESSAGES.CAPTURE_SPECTRUM_DEMAND) {
    return typeof command.enabled === "boolean";
  }
  return (
    command.method === RUNTIME_MESSAGES.CAPTURE_START &&
    typeof command.streamId === "string" &&
    command.streamId.length > 0 &&
    isCaptureSettings(command.settings)
  );
};

const isBackgroundSender = (
  sender: chrome.runtime.MessageSender,
  extensionId: string,
  backgroundUrl: string,
): boolean => {
  if (sender.id !== extensionId) return false;
  if (!sender.url) return true;
  return sender.url === backgroundUrl;
};

export const createOffscreenMessageHandler = (deps: {
  engine: CaptureEngine;
  extensionId: string;
  backgroundUrl: string;
}) => {
  return (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (reply: CaptureReply) => void,
  ): boolean | undefined => {
    if (!isOffscreenCommand(message)) return undefined;
    if (!isBackgroundSender(sender, deps.extensionId, deps.backgroundUrl)) return undefined;

    void (async () => {
      try {
        if (message.method === RUNTIME_MESSAGES.CAPTURE_START) {
          await deps.engine.start(message.tabId, message.streamId, message.settings);
        } else if (message.method === RUNTIME_MESSAGES.CAPTURE_STOP) {
          deps.engine.stop(message.tabId);
        } else if (message.method === RUNTIME_MESSAGES.CAPTURE_SETTINGS) {
          deps.engine.update(message.tabId, message.settings);
        } else if (message.method === RUNTIME_MESSAGES.CAPTURE_SPECTRUM_DEMAND) {
          deps.engine.setSpectrumDemand(message.tabId, message.enabled);
        }
        sendResponse({ ok: true, captures: deps.engine.list() });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return true;
  };
};

if (typeof chrome !== "undefined") {
  const engine = createCaptureEngine({
    audioContext: new AudioContext(),
    onCaptureEnded: (tabId) => {
      void chrome.runtime.sendMessage({
        target: "background",
        method: RUNTIME_MESSAGES.CAPTURE_ENDED,
        tabId,
      });
    },
  });
  const handler = createOffscreenMessageHandler({
    engine,
    extensionId: chrome.runtime.id,
    backgroundUrl: chrome.runtime.getURL("scripts/background.js"),
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
    handler(message, sender, sendResponse as (reply: CaptureReply) => void),
  );
}
