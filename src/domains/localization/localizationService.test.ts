import { createLocalizationService } from "./localizationService";

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

  test("localizes theme option labels used by settings and onboarding", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        createResponse({
          guide_theme_dark: { message: "Dark localized" },
          guide_theme_light: { message: "Light localized" },
        }),
      )
      .mockResolvedValueOnce(createResponse({}));
    const darkOption = createLocalizedElement("guide_theme_dark");
    const lightOption = createLocalizedElement("guide_theme_light");
    const service = createLocalizationService();
    await service.ready;

    service.applyLocalization(createRoot([darkOption, lightOption]));

    expect(darkOption.textContent).toBe("Dark localized");
    expect(lightOption.textContent).toBe("Light localized");
  });

  test("localizes elements declared with data-i18n", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        createResponse({ reset_button_label: { message: "Reset localized" } }),
      )
      .mockResolvedValueOnce(createResponse({}));
    const element = createLocalizedElement("reset_button_label");
    const service = createLocalizationService();
    await service.ready;

    service.applyLocalization(createRoot([element]));

    expect(element.textContent).toBe("Reset localized");
  });

  test("localizes the donation reminder", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        createResponse({
          donation_reminder_title: { message: "Title localized" },
          donation_reminder_message: { message: "Message localized" },
          donation_reminder_link: { message: "Link localized" },
          ok: { message: "OK localized" },
        }),
      )
      .mockResolvedValueOnce(createResponse({}));
    const elements = [
      createLocalizedElement("donation_reminder_title"),
      createLocalizedElement("donation_reminder_message"),
      createLocalizedElement("donation_reminder_link"),
      createLocalizedElement("ok"),
    ];
    const service = createLocalizationService();
    await service.ready;

    service.applyLocalization(createRoot(elements));

    expect(elements.map(({ textContent }) => textContent)).toEqual([
      "Title localized",
      "Message localized",
      "Link localized",
      "OK localized",
    ]);
  });
});
