import { readBoolean, readNumber, readStringArray } from "./storageNormalizers";

describe("storageNormalizers", () => {
  test("reads booleans only when the stored value is boolean", () => {
    expect(readBoolean(true, false)).toBe(true);
    expect(readBoolean("true", false)).toBe(false);
  });

  test("reads finite numbers only when the stored value is number", () => {
    expect(readNumber(3, 0)).toBe(3);
    expect(readNumber(Number.NaN, 0)).toBe(0);
    expect(readNumber("3", 0)).toBe(0);
  });

  test("reads string arrays only when every item is a string", () => {
    expect(readStringArray(["a", "b"])).toEqual(["a", "b"]);
    expect(readStringArray(["a", 1])).toEqual([]);
  });
});
