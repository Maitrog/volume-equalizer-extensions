import { STORAGE_KEYS } from "./storageKeys";

describe("storageKeys", () => {
  test("keeps legacy dynamic storage key strings", () => {
    expect(STORAGE_KEYS.tabFilters(12)).toBe("filters.12");
    expect(STORAGE_KEYS.tabEnabled("12")).toBe("enabled.12");
  });

  test("rejects missing tab ids at compile time", () => {
    // @ts-expect-error typed storage boundaries require a resolved tab id.
    STORAGE_KEYS.tabFilters(null);

    // @ts-expect-error typed storage boundaries require a resolved tab id.
    STORAGE_KEYS.tabFilters(undefined);
  });
});
