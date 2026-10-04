import { describe, expect, it } from 'bun:test';

describe('Lexicon routing regex matching', () => {
  const matchRoute = (path) => {
    const normalized = path.replace(/\/+$/, '') || '/';
    const lexiconsMatch = normalized.match(/^\/lexicons?(?:\/([^\/]+))?$/);
    if (lexiconsMatch) {
      return {
        route: 'lexicons',
        params: { id: lexiconsMatch[1] || null },
      };
    }
    return null;
  };

  it('matches /lexicon as manager overview route with no ID', () => {
    const res = matchRoute('/lexicon');
    expect(res).not.toBeNull();
    expect(res.route).toBe('lexicons');
    expect(res.params.id).toBeNull();
  });

  it('matches /lexicons as manager overview route with no ID', () => {
    const res = matchRoute('/lexicons');
    expect(res).not.toBeNull();
    expect(res.route).toBe('lexicons');
    expect(res.params.id).toBeNull();
  });

  it('matches /lexicon/lex_abc as individual lexicon route with ID', () => {
    const res = matchRoute('/lexicon/lex_abc');
    expect(res).not.toBeNull();
    expect(res.route).toBe('lexicons');
    expect(res.params.id).toBe('lex_abc');
  });

  it('matches /lexicons/lex_456 as individual lexicon route with ID', () => {
    const res = matchRoute('/lexicons/lex_456');
    expect(res).not.toBeNull();
    expect(res.route).toBe('lexicons');
    expect(res.params.id).toBe('lex_456');
  });

  it('handles trailing slashes on both routes correctly', () => {
    const res1 = matchRoute('/lexicon/');
    expect(res1).not.toBeNull();
    expect(res1.params.id).toBeNull();

    const res2 = matchRoute('/lexicon/lex_789/');
    expect(res2).not.toBeNull();
    expect(res2.params.id).toBe('lex_789');
  });
});
