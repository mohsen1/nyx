// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { rewriteCustomProperty, rewriteChannels, rewriteValue } from '../../extension/src/shared/css-values';
import { Palette } from '../../extension/src/shared/palette';
import { transformRules } from '../../extension/src/content/sheet-transform';

const palette = new Palette({ background: '#1c1c1e', text: '#e3e3e6', dynamicColors: true });
const ctx = { palette, baseUrl: 'https://cdn.example.com/css/site.css' };

function sheetFrom(css: string): CSSStyleSheet {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const sheet = style.sheet as CSSStyleSheet;
  style.remove();
  return sheet;
}

describe('rewriteValue', () => {
  it('maps colors inside shorthands and gradients', () => {
    expect(rewriteValue('1px solid #ddd', 'border', ctx)).toMatch(/^1px solid #[0-9a-f]{6}$/);
    const g = rewriteValue('linear-gradient(to bottom, #fff 0%, rgba(255,255,255,0) 100%)', 'background', ctx)!;
    expect(g).toContain('linear-gradient(to bottom, #1c1c1e 0%');
    expect(g).toContain('rgba(28, 28, 30, 0)');
  });

  it('maps named colors but not identifiers that only look similar', () => {
    expect(rewriteValue('white', 'background', ctx)).toBe('#1c1c1e');
    expect(rewriteValue('solid whitesmoke-ish', 'border', ctx)).toBeNull();
  });

  it('points var() at role-specific copies with the original as fallback', () => {
    expect(rewriteValue('var(--brand)', 'text', ctx)).toBe('var(--nyx-t--brand, var(--brand))');
    expect(rewriteValue('var(--brand, #000)', 'text', ctx)).toBe('var(--nyx-t--brand, var(--brand, #e3e3e6))');
  });

  it('points channel-list variables in color functions at channel copies', () => {
    expect(rewriteValue('rgb(var(--grey-50))', 'background', ctx)).toBe('rgb(var(--nyx-bc--grey-50, var(--grey-50)))');
    expect(rewriteValue('rgba(var(--brand-rgb), 0.1)', 'background', ctx)).toBe('rgba(var(--nyx-bc--brand-rgb, var(--brand-rgb)), 0.1)');
    expect(rewriteValue('hsl(var(--background) / 50%)', 'background', ctx)).toBe('hsl(var(--nyx-bc--background, var(--background)) / 50%)');
  });

  it('maps rgb and hsl channel lists, keeping their format', () => {
    expect(rewriteChannels('249, 249, 248', 'background', palette)).toMatch(/^\d+, \d+, \d+$/);
    const [r] = rewriteChannels('249, 249, 248', 'background', palette)!.split(', ').map(Number);
    expect(r).toBeLessThan(60);
    const [, , l] = rewriteChannels('0 0% 100%', 'background', palette)!.split(' ');
    expect(parseFloat(l)).toBeLessThan(25);
    expect(parseFloat(rewriteChannels('222.2 84% 4.9%', 'text', palette)!.split(' ')[2])).toBeGreaterThan(70);
    expect(rewriteChannels('4 8 400', 'background', palette)).toBeNull();
    expect(rewriteChannels('1px 2px 3px', 'background', palette)).toBeNull();
  });

  it('defines channel copies for channel lists and aliases only', () => {
    const names = (v: string) => rewriteCustomProperty('--x', v, ctx).map(([n]) => n);
    expect(names('249, 249, 248')).toContain('--nyx-bc--x');
    expect(names('var(--y)')).toContain('--nyx-tc--x');
    expect(rewriteCustomProperty('--x', 'var(--y)', ctx).find(([n]) => n === '--nyx-bc--x')![1]).toBe('var(--nyx-bc--y, var(--y))');
    expect(names('12px')).toEqual([]);
  });

  it('absolutizes relative urls and can hide images', () => {
    expect(rewriteValue('url(../img/bg.png) #fff', 'background', ctx)).toBe('url("https://cdn.example.com/img/bg.png") #1c1c1e');
    expect(rewriteValue('url(data:image/png;base64,AA==)', 'background', ctx)).toBeNull();
    expect(rewriteValue('url(a.png), linear-gradient(red, blue)', 'background', { ...ctx, hideImages: true })).toMatch(/^none, linear-gradient/);
  });

  it('leaves values without colors alone', () => {
    expect(rewriteValue('none', 'background', ctx)).toBeNull();
    expect(rewriteValue('inherit', 'text', ctx)).toBeNull();
    expect(rewriteValue('currentColor', 'border', ctx)).toBeNull();
  });
});

describe('transformRules', () => {
  it('mirrors selectors, priorities and wrappers', () => {
    const sheet = sheetFrom(`
      body { background: #fff; color: #111; margin: 0 }
      .btn { color: red !important; padding: 4px }
      @media (min-width: 600px) { .wide { border-color: #ccc } }
      .layout { display: grid }
    `);
    const css = transformRules(sheet.cssRules, ctx);
    expect(css).toContain('body {');
    // jsdom keeps shorthands; browsers expand them to longhands.
    expect(css).toMatch(/body \{[^}]*background(-color)?: #1c1c1e/);
    expect(css).toMatch(/\.btn \{ color: #[0-9a-f]{6} !important;\s*\}/);
    expect(css).toMatch(/@media \(min-width: 600px\) \{ \.wide \{/);
    expect(css).not.toContain('.layout');
    expect(css).not.toContain('margin');
  });

  it('emits role-specific copies of color custom properties', () => {
    const sheet = sheetFrom(':root { --bg: #ffffff; --gap: 8px } .card { background: var(--bg) }');
    const css = transformRules(sheet.cssRules, ctx);
    expect(css).toContain('--nyx-b--bg: #1c1c1e');
    expect(css).toContain('--nyx-t--bg:');
    expect(css).not.toContain('--gap');
    expect(css).toMatch(/\.card \{ background[^:]*: var\(--nyx-b--bg, var\(--bg\)\)/);
  });
});
