import { describe, expect, it } from 'vitest';
import { globToRegExp } from '../src/graph/rationale.js';

describe('globToRegExp', () => {
  const m = (glob: string, path: string) => globToRegExp(glob).test(path);
  it('matches ** across directories, including none', () => {
    expect(m('**/*.md', 'CLAUDE.md')).toBe(true);
    expect(m('**/*.md', 'docs/adr/0001-x.md')).toBe(true);
    expect(m('**/*.md', 'src/a.ts')).toBe(false);
    expect(m('**/yarn.lock', 'yarn.lock')).toBe(true);
    expect(m('**/yarn.lock', 'web/yarn.lock')).toBe(true);
  });
  it('keeps * and ? inside one path segment, and dots literal', () => {
    expect(m('src/*.ts', 'src/a.ts')).toBe(true);
    expect(m('src/*.ts', 'src/x/a.ts')).toBe(false);
    expect(m('a?.ts', 'ab.ts')).toBe(true);
    expect(m('a?.ts', 'abxts')).toBe(false);
    expect(m('**/*.lock', 'Gemfile.lock')).toBe(true);
  });
});
