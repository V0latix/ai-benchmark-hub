import { readCache } from "./json-store";

export async function getSyncReport() {
  return (await readCache()).report;
}
