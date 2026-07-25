const contentTypes: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  css: "text/css; charset=utf-8",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  otf: "font/otf",
  png: "image/png",
  svg: "image/svg+xml",
  ts: "text/javascript; charset=utf-8",
  tsx: "text/javascript; charset=utf-8",
  ttf: "font/ttf",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2"
};

export function getPreviewAssetContentType(path: string): string {
  const extension = path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return contentTypes[extension] ?? "application/octet-stream";
}
