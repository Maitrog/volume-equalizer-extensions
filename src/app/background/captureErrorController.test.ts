import { describe, expect, test, vi } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createCaptureErrorController } from "./captureErrorController";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const createStorage = () => {
  const values: Record<string, unknown> = {};
  const calls: string[] = [];
  return {
    values,
    calls,
    set: vi.fn((next: Record<string, unknown>) => {
      const [key] = Object.keys(next);
      calls.push(`set ${key}`);
      Object.assign(values, next);
      return Promise.resolve();
    }),
    remove: vi.fn((key: string | string[]) => {
      for (const removed of Array.isArray(key) ? key : [key]) {
        calls.push(`remove ${removed}`);
        delete values[removed];
      }
      return Promise.resolve();
    }),
  };
};

describe("createCaptureErrorController", () => {
  test("a connected frame clears an error reported by another frame regardless of storage timing", async () => {
    const storage = createStorage();
    const slowSet = deferred<void>();
    storage.set.mockImplementationOnce((next: Record<string, unknown>) => {
      storage.calls.push(`set ${Object.keys(next)[0]}`);
      return slowSet.promise;
    });
    const controller = createCaptureErrorController({ storage });
    const key = STORAGE_KEYS.tabCaptureError(7);

    const report = controller.reportError(7, "Audio capture failed");
    const connect = controller.trackFrameConnected(7, 0);
    slowSet.resolve();

    await Promise.all([report, connect]);

    expect(storage.calls).toEqual([`set ${key}`, `remove ${key}`]);
    expect(storage.values[key]).toBeUndefined();
  });

  test("keeps the error when every frame reports a failure", async () => {
    const storage = createStorage();
    const controller = createCaptureErrorController({ storage });

    await controller.reportError(7, "Audio capture failed");
    await controller.reportError(7, "Audio capture failed");

    expect(storage.values[STORAGE_KEYS.tabCaptureError(7)]).toBe("Audio capture failed");
  });

  test("ignores an error while a frame of the tab is connected", async () => {
    const storage = createStorage();
    const controller = createCaptureErrorController({ storage });

    await controller.trackFrameConnected(7, 0);
    await controller.reportError(7, "Audio capture failed");

    expect(storage.set).not.toHaveBeenCalled();
  });

  test("reports the error again after the connected frame disconnects", async () => {
    const storage = createStorage();
    const controller = createCaptureErrorController({ storage });

    await controller.trackFrameConnected(7, 0);
    await controller.trackFrameDisconnected(7, 0);
    await controller.reportError(7, "Audio capture failed");

    expect(storage.values[STORAGE_KEYS.tabCaptureError(7)]).toBe("Audio capture failed");
  });

  test("forgets the frames of a tab when its state is cleared", async () => {
    const storage = createStorage();
    const controller = createCaptureErrorController({ storage });

    await controller.trackFrameConnected(7, 0);
    await controller.clearTabFrames(7);
    await controller.reportError(7, "Audio capture failed");

    expect(storage.values[STORAGE_KEYS.tabCaptureError(7)]).toBe("Audio capture failed");
  });

  test("a failed write does not block the next update", async () => {
    const storage = createStorage();
    storage.set.mockRejectedValueOnce(new Error("quota exceeded"));
    const controller = createCaptureErrorController({ storage });

    await expect(controller.reportError(7, "Audio capture failed")).rejects.toThrow(
      "quota exceeded",
    );
    await controller.trackFrameConnected(7, 0);

    expect(storage.remove).toHaveBeenCalledWith(STORAGE_KEYS.tabCaptureError(7));
  });
});
