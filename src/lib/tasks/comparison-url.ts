export type RawComparisonSearchParams = Record<string, string | string[] | undefined>;

type BrowserSearchParams = {
  forEach(callback: (value: string, key: string) => void): void;
};

export function comparisonSearchSignature(input: RawComparisonSearchParams | BrowserSearchParams) {
  const pairs: Array<[string, string]> = [];

  if ("forEach" in input && typeof input.forEach === "function") {
    input.forEach((value, key) => pairs.push([key, value]));
  } else {
    for (const [key, rawValue] of Object.entries(input)) {
      if (Array.isArray(rawValue)) {
        for (const value of rawValue) pairs.push([key, value]);
      } else if (rawValue !== undefined) {
        pairs.push([key, rawValue]);
      }
    }
  }

  pairs.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey < rightKey) return -1;
    if (leftKey > rightKey) return 1;
    if (leftValue < rightValue) return -1;
    if (leftValue > rightValue) return 1;
    return 0;
  });

  return JSON.stringify(pairs);
}
