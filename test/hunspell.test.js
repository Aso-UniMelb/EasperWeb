import { describe, it, expect, beforeEach } from 'bun:test';
import { loadModule } from 'hunspell-asm';

describe('hunspell-asm dynamic dictionary', () => {
  let factory;

  beforeEach(async () => {
    if (!factory) {
      factory = await loadModule();
    }
  });

  it('builds dictionary dynamically from word list and checks spelling', async () => {
    const aff = new TextEncoder().encode('SET UTF-8\n');
    const words = ['apple', 'banana', 'cherry'];
    const dicText = `${words.length}\n${words.join('\n')}\n`;
    const dic = new TextEncoder().encode(dicText);

    const affPath = factory.mountBuffer(aff);
    const dicPath = factory.mountBuffer(dic);
    const hunspell = factory.create(affPath, dicPath);

    expect(hunspell.spell('apple')).toBe(true);
    expect(hunspell.spell('banana')).toBe(true);
    expect(hunspell.spell('aple')).toBe(false);

    const suggestions = hunspell.suggest('aple');
    expect(suggestions).toContain('apple');

    hunspell.dispose();
    factory.unmount(affPath);
    factory.unmount(dicPath);
  });

  it('supports Kurdish Unicode words dynamically', async () => {
    const aff = new TextEncoder().encode('SET UTF-8\n');
    const words = ['کتێب', 'مامۆستا', 'ڕۆژباش'];
    const dicText = `${words.length}\n${words.join('\n')}\n`;
    const dic = new TextEncoder().encode(dicText);

    const affPath = factory.mountBuffer(aff);
    const dicPath = factory.mountBuffer(dic);
    const hunspell = factory.create(affPath, dicPath);

    expect(hunspell.spell('کتێب')).toBe(true);
    expect(hunspell.spell('مامۆستا')).toBe(true);
    expect(hunspell.spell('کتێپ')).toBe(false);

    const suggestions = hunspell.suggest('کتێپ');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toBe('کتێب');

    hunspell.dispose();
    factory.unmount(affPath);
    factory.unmount(dicPath);
  });
});
