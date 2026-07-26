import { melvynxAdapter } from "./adapters/melvynx";
import type { SourceAdapter } from "./types";

export const adapterRegistry: Record<string, SourceAdapter> = { melvynx: melvynxAdapter };
export function getAdapter(adapter: string): SourceAdapter { const found = adapterRegistry[adapter]; if (!found) throw new Error(`Unknown adapter: ${adapter}`); return found; }
