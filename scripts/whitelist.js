function normalizeWhitelistUrl(url) {
  try {
    const normalizedUrl = new URL(url);
    normalizedUrl.hash = "";
    return normalizedUrl.href;
  } catch (e) {
    return url;
  }
}

function getWhitelistDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return url.split("/")[0].replace(/^www\./, "");
  }
}

function normalizeAutostartSettingsUrlValue(type, value) {
  if (!value) return "";
  const rawValue = value.trim();

  if (type === "domain") {
    return getWhitelistDomain(rawValue);
  }

  return normalizeWhitelistUrl(rawValue);
}

function createWhitelistEntry(type, value, presetName) {
  if (!value || !presetName) return null;

  const normalizedValue = normalizeAutostartSettingsUrlValue(type, value);
  const normalizedPresetName = presetName.trim();

  return {
    id: `${type}:${normalizedValue}`,
    type: type,
    value: normalizedValue,
    presetName: normalizedPresetName,
  };
}

function findWhitelistMatch(entries, url) {
  const normalizedUrl = normalizeWhitelistUrl(url);
  const domain = getWhitelistDomain(url);
  if (!normalizedUrl || !domain || !entries || entries.lenght == 0) return null;

  let urlRule;
  let domainRule;
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
}

function isPresetUsedInWhitelist(entries, presetName) {
  return (entries ?? []).some((entry) => entry.presetName === presetName);
}
