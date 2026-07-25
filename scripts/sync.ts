import { parseSyncArgs } from "../src/lib/sources/cli";
import { syncSources } from "../src/lib/sources/sync";

async function main() {
  const options = parseSyncArgs(process.argv.slice(2));
  const report = await syncSources(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.sources.some((source) => source.status === "failed")) process.exitCode = 1;
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Unknown sync error"}\n`); process.exitCode = 1; });
