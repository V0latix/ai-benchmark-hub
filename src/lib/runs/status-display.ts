export function displayRunStatus(value: string | null | undefined): string {
  const status = value?.trim();
  return !status || status.toLowerCase() === "unknown" ? "—" : status;
}
