export type EqualizerFilterType = "peaking" | "highpass" | "lowpass";

export interface EqualizerFilter {
  freq: number;
  gain: number;
  q: number;
  type: EqualizerFilterType;
}
