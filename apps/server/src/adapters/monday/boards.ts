/**
 * Board ids an agent's instructions mention, in any of the forms people write them:
 * `2000000001`, "Posts board (ID 2000000002)", or a .../boards/2000000003 link.
 * These are only candidates: item ids look the same, so callers confirm them with the API.
 */
export function boardIdCandidates(...texts: (string | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(/(?<![\w.-])(\d{10,12})(?![\w-])/g)) ids.add(m[1]!);
  }
  return [...ids];
}
