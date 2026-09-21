import { expect, test, vi } from "vitest";

import { createOffscreenMessageHandler } from "./offscreen";

const settings = {
  enabled: true,
  gainValue: 3,
  muted: false,
  volumeCompensationEnabled: true,
  filterSettings: [],
};

const backgroundSender = {
  id: "extension-id",
  url: "chrome-extension://extension-id/scripts/background.js",
};

const createMockEngine = () => ({
  start: vi.fn(async () => undefined),
  stop: vi.fn(),
  update: vi.fn(),
  list: vi.fn(() => [{ tabId: 7, settings }]),
  setSpectrumDemand: vi.fn(),
});

const createHandler = (engine: ReturnType<typeof createMockEngine>) =>
  createOffscreenMessageHandler({
    engine,
    extensionId: "extension-id",
    backgroundUrl: "chrome-extension://extension-id/scripts/background.js",
  });

test("starts captures and replies after the engine confirms", async () => {
  const engine = createMockEngine();
  const handler = createHandler(engine);
  const response = vi.fn();

  const accepted = handler(
    { target: "offscreen", method: "capture-start", tabId: 7, streamId: "stream-a", settings },
    backgroundSender,
    response,
  );

  expect(accepted).toBe(true);
  await vi.waitFor(() =>
    expect(response).toHaveBeenCalledWith({ ok: true, captures: [{ tabId: 7, settings }] }),
  );
  expect(engine.start).toHaveBeenCalledWith(7, "stream-a", settings);
});

test("replies with the engine error when a start fails", async () => {
  const engine = createMockEngine();
  engine.start.mockRejectedValueOnce(new Error("capture failed"));
  const handler = createHandler(engine);
  const response = vi.fn();

  handler(
    { target: "offscreen", method: "capture-start", tabId: 7, streamId: "stream-a", settings },
    backgroundSender,
    response,
  );

  await vi.waitFor(() =>
    expect(response).toHaveBeenCalledWith({ ok: false, error: "capture failed" }),
  );
});

test("routes stop, settings and spectrum demand commands", async () => {
  const engine = createMockEngine();
  const handler = createHandler(engine);

  handler({ target: "offscreen", method: "capture-stop", tabId: 7 }, backgroundSender, vi.fn());
  handler(
    { target: "offscreen", method: "capture-settings", tabId: 7, settings },
    backgroundSender,
    vi.fn(),
  );
  handler(
    { target: "offscreen", method: "capture-spectrum-demand", tabId: 7, enabled: true },
    backgroundSender,
    vi.fn(),
  );

  expect(engine.stop).toHaveBeenCalledWith(7);
  expect(engine.update).toHaveBeenCalledWith(7, settings);
  expect(engine.setSpectrumDemand).toHaveBeenCalledWith(7, true);
});

test("answers capture-list without a tab id", async () => {
  const engine = createMockEngine();
  const handler = createHandler(engine);
  const response = vi.fn();

  expect(handler({ target: "offscreen", method: "capture-list" }, backgroundSender, response)).toBe(
    true,
  );

  await vi.waitFor(() =>
    expect(response).toHaveBeenCalledWith({ ok: true, captures: [{ tabId: 7, settings }] }),
  );
});

test("ignores commands from other senders", () => {
  const engine = createMockEngine();
  const handler = createHandler(engine);
  const response = vi.fn();
  const command = {
    target: "offscreen",
    method: "capture-start",
    tabId: 7,
    streamId: "stream-a",
    settings,
  };

  expect(
    handler(
      command,
      { id: "other-extension", url: "chrome-extension://other/popup.html" },
      response,
    ),
  ).toBeUndefined();
  expect(
    handler(
      command,
      { id: "extension-id", url: "chrome-extension://extension-id/popup.html" },
      response,
    ),
  ).toBeUndefined();
  expect(engine.start).not.toHaveBeenCalled();
  expect(response).not.toHaveBeenCalled();
});

test("ignores messages that are not addressed to the offscreen document", () => {
  const engine = createMockEngine();
  const handler = createHandler(engine);
  const response = vi.fn();

  expect(handler({ method: "capture-list" }, backgroundSender, response)).toBeUndefined();
  expect(handler(null, backgroundSender, response)).toBeUndefined();
  expect(engine.list).not.toHaveBeenCalled();
});

test("ignores malformed offscreen commands", () => {
  const engine = createMockEngine();
  const handler = createHandler(engine);
  const response = vi.fn();

  expect(
    handler({ target: "offscreen", method: "capture-start", tabId: 7 }, backgroundSender, response),
  ).toBeUndefined();
  expect(
    handler({ target: "offscreen", method: "capture-stop", tabId: -1 }, backgroundSender, response),
  ).toBeUndefined();
  expect(
    handler(
      {
        target: "offscreen",
        method: "capture-start",
        tabId: 7,
        streamId: "stream-a",
        settings: { ...settings, enabled: "yes" },
      },
      backgroundSender,
      response,
    ),
  ).toBeUndefined();
  expect(engine.start).not.toHaveBeenCalled();
  expect(engine.stop).not.toHaveBeenCalled();
});
