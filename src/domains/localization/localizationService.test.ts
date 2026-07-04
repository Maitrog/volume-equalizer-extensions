import { createLocalizationService } from "./localizationService";

type MessageMap = Record<string, { message: string }>;

const createResponse = (messages: MessageMap, ok = true): Response =>
  ({
    ok,
    json: vi.fn(async () => messages),
  }) as unknown as Response;

describe("createLocalizationService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("chrome", {
      i18n: {
        getMessage: vi.fn((messageName: string) =>
          messageName === "@@ui_locale" ? "en" : "",
        ),
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
      .mockResolvedValueOnce(
        createResponse({ reset_button_label: { message: "Reset" } }),
      )
      .mockResolvedValueOnce(createResponse({}));

    const service = createLocalizationService();
    await service.ready;

    expect(service.getMessage("reset_button_label")).toBe("Reset");
    expect(service.getMessage("missing_key")).toBe("missing_key");
  });

  test("saves selected language and runs injected dynamic refresh", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(createResponse({}))
      .mockResolvedValueOnce(createResponse({}))
      .mockResolvedValueOnce(createResponse({}));
    const refreshDynamicContent = vi.fn(async () => undefined);

    const service = createLocalizationService();
    await service.ready;
    await service.setLanguage("ru", { save: true, refreshDynamicContent });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ uiLanguage: "ru" });
    expect(refreshDynamicContent).toHaveBeenCalledOnce();
  });
});
