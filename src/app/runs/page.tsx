import { RunTable } from "../../components/run-table";
import { queryRuns } from "../../lib/storage/queries";
export const dynamic = "force-dynamic";
export default async function RunsPage() { return <section><h1 className="text-3xl font-semibold text-white">Runs</h1><div className="mt-6"><RunTable runs={await queryRuns()}/></div></section>; }
