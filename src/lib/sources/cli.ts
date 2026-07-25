export function parseSyncArgs(args: string[]): { sourceId?: string; force: boolean } {
  const sourceFlag = args.indexOf("--source");
  if (sourceFlag >= 0 && !args[sourceFlag + 1]) throw new Error("Missing source id");
  const unsupported = args.filter((arg, index) => arg.startsWith("--") && arg !== "--force" && !(arg === "--source") && index !== sourceFlag + 1);
  if (unsupported.length) throw new Error(`Unsupported argument: ${unsupported[0]}`);
  return { sourceId: sourceFlag >= 0 ? args[sourceFlag + 1] : undefined, force: args.includes("--force") };
}
