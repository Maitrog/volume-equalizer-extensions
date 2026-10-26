import { createLocalizationService } from "./localizationController";

type MessageMap = Record<string, { message: string }>;

const createResponse = (messages: MessageMap, ok = true): Response =>
  ({
    ok,
    json: vi.fn(async () => messages),
  }) as unknown as Response;

const createLocalizedElement = (i18n: string) => ({
  dataset: { i18n },
  textContent: "",
});

const createRoot = (elements: ReturnType<typeof createLocalizedElement>[]) =>
  ({
    querySelectorAll: vi.fn(() => elements),
    getElementById: vi.fn(() => null),
  }) as unknown as Document;

describe("createLocalizationService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("chrome", {
      i18n: {
        getMessage: vi.fn((messageName: string) => (messageName === "@@ui_locale" ? "en" : "")),
      },
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://id/${path}`),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("loads default and selected messages with instance-local fallback", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(createResponse({ reset_button_label: { message: "Reset" } }))
      .mockResolvedValueOnce(createResponse({ ready: { message: "Ready" } }));

    const service = createLocalizationService();
    await service.ready;

    expect(service.getMessage("reset_button_label")).toBe("Reset");
    expect(service.getMessage("missing_key")).toBe("missing_key");
  });

  test("saves selected language and runs injected dynamic refresh", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(createResponse({}))
      .mockResolvedValueOnce(createResponse({ ready: { message: "Ready" } }))
      .mockResolvedValueOnce(createResponse({ ready: { message: "Готово" } }));
    const refreshDynamicContent = vi.fn(async () => undefined);

    const service = createLocalizationService();
    await service.ready;
    await service.setLanguage("ru", { save: true, refreshDynamicContent });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ uiLanguage: "ru" });
    expect(refreshDynamicContent).toHaveBeenCalledOnce();
  });

  test.each(["network error", "unavailable file"])(
    "does not save a locale after %s",
    async (failure) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(createResponse({ reset_button_label: { message: "Reset" } }))
        .mockResolvedValueOnce(createResponse({ ready: { message: "Ready" } }));
      if (failure === "network error") {
        vi.mocked(fetch).mockRejectedValueOnce(new Error("network unavailable"));
      } else {
        vi.mocked(fetch).mockResolvedValueOnce(createResponse({}, false));
      }
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const service = createLocalizationService();
      await service.ready;

      await service.setLanguage("ru", { save: true });

      expect(chrome.storage.local.set).not.toHaveBeenCalledWith({ uiLanguage: "ru" });
      expect(service.getMessage("reset_button_label")).toBe("Reset");
      expect(consoleError).toHaveBeenCalled();
    },
  );

  test("applies and saves only the latest deferred language request", async () => {
    let resolveDe!: (response: Response) => void;
    let resolveRu!: (response: Response) => void;
    vi.mocked(fetch)
      .mockResolvedValueOnce(createResponse({ ready: { message: "Ready" } }))
      .mockResolvedValueOnce(createResponse({ ready: { message: "Ready" } }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDe = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRu = resolve;
          }),
      );
    const deRefresh = vi.fn(async () => undefined);
    const ruRefresh = vi.fn(async () => undefined);
    const service = createLocalizationService();
    await service.ready;

    const de = service.setLanguage("de", { save: true, refreshDynamicContent: deRefresh });
    const ru = service.setLanguage("ru", { save: true, refreshDynamicContent: ruRefresh });
    resolveRu(createResponse({ key: { message: "RU" } }));
    await ru;
    resolveDe(createResponse({ key: { message: "DE" } }));
    await de;

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ uiLanguage: "ru" });
    expect(deRefresh).not.toHaveBeenCalled();
    expect(ruRefresh).toHaveBeenCalledOnce();
    expect(service.getMessage("key")).toBe("RU");
  });

  test("waits for language fetch before its later storage write", async () => {
    vi.mocked(fetch).mockResolvedValue(createResponse({ ready: { message: "Ready" } }));
    const service = createLocalizationService();
    await service.ready;
    let finishFetch!: (response: Response) => void;
    let finishSave!: () => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    );
    vi.mocked(chrome.storage.local.set).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const change = service.setLanguage("ru", { save: true });
    const finished = vi.fn();
    const wait = service.waitForPendingChanges().then(finished);
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    finishFetch(createResponse({ ready: { message: "RU" } }));
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledOnce());
    expect(finished).not.toHaveBeenCalled();
    finishSave();
    await Promise.all([change, wait]);
    expect(finished).toHaveBeenCalledOnce();
    await service.applySavedLanguage("de");
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(service.getMessage("ready")).toBe("Ready");
  });

  test("saved language invalidates an older deferred locale", async () => {
    vi.mocked(fetch).mockResolvedValue(createResponse({ ready: { message: "Ready" } }));
    const service = createLocalizationService();
    await service.ready;
    let finishFetch!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    );
    const change = service.setLanguage("ru", { save: true });
    expect(await service.applySavedLanguage("de")).toBe(true);
    finishFetch(createResponse({ ready: { message: "RU" } }));
    await change;
    expect(service.getMessage("ready")).toBe("Ready");
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test("reports saved language apply failure", async () => {
    vi.mocked(fetch).mockResolvedValue(createResponse({ ready: { message: "Ready" } }));
    const service = createLocalizationService();
    await service.ready;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockRejectedValueOnce(new Error("locale unavailable"));
    expect(await service.applySavedLanguage("ru")).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(service.getMessage("ready")).toBe("Ready");
  });

  test("pending locale failures reject waiting without poisoning later waits", async () => {
    vi.mocked(fetch).mockResolvedValue(createResponse({ ready: { message: "Ready" } }));
    const service = createLocalizationService();
    await service.ready;
    vi.spyOn(console, "error").mockImplementation(() => {});
    let failFetch!: (error: Error) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failFetch = reject;
        }),
    );
    const change = service.setLanguage("ru", { save: true });
    const waiting = expect(service.waitForPendingChanges()).rejects.toThrow();
    failFetch(new Error("locale unavailable"));
    await Promise.all([change, waiting]);
    await expect(service.waitForPendingChanges()).resolves.toBeUndefined();
  });

  test("dynamic language refresh can wait for pending changes", async () => {
    vi.mocked(fetch).mockResolvedValue(createResponse({ ready: { message: "Ready" } }));
    const service = createLocalizationService();
    await service.ready;
    await service.setLanguage("ru", {
      save: true,
      refreshDynamicContent: () => service.waitForPendingChanges(),
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ uiLanguage: "ru" });
  });

  test("localizes elements declared with data-i18n", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(createResponse({ reset_button_label: { message: "Reset localized" } }))
      .mockResolvedValueOnce(createResponse({ ready: { message: "Ready" } }));
    const element = createLocalizedElement("reset_button_label");
    const service = createLocalizationService();
    await service.ready;

    service.applyLocalization(createRoot([element]));

    expect(element.textContent).toBe("Reset localized");
  });
});
