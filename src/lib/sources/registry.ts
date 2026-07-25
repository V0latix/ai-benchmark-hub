import { agentlensAdapter } from "./adapters/agentlens";
import { akitaAdapter } from "./adapters/akita";
import { codescalebenchAdapter } from "./adapters/codescalebench";
import { melvynxAdapter } from "./adapters/melvynx";
import { pyrosAdapter } from "./adapters/pyros";
import { swebenchAdapter } from "./adapters/swebench";
import { tinybirdAdapter } from "./adapters/tinybird";
import type { SourceAdapter } from "./types";

export const adapterRegistry: Record<string, SourceAdapter> = { melvynx: melvynxAdapter, akita: akitaAdapter, codescalebench: codescalebenchAdapter, swebench: swebenchAdapter, tinybird: tinybirdAdapter, pyros: pyrosAdapter, agentlens: agentlensAdapter };
export function getAdapter(adapter: string): SourceAdapter { const found = adapterRegistry[adapter]; if (!found) throw new Error(`Unknown adapter: ${adapter}`); return found; }
