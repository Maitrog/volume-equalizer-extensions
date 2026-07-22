import type { EqualizerFilter } from "../equalizer/types";

type BiquadFilterMap = Record<number, BiquadFilterNode | undefined>;
type BiquadFilterInput = Pick<EqualizerFilter, "freq"> &
  Partial<Pick<EqualizerFilter, "gain" | "q" | "type">>;

export const getBiquadFilterCount = (filters: BiquadFilterMap): number => {
  let count = 0;
  while (filters[count]) count++;
  return count;
};

export const applyBiquadSettings = (
  biquadFilter: BiquadFilterNode,
  filter: BiquadFilterInput,
): void => {
  biquadFilter.type = filter.type ?? "peaking";
  biquadFilter.gain.value = Number(filter.gain ?? 0);
  biquadFilter.frequency.value = Number(filter.freq);
  biquadFilter.Q.value = Number(filter.q ?? 0.5);
};

export const createBiquadFilter = (
  context: BaseAudioContext,
  filter: BiquadFilterInput,
): BiquadFilterNode => {
  const biquadFilter = context.createBiquadFilter();
  applyBiquadSettings(biquadFilter, filter);
  return biquadFilter;
};

export const getLastBiquadFilter = <TFallbackNode extends AudioNode>(
  filters: BiquadFilterMap,
  fallbackNode: TFallbackNode,
): BiquadFilterNode | TFallbackNode => {
  const count = getBiquadFilterCount(filters);
  return count > 0 ? filters[count - 1] as BiquadFilterNode : fallbackNode;
};
