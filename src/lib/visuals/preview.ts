function rawDirectoryUrl(repo: string, branch: string, filePath: string): string {
  const directory = filePath.split("/").slice(0, -1).map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${directory}/`;
}

export function getPreviewProxyUrl(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/visual`;
}

export function getPreviewAssetBase(repo: string, branch: string, filePath: string): string {
  return rawDirectoryUrl(repo, branch, filePath);
}

export function injectPreviewBase(html: string, baseUrl: string): string {
  const base = `<base href="${baseUrl}">`;
  return /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${base}`) : `${base}${html}`;
}
