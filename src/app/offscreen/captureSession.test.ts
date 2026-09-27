import { expect, test, vi } from "vitest";

import type { CaptureGraph } from "./captureGraph";
import { createCaptureSession } from "./captureSession";

const fakeStream = () => {
  const stop = vi.fn();
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop,
  };
};

test("start does not request a second stream for an already captured tab", async () => {
  const media = fakeStream();
  const acquireStream = vi.fn(async () => media.stream);
  const createGraph = vi.fn(async () => ({ dispose: vi.fn() }) as unknown as CaptureGraph);
  const session = createCaptureSession({ acquireStream, createGraph });

  await session.start(7, "stream-a");
  await session.start(7, "stream-a");

  expect(acquireStream).toHaveBeenCalledOnce();
  expect(createGraph).toHaveBeenCalledOnce();
  expect(session.get(7)?.streamId).toBe("stream-a");
  expect(media.stop).not.toHaveBeenCalled();
});

test("start releases a late stream when the tab is stopped while acquiring", async () => {
  let resolveStream!: (stream: MediaStream) => void;
  const acquireStream = vi.fn(
    () =>
      new Promise<MediaStream>((resolve) => {
        resolveStream = resolve;
      }),
  );
  const createGraph = vi.fn();
  const session = createCaptureSession({ acquireStream, createGraph });

  const pending = session.start(7, "stream-a");
  session.stopTab(7);
  const media = fakeStream();
  resolveStream(media.stream);
  await pending;

  expect(media.stop).toHaveBeenCalledOnce();
  expect(createGraph).not.toHaveBeenCalled();
  expect(session.has(7)).toBe(false);
});

test("start stops acquired tracks when graph construction fails", async () => {
  const media = fakeStream();
  const failure = new Error("graph construction failed");
  const session = createCaptureSession({
    acquireStream: vi.fn(async () => media.stream),
    createGraph: vi.fn(async () => {
      throw failure;
    }),
  });

  await expect(session.start(7, "stream-a")).rejects.toBe(failure);

  expect(media.stop).toHaveBeenCalledOnce();
  expect(session.has(7)).toBe(false);
});

test("stopping one capture preserves another", async () => {
  const mediaA = fakeStream();
  const mediaB = fakeStream();
  const session = createCaptureSession({
    acquireStream: vi.fn(async (tabId: number) => (tabId === 7 ? mediaA.stream : mediaB.stream)),
    createGraph: vi.fn(async () => ({ dispose: vi.fn() }) as unknown as CaptureGraph),
  });

  await session.start(7, "stream-a");
  await session.start(8, "stream-b");
  session.stopTab(7);

  expect(mediaA.stop).toHaveBeenCalledOnce();
  expect(mediaB.stop).not.toHaveBeenCalled();
  expect(session.has(7)).toBe(false);
  expect(session.get(8)?.streamId).toBe("stream-b");
});
