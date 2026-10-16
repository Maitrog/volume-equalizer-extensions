import { describe, expect, test } from "vitest";

import {
  createWhitelistEntry,
  findWhitelistMatch,
  getWhitelistDomain,
  normalizeAutostartSettingsUrlValue,
  normalizeWhitelistUrl,
  readAutostartRule,
} from "./autostartRules";

describe("autostartRules", () => {
  test.each(["EXAMPLE.com", "www.example.com", "https://example.com/path"])(
    "canonicalizes domain %s and ignores an input id",
    (value) => {
      expect(
        readAutostartRule({ id: "fake", type: "domain", value, presetName: " Voice " }),
      ).toEqual({
        id: "domain:example.com",
        type: "domain",
        value: "example.com",
        presetName: "Voice",
      });
      expect(createWhitelistEntry("domain", value, " Voice ")?.id).toBe("domain:example.com");
    },
  );

  test.each([
    "",
    "   ",
    "javascript:alert(1)",
    "https://bad host/a",
    "https://user:secret@example.com/a",
    "user:secret@example.com",
    "https://exa\tmple.com",
  ])("rejects unsafe or invalid addresses %j", (value) => {
    expect(readAutostartRule({ type: "domain", value, presetName: "Voice" })).toBeNull();
    expect(createWhitelistEntry("url", value, "Voice")).toBeNull();
    expect(getWhitelistDomain(value)).toBe("");
  });

  test.each([
    null,
    {},
    { type: "other", value: "example.com", presetName: "Voice" },
    { type: "domain", value: 1, presetName: "Voice" },
    { type: "domain", value: "example.com", presetName: " " },
    { type: "url", value: "example.com", presetName: "Voice" },
  ])("rejects malformed rules %j", (value) => {
    expect(readAutostartRule(value)).toBeNull();
  });

  test.each(["https:example.com/a", "https:/example.com/a", "https:///example.com/a"])(
    "requires a complete URL %s",
    (value) => {
      expect(readAutostartRule({ type: "url", value, presetName: "Voice" })).toBeNull();
    },
  );

  test.each(["/example.com", "example.com/path", "//example.com", "example.com?q=1"])(
    "requires a bare host or full URL for a domain %s",
    (value) => {
      expect(readAutostartRule({ type: "domain", value, presetName: "Voice" })).toBeNull();
    },
  );

  test("keeps path, query, protocol and rule type in identities", () => {
    const inputs = [
      ["url", "https://example.com/a#one"],
      ["url", "https://example.com/a#two"],
      ["url", "https://example.com/b"],
      ["url", "http://example.com/a"],
      ["url", "https://example.com/a?q=1"],
      ["domain", "https://example.com/a"],
    ];
    expect(
      inputs.map(([type, value]) => readAutostartRule({ type, value, presetName: "Voice" })?.id),
    ).toEqual([
      "url:https://example.com/a",
      "url:https://example.com/a",
      "url:https://example.com/b",
      "url:http://example.com/a",
      "url:https://example.com/a?q=1",
      "domain:example.com",
    ]);
  });

  test("normalizes saved values while retaining exact URL and last domain precedence", () => {
    const first = {
      id: "old1",
      type: "domain" as const,
      value: "WWW.EXAMPLE.com",
      presetName: "First",
    };
    const last = {
      id: "old2",
      type: "domain" as const,
      value: "https://example.com/old",
      presetName: "Last",
    };
    const exact = {
      id: "old3",
      type: "url" as const,
      value: "https://EXAMPLE.com/a#old",
      presetName: "Exact",
    };
    expect(findWhitelistMatch([first, exact, last], "https://example.com/a#new")).toBe(exact);
    expect(findWhitelistMatch([first, last], "https://sub.example.com/b")).toBe(last);
    expect(findWhitelistMatch([first], "https://otherexample.com/")).toBeUndefined();
  });

  test("normalizes whitelist urls by removing fragments", () => {
    expect(normalizeWhitelistUrl("https://example.com/path#section")).toBe(
      "https://example.com/path",
    );
  });

  test("gets whitelist domains without a leading www prefix", () => {
    expect(getWhitelistDomain("https://www.example.com/path")).toBe("example.com");
  });

  test("creates normalized domain whitelist entries", () => {
    expect(createWhitelistEntry("domain", "https://www.example.com/page", "Rock")).toEqual({
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

    expect(findWhitelistMatch([domainEntry, urlEntry], "https://example.com/path#top")).toBe(
      urlEntry,
    );
  });

  test("returns null when no whitelist entries exist", () => {
    expect(findWhitelistMatch([], "https://example.com/path")).toBeNull();
  });

  test("normalizes autostart setting values by type", () => {
    expect(
      normalizeAutostartSettingsUrlValue("domain", " https://www.example.com/path#section "),
    ).toBe("example.com");
    expect(
      normalizeAutostartSettingsUrlValue("url", " https://www.example.com/path#section "),
    ).toBe("https://www.example.com/path");
  });
});
