import { SourceStatusCard } from "../../components/source-status-card";
import { benchmarkSources } from "../../lib/sources/config";
import { getSyncReport } from "../../lib/storage/queries";
export const dynamic = "force-dynamic";
export default async function SourcesPage() { const report = await getSyncReport(); return <section><h1 className="text-3xl font-semibold text-white">Sources</h1><div className="mt-6 grid gap-4">{benchmarkSources.map((source) => <SourceStatusCard key={source.id} repo={source.repo} report={report.sources.find((item) => item.sourceId === source.id) ?? { sourceId: source.id, status: "idle", runCount: 0, syncedAt: null, error: null, warnings: [] }}/>)}</div></section>; }
