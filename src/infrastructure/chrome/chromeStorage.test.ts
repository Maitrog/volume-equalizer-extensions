describe("chromeStorage", () => {
  test("can be imported without a chrome global", async () => {
    const originalChrome = globalThis.chrome;

    try {
      delete (globalThis as { chrome?: typeof chrome }).chrome;

      const module = await import("./chromeStorage");

      expect(typeof module.createChromeStorageArea).toBe("function");
      expect(typeof module.getLocalStorageArea).toBe("function");
      expect(typeof module.getSessionStorageArea).toBe("function");
    } finally {
      if (originalChrome) {
        (globalThis as { chrome?: typeof chrome }).chrome = originalChrome;
      }
    }
  });
});
