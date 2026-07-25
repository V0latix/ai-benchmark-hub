export function parseMarkdownFacts(markdown: string): Record<string, string> {
  const facts: Record<string, string> = {};
  const linePattern = /^\s*(?:[-*]\s+)?(?:\*\*)?([^:*\n]+?)(?:\*\*)?\s*:\s*(.+?)\s*$/gm;

  for (const match of markdown.matchAll(linePattern)) {
    const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
    const value = match[2].trim().replace(/^`|`$/g, "");
    if (key && value) facts[key] = value;
  }

  return facts;
}
