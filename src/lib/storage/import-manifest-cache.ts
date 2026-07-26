import { unstable_cache } from "next/cache";

import {
  createImportedRunsReader,
  loadImportedRunsSnapshot
} from "./import-manifest";

const readCachedImportedRunsSnapshot = unstable_cache(
  loadImportedRunsSnapshot,
  ["melvynx-imported-runs-snapshot-v1"],
  { revalidate: 300, tags: ["melvynx-imports"] }
);

export const readImportedRuns = createImportedRunsReader(readCachedImportedRunsSnapshot);
