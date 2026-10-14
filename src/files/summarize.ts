/**
 * File and directory summaries: what the model is asked, and what code checks. A summary describes
 * WHAT code does — it is never presented as intent. Every symbol and dependency it names must appear
 * in the file; a directory summary may name only its own parts.
 */
const str = { type: 'string' };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

export interface FileSummary {
  purpose: string;
  responsibilities: Array<{ text: string; symbols: string[] }>;
  exports: string[];
  depends_on: string[];
}
export interface DirSummary { purpose: string; parts: Array<{ name: string; role: string }> }

export const FILE_SCHEMA = obj({
  purpose: str,
  responsibilities: { type: 'array', items: obj({ text: str, symbols: { type: 'array', items: str } }) },
  exports: { type: 'array', items: str },
  depends_on: { type: 'array', items: str },
});
export const DIR_SCHEMA = obj({ purpose: str, parts: { type: 'array', items: obj({ name: str, role: str }) } });

export const FILE_SYSTEM = [
  'You describe what one source file does, for an engineer new to the codebase.',
  '- purpose: one or two sentences — what this file is for, in plain words.',
  '- responsibilities: up to 5 things it does; for each, the exact names of the functions, classes, types or constants that do it, as written in the file.',
  '- exports: up to 8 names other files use from it, exactly as written.',
  '- depends_on: up to 8 modules or files it imports, exactly as they appear in its import lines.',
  'Describe only what the code does. Do not guess why it was written or what it used to do. Names must be copied exactly.',
].join('\n');

export const DIR_SYSTEM = [
  'You describe what one directory of a codebase is for, from summaries of its files and subdirectories.',
  '- purpose: one to three sentences — what this part of the codebase does as a whole.',
  '- parts: its most important files or subdirectories (up to 8), each with its role in a short phrase. Use the names exactly as listed.',
  'Describe only what the summaries support. If this is the repository root, describe the whole system.',
].join('\n');

const LIMITS = { responsibilities: 5, exports: 8, depends_on: 8, parts: 8 };
const has = (text: string, name: string) => {
  const n = name.trim();
  if (n.length < 2) return false;
  if (/^[\w$]+$/.test(n)) return new RegExp(`(^|[^\\w$])${n.replace(/\$/g, '\\$')}($|[^\\w$])`).test(text);
  return text.includes(n);
};

export interface Checked<T> { value: T; verified: number; checked: number; dropped: string[] }

/** Keep only names that exist in the file; report how much held up. */
export function checkFile(s: FileSummary, text: string): Checked<FileSummary> {
  const dropped: string[] = [];
  let verified = 0, checked = 0;
  const keep = (names: string[], cap: number) => names.slice(0, cap).filter((n) => { checked++; if (has(text, n)) { verified++; return true; } dropped.push(n); return false; });
  const responsibilities = (s.responsibilities ?? []).slice(0, LIMITS.responsibilities)
    .map((r) => ({ text: r.text, symbols: keep(r.symbols ?? [], 6) })).filter((r) => r.symbols.length > 0);
  return {
    value: { purpose: (s.purpose ?? '').trim(), responsibilities, exports: keep(s.exports ?? [], LIMITS.exports), depends_on: keep(s.depends_on ?? [], LIMITS.depends_on) },
    verified, checked, dropped,
  };
}

/** A directory summary may name only its own parts. */
export function checkDir(s: DirSummary, partNames: string[]): Checked<DirSummary> {
  // Subdirectories are listed to the model as "name/"; it often copies the slash. Compare without it.
  const bare = (n: string) => n.trim().replace(/\/+$/, '');
  const known = new Set(partNames.map(bare));
  const dropped: string[] = [];
  const parts = (s.parts ?? []).slice(0, LIMITS.parts).map((p) => ({ ...p, name: bare(p.name) }))
    .filter((p) => { if (known.has(p.name)) return true; dropped.push(p.name); return false; });
  return { value: { purpose: (s.purpose ?? '').trim(), parts }, verified: parts.length, checked: Math.min((s.parts ?? []).length, LIMITS.parts), dropped };
}
