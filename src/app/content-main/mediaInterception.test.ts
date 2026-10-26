import { afterEach, expect, test, vi } from "vitest";

import { attachMediaInterception } from "./mediaInterception";

class FakeAudioNode {
  connect(destination: unknown): unknown {
    return destination;
  }
}

class FakeDestination extends FakeAudioNode {}

class FakeMediaElement {
  isConnected = false;

  play(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeWindow {
  Audio = FakeMediaElement;
  listeners = new Map<string, EventListener>();

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  dispatch(type: string, target: EventTarget): void {
    this.listeners.get(type)?.({ target } as unknown as Event);
  }
}

const nativeConnect = FakeAudioNode.prototype.connect;
const nativePlay = FakeMediaElement.prototype.play;

afterEach(() => {
  FakeAudioNode.prototype.connect = nativeConnect;
  FakeMediaElement.prototype.play = nativePlay;
  vi.unstubAllGlobals();
});

test("cleanup restores only proxies still owned by its interception instance", () => {
  const fakeWindow = new FakeWindow();
  const nativeAudio = fakeWindow.Audio;
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", { querySelectorAll: () => [] });
  vi.stubGlobal("AudioNode", FakeAudioNode);
  vi.stubGlobal("AudioDestinationNode", FakeDestination);
  vi.stubGlobal("HTMLMediaElement", FakeMediaElement);

  const dispose = attachMediaInterception({
    onMedia: vi.fn(),
    onDestinationConnect: (_source, destination, connect) => connect(destination),
  });
  const ownConnect = FakeAudioNode.prototype.connect;
  const ownPlay = FakeMediaElement.prototype.play;
  const ownAudio = fakeWindow.Audio;
  dispose();
  expect(FakeAudioNode.prototype.connect).toBe(nativeConnect);
  expect(FakeMediaElement.prototype.play).toBe(nativePlay);
  expect(fakeWindow.Audio).toBe(nativeAudio);

  const disposeReplaced = attachMediaInterception({
    onMedia: vi.fn(),
    onDestinationConnect: (_source, destination, connect) => connect(destination),
  });
  const replacementConnect = vi.fn(nativeConnect);
  const replacementPlay = vi.fn(nativePlay);
  const ReplacementAudio = class extends FakeMediaElement {};
  FakeAudioNode.prototype.connect = replacementConnect;
  FakeMediaElement.prototype.play = replacementPlay;
  fakeWindow.Audio = ReplacementAudio;
  disposeReplaced();
  expect(FakeAudioNode.prototype.connect).toBe(replacementConnect);
  expect(FakeMediaElement.prototype.play).toBe(replacementPlay);
  expect(fakeWindow.Audio).toBe(ReplacementAudio);
  expect(ownConnect).not.toBe(nativeConnect);
  expect(ownPlay).not.toBe(nativePlay);
  expect(ownAudio).not.toBe(nativeAudio);
});

test("reports existing, playing, inactive and detached Audio media", async () => {
  const existing = new FakeMediaElement();
  const fakeWindow = new FakeWindow();
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", { querySelectorAll: () => [existing] });
  vi.stubGlobal("AudioNode", FakeAudioNode);
  vi.stubGlobal("AudioDestinationNode", FakeDestination);
  vi.stubGlobal("HTMLMediaElement", FakeMediaElement);
  const onMedia = vi.fn();

  const dispose = attachMediaInterception({
    onMedia,
    onDestinationConnect: (_source, destination, connect) => connect(destination),
  });
  expect(onMedia).toHaveBeenCalledExactlyOnceWith(existing, "playing");
  onMedia.mockClear();

  fakeWindow.dispatch("playing", existing as unknown as EventTarget);
  expect(onMedia).toHaveBeenCalledExactlyOnceWith(existing, "playing");
  onMedia.mockClear();

  const detached = new window.Audio() as unknown as FakeMediaElement;
  expect(onMedia).toHaveBeenCalledExactlyOnceWith(detached, "playing");
  onMedia.mockClear();

  await detached.play();
  expect(onMedia).toHaveBeenCalledExactlyOnceWith(detached, "playing");
  onMedia.mockClear();

  fakeWindow.dispatch("pause", existing as unknown as EventTarget);
  expect(onMedia).toHaveBeenCalledExactlyOnceWith(existing, "inactive");
  dispose();
});
