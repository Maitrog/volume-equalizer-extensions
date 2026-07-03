import { describe, expect, test } from "vitest";

import {
  createWhitelistEntry,
  findWhitelistMatch,
  getWhitelistDomain,
  normalizeAutostartSettingsUrlValue,
  normalizeWhitelistUrl,
} from "./autostartRules";

describe("autostartRules", () => {
  test("normalizes whitelist urls by removing fragments", () => {
    expect(normalizeWhitelistUrl("https://example.com/path#section")).toBe(
      "https://example.com/path"
    );
  });

  test("gets whitelist domains without a leading www prefix", () => {
    expect(getWhitelistDomain("https://www.example.com/path")).toBe(
      "example.com"
    );
  });

  test("creates normalized domain whitelist entries", () => {
    expect(
      createWhitelistEntry("domain", "https://www.example.com/page", "Rock")
    ).toEqual({
      id: "domain:example.com",
      type: "domain",
      value: "example.com",
      presetName: "Rock",
    });
  });

  test("finds exact url matches before domain matches", () => {
    const urlEntry = {
      id: "url:https://example.com/path",
      type: "url" as const,
      value: "https://example.com/path",
      presetName: "Exact",
    };
    const domainEntry = {
      id: "domain:example.com",
      type: "domain" as const,
      value: "example.com",
      presetName: "Domain",
    };

    expect(
      findWhitelistMatch([domainEntry, urlEntry], "https://example.com/path#top")
    ).toBe(urlEntry);
  });

  test("returns null when no whitelist entries exist", () => {
    expect(findWhitelistMatch([], "https://example.com/path")).toBeNull();
  });

  test("normalizes autostart setting values by type", () => {
    expect(
      normalizeAutostartSettingsUrlValue(
        "domain",
        " https://www.example.com/path#section "
      )
    ).toBe("example.com");
    expect(
      normalizeAutostartSettingsUrlValue(
        "url",
        " https://www.example.com/path#section "
      )
    ).toBe("https://www.example.com/path");
  });
});
