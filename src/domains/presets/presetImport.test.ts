import { describe, expect, test } from "vitest";

import { parsePresetImport, parsePresetImportData } from "./presetImport";

describe("parsePresetImport", () => {
  test("reads parsed legacy data without importing unlisted keys", () => {
    expect(
      parsePresetImportData({
        presetNames: [" Empty "],
        presets: { " Empty ": [], Ignored: "bad" },
      }),
    ).toEqual({ ok: true, presetNames: ["Empty"], presets: { Empty: [] } });
  });

  test("requires own preset keys and own structural fields", () => {
    expect(
      parsePresetImportData({
        presetNames: ["Inherited"],
        presets: Object.create({ Inherited: [] }),
      }),
    ).toEqual({ ok: false, error: "structure" });
    expect(parsePresetImportData(Object.create({ presetNames: [], presets: {} }))).toEqual({
      ok: false,
      error: "structure",
    });
  });

  test.each([
    "{",
    "null",
    '{"presetNames":"bad"}',
    '{"presetNames":["Broken"],"presets":{"Broken":{}}}',
  ])("rejects invalid import %s", (text) => {
    expect(parsePresetImport(text).ok).toBe(false);
  });

  test("round-trips the current export format", () => {
    const exported = {
      presetNames: ["Current"],
      presets: {
        Current: [
          { freq: 20, gain: 0, q: 0.1, type: "highpass", enabled: false },
          { freq: 1000, gain: 4, q: 1, type: "peaking" },
          { freq: 20000, gain: 0, q: 0.5, type: "lowpass", enabled: false },
        ],
      },
    };

    expect(parsePresetImport(JSON.stringify(exported))).toEqual({
      ok: true,
      ...exported,
    });
  });

  test("normalizes a legacy export without changing gain", () => {
    const exported = JSON.stringify({
      presetNames: ["Legacy"],
      presets: {
        Legacy: [
          { freq: "1000", gain: "-18.5", q: "2.5", x: 10, y: 20 },
          { freq: "2000", gain: "1000" },
        ],
      },
    });

    expect(parsePresetImport(exported)).toEqual({
      ok: true,
      presetNames: ["Legacy"],
      presets: {
        Legacy: [
          { freq: 1000, gain: -18.5, q: 2.5, type: "peaking" },
          { freq: 2000, gain: 1000, q: 0.5, type: "peaking" },
        ],
      },
    });
  });

  test.each([
    null,
    { freq: -1, gain: 0 },
    { freq: "Infinity", gain: 0 },
    { freq: 24001, gain: 0 },
    { freq: 100, gain: null },
    { freq: true, gain: 0 },
    { freq: " ", gain: 0 },
    { freq: 100, gain: 0, q: 0.09 },
    { freq: 100, gain: 0, q: 11 },
    { freq: 100, gain: 0, type: "bandpass" },
    { freq: 100, gain: 0, enabled: "false" },
  ])("rejects an invalid filter %#", (filter) => {
    expect(
      parsePresetImport(
        JSON.stringify({
          presetNames: ["Bad"],
          presets: { Bad: [filter] },
        }),
      ),
    ).toEqual({ ok: false, error: "filter" });
  });

  test.each(["", "  ", "__proto__", "constructor", "prototype"])(
    "rejects an unsafe or empty name %s",
    (name) => {
      const exported = JSON.stringify({
        presetNames: [name],
        presets: { [name]: [] },
      });

      expect(parsePresetImport(exported)).toEqual({ ok: false, error: "name" });
    },
  );

  test("rejects duplicate names after trimming", () => {
    const exported = JSON.stringify({
      presetNames: ["Mine", " Mine "],
      presets: { Mine: [], " Mine ": [] },
    });

    expect(parsePresetImport(exported)).toEqual({ ok: false, error: "name" });
  });

  test("does not impose a band-count limit", () => {
    const filters = Array.from({ length: 32 }, (_, index) => ({
      freq: index === 31 ? 24000 : index + 1,
      gain: 1000,
      q: 10,
      type: "peaking",
    }));

    const exported = JSON.stringify({
      presetNames: ["Many bands"],
      presets: { "Many bands": filters },
    });

    expect(parsePresetImport(exported)).toEqual({
      ok: true,
      presetNames: ["Many bands"],
      presets: { "Many bands": filters },
    });
  });
});
