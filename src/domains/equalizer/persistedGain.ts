export const readStoredGain = (value: unknown): number => {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const gain = Number(value);
  return Number.isFinite(gain) ? gain : 0;
};
