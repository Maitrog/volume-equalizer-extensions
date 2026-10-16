export type AutostartEntryType = "domain" | "url";

export interface AutostartWhitelistEntry {
  id: string;
  type: AutostartEntryType;
  value: string;
  presetName: string;
}

const readWhitelistUrl = (value: string, allowDomain: boolean): URL | null => {
  const rawValue = value.trim();
  if (!rawValue || /[\t\r\n]/.test(rawValue)) return null;
  const isBareDomain = allowDomain && !rawValue.includes("://");
  if (isBareDomain ? /[/?#\\]/.test(rawValue) : !/^https?:\/\/[^/\\]/i.test(rawValue)) return null;
  try {
    const url = new URL(isBareDomain ? `https://${rawValue}` : rawValue);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
};

export const normalizeWhitelistUrl = (url: string): string =>
  readWhitelistUrl(url, false)?.href ?? "";

export const getWhitelistDomain = (url: string): string =>
  readWhitelistUrl(url, true)?.hostname.replace(/^www\./, "") ?? "";

export const normalizeAutostartSettingsUrlValue = (
  type: AutostartEntryType,
  value: string,
): string => {
  if (type === "domain") {
    return getWhitelistDomain(value);
  }

  return normalizeWhitelistUrl(value);
};

export const createWhitelistEntry = (
  type: AutostartEntryType,
  value: string,
  presetName: string,
): AutostartWhitelistEntry | null => {
  const normalizedValue = normalizeAutostartSettingsUrlValue(type, value);
  const normalizedPresetName = presetName.trim();
  if (!normalizedValue || !normalizedPresetName) return null;

  return {
    id: `${type}:${normalizedValue}`,
    type,
    value: normalizedValue,
    presetName: normalizedPresetName,
  };
};

export const readAutostartRule = (value: unknown): AutostartWhitelistEntry | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (
    !Object.hasOwn(entry, "type") ||
    !Object.hasOwn(entry, "value") ||
    !Object.hasOwn(entry, "presetName") ||
    (entry.type !== "domain" && entry.type !== "url") ||
    typeof entry.value !== "string" ||
    typeof entry.presetName !== "string"
  )
    return null;
  return createWhitelistEntry(entry.type, entry.value, entry.presetName);
};

export const findWhitelistMatch = (
  entries: AutostartWhitelistEntry[] | null | undefined,
  url: string,
): AutostartWhitelistEntry | undefined | null => {
  const parsedUrl = readWhitelistUrl(url, false);
  if (!parsedUrl || !entries || entries.length === 0) {
    return null;
  }
  const normalizedUrl = parsedUrl.href;
  const domain = parsedUrl.hostname.replace(/^www\./, "");

  let urlRule: AutostartWhitelistEntry | undefined;
  let domainRule: AutostartWhitelistEntry | undefined;
  entries.forEach((entry) => {
    const normalized = readAutostartRule(entry);
    if (!normalized) return;
    if (normalized.type === "url" && normalized.value === normalizedUrl) {
      urlRule = entry;
    }

    if (
      normalized.type === "domain" &&
      (domain === normalized.value || domain.endsWith("." + normalized.value))
    ) {
      domainRule = entry;
    }
  });

  if (urlRule) return urlRule;

  return domainRule;
};

export const isPresetUsedInWhitelist = (
  entries: AutostartWhitelistEntry[] | null | undefined,
  presetName: string,
): boolean => {
  return (entries ?? []).some((entry) => entry.presetName === presetName);
};
