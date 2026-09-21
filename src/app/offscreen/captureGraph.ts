import {
  applyBiquadSettings,
  createBiquadFilter,
  getBiquadHeadroomGain,
} from "../../domains/audio/biquadChain";
import { dbToGain } from "../../domains/equalizer/equalizerMath";
import type { EqualizerFilter } from "../../domains/equalizer/types";

const toBiquadInput = (filter: EqualizerFilter) => ({
  freq: filter.freq,
  gain: filter.gain,
  q: filter.q,
  type: filter.type,
});

export interface CaptureGraph {
  readonly source: MediaStreamAudioSourceNode;
  readonly preamp: GainNode;
  readonly filters: readonly BiquadFilterNode[];
  readonly output: AudioNode;
  readonly enabled: boolean;
  readonly gainValue: number;
  readonly muted: boolean;
  readonly volumeCompensationEnabled: boolean;
  readonly filterSettings: EqualizerFilter[];
  update(
    settings: Partial<{
      enabled: boolean;
      gainValue: number;
      muted: boolean;
      volumeCompensationEnabled: boolean;
      filterSettings: EqualizerFilter[];
    }>,
  ): void;
  dispose(): void;
}

export const createCaptureGraph = (deps: {
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  enabled: boolean;
  gainValue: number;
  muted: boolean;
  volumeCompensationEnabled: boolean;
  filterSettings: EqualizerFilter[];
  onBeforeOutputChange(output: AudioNode): void;
  onOutputChange(output: AudioNode): void;
}): CaptureGraph => {
  let enabled = deps.enabled;
  let gainValue = deps.gainValue;
  let muted = deps.muted;
  let volumeCompensationEnabled = deps.volumeCompensationEnabled;
  let filterSettings = deps.filterSettings;
  let preamp: GainNode;
  let filters: BiquadFilterNode[] = [];
  let output: AudioNode;
  let disposed = false;

  const calculateGain = (): number => {
    if (muted) return 0;
    if (!enabled) return 1;
    const compensationGain = volumeCompensationEnabled
      ? getBiquadHeadroomGain(filters, deps.audioContext.sampleRate)
      : 1;
    return dbToGain(gainValue) * compensationGain;
  };

  const disconnectOwnedNodes = (): void => {
    if (output) deps.onBeforeOutputChange(output);
    deps.source.disconnect();
    preamp?.disconnect();
    filters.forEach((filter) => filter.disconnect());
    filters = [];
  };

  const rebuild = (): void => {
    if (preamp) disconnectOwnedNodes();
    const nextFilters: BiquadFilterNode[] = [];
    let nextPreamp: GainNode | null = null;
    try {
      nextPreamp = deps.audioContext.createGain();
      deps.source.connect(nextPreamp);
      let previousNode: AudioNode = nextPreamp;
      if (enabled) {
        filterSettings.forEach((filter) => {
          const node = createBiquadFilter(deps.audioContext, toBiquadInput(filter));
          previousNode.connect(node);
          previousNode = node;
          nextFilters.push(node);
        });
      }
      previousNode.connect(deps.audioContext.destination);
      preamp = nextPreamp;
      filters = nextFilters;
      output = previousNode;
      preamp.gain.value = calculateGain();
      deps.onOutputChange(output);
    } catch (error) {
      [deps.source, nextPreamp, ...nextFilters].forEach((node) => {
        if (!node) return;
        try {
          node.disconnect();
        } catch (cleanupError) {
          console.error("Failed to roll back capture graph", cleanupError);
        }
      });
      throw error;
    }
  };

  const update: CaptureGraph["update"] = (settings) => {
    if (disposed) return;
    const previousEnabled = enabled;
    const previousCount = filterSettings.length;
    enabled = settings.enabled ?? enabled;
    gainValue = settings.gainValue ?? gainValue;
    muted = settings.muted ?? muted;
    volumeCompensationEnabled = settings.volumeCompensationEnabled ?? volumeCompensationEnabled;
    filterSettings = settings.filterSettings ?? filterSettings;
    if (enabled !== previousEnabled || (enabled && filterSettings.length !== previousCount)) {
      rebuild();
      return;
    }
    if (enabled) {
      filterSettings.forEach((filter, index) => {
        const node = filters[index];
        if (node) applyBiquadSettings(node, toBiquadInput(filter));
      });
    }
    preamp.gain.value = calculateGain();
  };

  rebuild();

  return {
    source: deps.source,
    get preamp() {
      return preamp;
    },
    get filters() {
      return filters;
    },
    get output() {
      return output;
    },
    get enabled() {
      return enabled;
    },
    get gainValue() {
      return gainValue;
    },
    get muted() {
      return muted;
    },
    get volumeCompensationEnabled() {
      return volumeCompensationEnabled;
    },
    get filterSettings() {
      return filterSettings;
    },
    update,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disconnectOwnedNodes();
    },
  };
};
