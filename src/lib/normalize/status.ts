import type { RunStatus } from "../sources/types";

export function normalizeStatus(value: unknown): RunStatus {
  const text = String(value ?? "").trim().toLowerCase();

  if (/timeout|timed out|deadline exceeded/.test(text)) return "timeout";
  if (/partial|incomplete/.test(text)) return "partial";
  if (/fail|error|abort/.test(text)) return "failed";
  if (/success|pass|complete|ok/.test(text)) return "success";

  return "unknown";
}
