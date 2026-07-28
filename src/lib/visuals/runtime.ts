import { SafeGitHubReader } from "../github/client";
import type { BenchmarkSource } from "../sources/types";
import { getEsmPackageVersion, isSafeEsmModulePath } from "./vendor";

const esmOrigin = "https://esm.sh";

export type RuntimeVersions = Partial<Record<"react" | "react-dom", string>>;

const runtimeVersionsCache = new Map<string, Promise<RuntimeVersions>>();

async function resolveRuntimeVersion(
  packageName: "react" | "react-dom",
  declaredVersion: string | undefined,
  fetcher: typeof fetch
): Promise<string | undefined> {
  if (!declaredVersion || !isSafeEsmModulePath(`${packageName}@${declaredVersion}`)) return declaredVersion;
  const response = await fetcher(`${esmOrigin}/${packageName}@${declaredVersion}?target=es2022`);
  if (!response.ok || new URL(response.url).origin !== esmOrigin) return declaredVersion;
  return getEsmPackageVersion(await response.text(), packageName) ?? declaredVersion;
}

export function getPreviewRuntimeVersions(
  cacheKey: string,
  source: BenchmarkSource,
  artifactDirectory: string,
  reader: SafeGitHubReader = new SafeGitHubReader(),
  fetcher: typeof fetch = fetch
): Promise<RuntimeVersions> {
  const cached = runtimeVersionsCache.get(cacheKey);
  if (cached) return cached;
  const runtimeVersions = (async () => {
    const manifest = JSON.parse(await reader.readText(source, `${artifactDirectory}/package.json`)) as { dependencies?: Record<string, string> };
    const [react, reactDom] = await Promise.all([
      resolveRuntimeVersion("react", manifest.dependencies?.react, fetcher),
      resolveRuntimeVersion("react-dom", manifest.dependencies?.["react-dom"], fetcher)
    ]);
    return { react, "react-dom": reactDom };
  })();
  runtimeVersionsCache.set(cacheKey, runtimeVersions);
  runtimeVersions.catch(() => runtimeVersionsCache.delete(cacheKey));
  return runtimeVersions;
}
