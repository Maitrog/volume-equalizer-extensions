import { describe, expect, test, vi } from "vitest";

import type { ThemeColors } from "../../../domains/theme/themeColors";
import { drawAxis } from "./drawFrequencyAxis";
import { createSpectrumRenderer } from "./drawSpectrum";

const createColors = (suffix: string): ThemeColors => {
  return {
    accentStart: `accent-start-${suffix}`,
    accentMid: `accent-mid-${suffix}`,
    accentEnd: `accent-end-${suffix}`,
    highpassFilterColor: `highpass-${suffix}`,
    lowpassFilterColor: `lowpass-${suffix}`,
    panelBg: `panel-${suffix}`,
    axis: `axis-${suffix}`,
  };
};

const createCanvas = (): HTMLCanvasElement => {
  return {
    width: 100,
    height: 60,
    clientWidth: 100,
    clientHeight: 60,
  } as HTMLCanvasElement;
};

const createContext = (): CanvasRenderingContext2D & {
  gradient: CanvasGradient & { addColorStop: ReturnType<typeof vi.fn> };
} => {
  const gradient = {
    addColorStop: vi.fn(),
  } as unknown as CanvasGradient & { addColorStop: ReturnType<typeof vi.fn> };

  return {
    gradient,
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    closePath: vi.fn(),
    fill: vi.fn(),
    textAlign: "start",
    textBaseline: "alphabetic",
    strokeStyle: "",
    fillStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D & {
    gradient: CanvasGradient & { addColorStop: ReturnType<typeof vi.fn> };
  };
};

describe("equalizer canvas color providers", () => {
  test("drawAxis reads colors at draw time", () => {
    const canvas = createCanvas();
    const ctx = createContext();
    let colors = createColors("initial");

    drawAxis({
      canvas,
      ctx,
      getColors: () => colors,
    });

    expect(ctx.strokeStyle).toBe("axis-initial");

    colors = createColors("updated");
    drawAxis({
      canvas,
      ctx,
      getColors: () => colors,
    });

    expect(ctx.strokeStyle).toBe("axis-updated");
  });

  test("spectrum renderer reads colors at draw time", () => {
    const canvas = createCanvas();
    const ctx = createContext();
    let colors = createColors("initial");
    const renderer = createSpectrumRenderer({
      canvas,
      ctx,
      getColors: () => colors,
      requestAnimationFrame: (callback) => {
        callback(0);
        return 1;
      },
    });

    renderer.drawSpectrum([-90, -80, -70]);
    expect(ctx.gradient.addColorStop).toHaveBeenCalledWith(
      0,
      "accent-start-initial",
    );
    expect(ctx.strokeStyle).toBe("accent-mid-initial");

    colors = createColors("updated");
    ctx.gradient.addColorStop.mockClear();
    renderer.drawSpectrum([-90, -80, -70]);

    expect(ctx.gradient.addColorStop).toHaveBeenCalledWith(
      0,
      "accent-start-updated",
    );
    expect(ctx.strokeStyle).toBe("accent-mid-updated");
  });
});
