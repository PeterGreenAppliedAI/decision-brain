import { describe, expect, it } from 'vitest';

describe('adding a repository from the page', () => {
  it('accepts only public GitHub repository URLs, and names the graph safely', async () => {
    const { parseGithubUrl, graphNameFor } = await import('../src/web/add.js');
    expect(parseGithubUrl('https://github.com/thomvaill/log4brains')).toEqual({ owner: 'thomvaill', repo: 'log4brains' });
    expect(parseGithubUrl('https://github.com/a-b/c.d_e.git/')).toEqual({ owner: 'a-b', repo: 'c.d_e' });
    for (const bad of ['http://github.com/a/b', 'https://gitlab.com/a/b', 'https://github.com/a', 'https://github.com/a/b/tree/main',
      'https://github.com/a/..', 'file:///etc', 'https://github.com/a/b;rm -rf', 'git@github.com:a/b.git']) expect(parseGithubUrl(bad)).toBeNull();
    expect(graphNameFor('My.Repo')).toBe('my-repo');
    expect(graphNameFor('...')).toBe('');
  });

  it('refuses before touching the network: when off, a bad URL, a name that exists', async () => {
    const off = await import('../src/web/add.js');
    if (!off.addEnabled) expect(await off.startAdd('https://github.com/a/b', false, [])).toEqual({ error: expect.stringMatching(/off/) });
    process.env.WEB_ALLOW_INGEST = '1';
    const { vi } = await import('vitest');
    vi.resetModules();
    const on = await import('../src/web/add.js');
    expect(on.addEnabled).toBe(true);
    expect(await on.startAdd('https://example.com/a/b', false, [])).toEqual({ error: expect.stringMatching(/GitHub URL/) });
    expect(await on.startAdd('https://github.com/x/Invarail', false, ['invarail'])).toEqual({ error: expect.stringMatching(/already exists/) });
    delete process.env.WEB_ALLOW_INGEST;
  });
});
