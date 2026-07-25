import type { BenchmarkSource } from "../sources/types";

const blockedName = /(^|\/)(?:\.env(?:\.|$)|\.git|id_rsa|credentials?|secrets?)(?:\/|$|\.)/i;

function globToExpression(glob: string): RegExp {
  const escaped = glob.replace(/\*\*\//g, "::DOUBLE_STAR_DIRECTORY::")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR_DIRECTORY::/g, "(?:.*/)?")
    .replace(/::DOUBLE_STAR::/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function isAllowedPath(source: BenchmarkSource, filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || blockedName.test(normalized)) return false;

  return source.allowlist.some((pattern) => globToExpression(pattern).test(normalized));
}

export function isTextPath(filePath: string): boolean {
  return /\.(?:csv|css|html?|jsonl?|md|ya?ml|log|txt|svg|[cm]?[jt]sx?)$/i.test(filePath);
}
