import type { RuntimeMessage } from "./runtimeMessages";

export type RuntimeMessageHandler<TMessage = RuntimeMessage> = (
  message: TMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

export const sendRuntimeMessage = <TResponse = unknown>(
  message: RuntimeMessage,
): Promise<TResponse> => chrome.runtime.sendMessage(message) as Promise<TResponse>;

export const addRuntimeMessageListener = <TMessage = RuntimeMessage>(
  handler: RuntimeMessageHandler<TMessage>,
): (() => void) => {
  const listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: () => void,
  ): boolean | undefined => handler(message as TMessage, sender, sendResponse) ?? undefined;

  chrome.runtime.onMessage.addListener(listener);

  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
};
