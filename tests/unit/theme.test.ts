import { describe, expect, it } from 'vitest';
import { BUILT_IN_THEMES, ThemeLinkError, parseThemeLink, themeQuery, themeShareLink } from '../../extension/src/shared/theme';

// The example link published by MacStories when Noir introduced theme sharing (evidence E4).
const NOIR_EXAMPLE = 'https://getnoir.app/theme?name=John%E2%80%99s%20Theme&bg=182530&text=DBB745&imageBrightness=0.93';

describe('Noir-compatible theme links', () => {
  it('imports the published Noir example link', () => {
    expect(parseThemeLink(NOIR_EXAMPLE)).toEqual({
      name: 'John’s Theme',
      background: '#182530',
      text: '#dbb745',
      imageBrightness: 0.93,
      grayscale: 0,
    });
  });

  it('accepts the noir:// form the getnoir.app/theme page opens', () => {
    const t = parseThemeLink('noir://theme?name=Dusk&bg=101010&text=EEEEEE&imageBrightness=0.8');
    expect(t).toMatchObject({ name: 'Dusk', background: '#101010', text: '#eeeeee', imageBrightness: 0.8 });
  });

  it('accepts nyx links, bare queries and trailing slashes', () => {
    expect(parseThemeLink('https://mohsen1.github.io/nyx/theme/?name=A&bg=000&text=fff').background).toBe('#000000');
    expect(parseThemeLink('nyx://theme?name=A&bg=000&text=fff').text).toBe('#ffffff');
    expect(parseThemeLink('name=A&bg=111111&text=eeeeee&grayscale=1').grayscale).toBe(1);
  });

  it('defaults optional values and clamps out-of-range ones', () => {
    const t = parseThemeLink('https://getnoir.app/theme?bg=000000&text=ffffff&imageBrightness=7');
    expect(t.name).toBe('Imported Theme');
    expect(t.imageBrightness).toBe(0.3); // 7 → 0.07 (percent) → clamped to the minimum
    expect(parseThemeLink('https://getnoir.app/theme?bg=000000&text=ffffff').imageBrightness).toBe(1);
  });

  it('rejects links without colors or pointing elsewhere', () => {
    expect(() => parseThemeLink('https://getnoir.app/theme?name=x')).toThrow(ThemeLinkError);
    expect(() => parseThemeLink('https://example.com/other?bg=000&text=fff')).toThrow(ThemeLinkError);
    expect(() => parseThemeLink('')).toThrow(ThemeLinkError);
  });

  it('round-trips through the share link it produces', () => {
    const theme = { id: 'x', name: 'John’s Theme', background: '#182530', text: '#dbb745', imageBrightness: 0.93, grayscale: 0 };
    expect(themeQuery(theme)).toBe('name=John%E2%80%99s%20Theme&bg=182530&text=DBB745&imageBrightness=0.93');
    expect(themeShareLink(theme, 'noir')).toBe(NOIR_EXAMPLE);
    for (const base of ['nyx', 'noir'] as const) {
      const { name, background, text, imageBrightness, grayscale } = theme;
      expect(parseThemeLink(themeShareLink(theme, base))).toEqual({ name, background, text, imageBrightness, grayscale });
    }
  });
});

describe('built-in library', () => {
  it('has more than 20 themes with unique ids and valid colors', () => {
    expect(BUILT_IN_THEMES.length).toBeGreaterThan(20);
    expect(new Set(BUILT_IN_THEMES.map((t) => t.id)).size).toBe(BUILT_IN_THEMES.length);
    for (const t of BUILT_IN_THEMES) {
      expect(t.background).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.text).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
