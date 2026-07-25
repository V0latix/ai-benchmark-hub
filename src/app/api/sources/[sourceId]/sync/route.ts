import { NextResponse } from "next/server";

import { benchmarkSources } from "../../../../../lib/sources/config";
import { syncSources } from "../../../../../lib/sources/sync";

export async function POST(_request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  const source = benchmarkSources.find((candidate) => candidate.id === sourceId && candidate.enabled);
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
  const report = await syncSources({ sourceId });
  return NextResponse.json(report.sources[0]);
}
