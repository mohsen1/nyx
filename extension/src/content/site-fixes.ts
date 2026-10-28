import { parseColor } from '../shared/color';
import type { Theme } from '../shared/theme';

/** Pixel-rendered controls cannot be recolored by the stylesheet transformer. */
export function siteFixCss(url: string, theme: Theme): string {
  const { hostname, pathname } = new URL(url);
  if (hostname === 'mail.google.com') {
    // Gmail's history clocks and remove buttons are black background sprites.
    return `.asor_i5, .gsaq_b { filter: invert(1) !important; }\n`;
  }
  if (hostname !== 'docs.google.com' || !pathname.startsWith('/spreadsheets/')) return '';

  // Sheets paints cells AND headers into canvases. Filter only the grid, leaving
  // DOM overlays (editing, selection, menus) to the normal color transformer.
  // Partial inversion lifts black ink and maps white paper near the theme's
  // background. Hue rotation keeps colored cell fills recognizable.
  const bg = parseColor(theme.background)!;
  const paper = Math.min(0.2, (bg.r + bg.g + bg.b) / (3 * 255));
  const invert = Number((1 - paper).toFixed(4));
  return `#waffle-grid-container .grid-container canvas { filter: invert(${invert}) hue-rotate(180deg) !important; }\n`
    + `.docs-icon-img { filter: invert(1) !important; }\n`;
}
