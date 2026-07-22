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

  test("localizes theme option labels used by settings and onboarding", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        createResponse({
          guide_theme_dark: { message: "Dark localized" },
          guide_theme_light: { message: "Light localized" },
        }),
      )
      .mockResolvedValueOnce(createResponse({}));
    const darkOption = { textContent: "" };
    const lightOption = { textContent: "" };
    const root = {
      getElementById: vi.fn((id: string) => {
        if (id === "theme-dark-option") return darkOption;
        if (id === "theme-light-option") return lightOption;
        return null;
      }),
    } as unknown as Document;
    const service = createLocalizationService();
    await service.ready;

    service.applyLocalization(root);

    expect(darkOption.textContent).toBe("Dark localized");
    expect(lightOption.textContent).toBe("Light localized");
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
    const elements = new Map(
      [
        ["donation-reminder-title", ""],
        ["donation-reminder-message", ""],
        ["donation-reminder-link", ""],
        ["donation-reminder-close", ""],
      ].map(([id, textContent]) => [id, { textContent }]),
    );
    const root = {
      getElementById: vi.fn((id: string) => elements.get(id) ?? null),
    } as unknown as Document;
    const service = createLocalizationService();
    await service.ready;

    service.applyLocalization(root);

    expect(elements.get("donation-reminder-title")?.textContent).toBe(
      "Title localized",
    );
    expect(elements.get("donation-reminder-message")?.textContent).toBe(
      "Message localized",
    );
    expect(elements.get("donation-reminder-link")?.textContent).toBe(
      "Link localized",
    );
    expect(elements.get("donation-reminder-close")?.textContent).toBe(
      "OK localized",
    );
  });
});
