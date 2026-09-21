import { hasClippingSample } from "../../domains/audio/clipping";

export interface SpectrumMeta {
  type: "meta";
  sampleRate: number;
  fftSize: number;
  minDb: number;
  maxDb: number;
  frequencyBinCount: number;
}

// The relay contract only carries finite numbers; silent bins read as -Infinity.
export const serializeSpectrumBuffer = (buffer: Float32Array, floor: number): number[] =>
  Array.from(buffer, (value) => (Number.isFinite(value) ? value : floor));

export const createSpectrumSampler = (
  onMeta: (meta: SpectrumMeta) => void,
  onFrame: (buffer: Float32Array | null, clipping: boolean) => void,
) => {
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let output: AudioNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let frequencies = new Float32Array(0);
  let samples = new Float32Array(0);

  const stop = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (output && analyser) output.disconnect(analyser);
    output = null;
    onFrame(null, false);
  };

  const start = (nextContext: AudioContext, nextOutput: AudioNode): void => {
    if (output === nextOutput && timer !== null) return;
    stop();
    if (context !== nextContext || !analyser) {
      context = nextContext;
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      frequencies = new Float32Array(analyser.frequencyBinCount);
      samples = new Float32Array(analyser.fftSize);
    }
    output = nextOutput;
    output.connect(analyser);
    onMeta({
      type: "meta",
      sampleRate: context.sampleRate,
      fftSize: analyser.fftSize,
      minDb: analyser.minDecibels,
      maxDb: analyser.maxDecibels,
      frequencyBinCount: analyser.frequencyBinCount,
    });
    const currentAnalyser = analyser;
    timer = setInterval(() => {
      currentAnalyser.getFloatFrequencyData(frequencies);
      currentAnalyser.getFloatTimeDomainData(samples);
      onFrame(frequencies, hasClippingSample(samples));
    }, 50);
  };

  return {
    start,
    stop,
    dispose: (): void => {
      stop();
      context = null;
      analyser = null;
      frequencies = new Float32Array(0);
      samples = new Float32Array(0);
    },
  };
};
