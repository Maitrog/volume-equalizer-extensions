import { describe, expect, test } from "vitest";

import { claimContentInstance } from "./contentInstance";

describe("claimContentInstance", () => {
  test("invalidates the previous instance when the bridge is reclaimed", () => {
    const bridge = { dataset: {} } as Pick<HTMLElement, "dataset">;
    const isFirstCurrent = claimContentInstance(bridge);
    const isSecondCurrent = claimContentInstance(bridge);

    expect(isFirstCurrent()).toBe(false);
    expect(isSecondCurrent()).toBe(true);
  });
});
