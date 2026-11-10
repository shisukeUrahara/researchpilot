/**
 * Keeps API identifiers whole AND searchable by their parts (SearchLab ADR 0002).
 * "x-ratelimit-remaining" -> ["x-ratelimit-remaining", "x", "ratelimit", "remaining"]
 * New for Atlas: camelCase and PascalCase names are split too, so "InMemorySaver" also
 * matches "memory" and "saver", and snake_case parts are indexed.
 */
const COMPOUND = /[a-z0-9_]+(?:[-.][a-z0-9_]+)*=?/g;
const PART = /[a-z0-9]+/g;
const CAMEL = /[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+/g;

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // Camel parts come from the original casing, before lowercasing.
  const camel = new Map<string, string[]>();
  for (const word of text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []) {
    const parts = word.match(CAMEL) ?? [];
    if (parts.length > 1) camel.set(word.toLowerCase(), parts.map((p) => p.toLowerCase()));
  }
  for (const compound of text.toLowerCase().match(COMPOUND) ?? []) {
    tokens.push(compound);
    const parts = compound.match(PART) ?? [];
    if (parts.length > 1 || parts[0] !== compound) tokens.push(...parts);
    for (const p of parts) {
      const split = camel.get(p);
      if (split) tokens.push(...split);
    }
  }
  return tokens;
}
