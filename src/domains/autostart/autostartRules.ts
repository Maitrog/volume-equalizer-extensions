export type AutostartEntryType = "domain" | "url";

export interface AutostartWhitelistEntry {
  id: string;
  type: AutostartEntryType;
  value: string;
  presetName: string;
}

export const normalizeWhitelistUrl = (url: string): string => {
  try {
    const normalizedUrl = new URL(url);
    normalizedUrl.hash = "";
    return normalizedUrl.href;
  } catch (e) {
    return url;
  }
};

export const getWhitelistDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return url.split("/")[0].replace(/^www\./, "");
  }
};

export const normalizeAutostartSettingsUrlValue = (
  type: AutostartEntryType,
  value: string
): string => {
  if (!value) return "";
  const rawValue = value.trim();

  if (type === "domain") {
    return getWhitelistDomain(rawValue);
  }

  return normalizeWhitelistUrl(rawValue);
};

export const createWhitelistEntry = (
  type: AutostartEntryType,
  value: string,
  presetName: string
): AutostartWhitelistEntry | null => {
  if (!value || !presetName) return null;

  const normalizedValue = normalizeAutostartSettingsUrlValue(type, value);
  const normalizedPresetName = presetName.trim();

  return {
    id: `${type}:${normalizedValue}`,
    type,
    value: normalizedValue,
    presetName: normalizedPresetName,
  };
};

export const findWhitelistMatch = (
  entries: AutostartWhitelistEntry[] | null | undefined,
  url: string
): AutostartWhitelistEntry | undefined | null => {
  const normalizedUrl = normalizeWhitelistUrl(url);
  const domain = getWhitelistDomain(url);
  if (!normalizedUrl || !domain || !entries || entries.length === 0) {
    return null;
  }

  let urlRule: AutostartWhitelistEntry | undefined;
  let domainRule: AutostartWhitelistEntry | undefined;
  entries.forEach((entry) => {
    if (entry.type === "url" && entry.value === normalizedUrl) {
      urlRule = entry;
    }

    if (
      entry.type === "domain" &&
      (domain === entry.value || domain.endsWith("." + entry.value))
    ) {
      domainRule = entry;
    }
  });

  if (urlRule) return urlRule;

  return domainRule;
};

export const isPresetUsedInWhitelist = (
  entries: AutostartWhitelistEntry[] | null | undefined,
  presetName: string
): boolean => {
  return (entries ?? []).some((entry) => entry.presetName === presetName);
};
