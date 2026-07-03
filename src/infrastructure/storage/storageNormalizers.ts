export const readBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;

  return fallback;
};

export const readNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  return fallback;
};

export const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  if (!value.every((item) => typeof item === "string")) return [];

  return value;
};
