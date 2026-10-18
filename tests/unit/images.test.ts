import { describe, expect, it } from 'vitest';
import { computeStats, recolorPixels, shouldInvert, shouldRecolor } from '../../extension/src/content/images';

/** Builds RGBA pixel data from [r, g, b, a, count] runs. */
function pixels(...runs: Array<[number, number, number, number, number]>): Uint8ClampedArray {
  const out: number[] = [];
  for (const [r, g, b, a, n] of runs) for (let i = 0; i < n; i++) out.push(r, g, b, a);
  return new Uint8ClampedArray(out);
}

describe('image decisions', () => {
  it('inverts dark monochrome artwork on transparency', () => {
    const s = computeStats(pixels([0, 0, 0, 0, 50], [20, 20, 20, 255, 50]));
    expect(shouldInvert(s)).toBe(true);
    expect(shouldRecolor(s)).toBe(false);
  });

  it('leaves cut-out portraits alone: transparent and dark, but hundreds of tones (the Guardian)', () => {
    // Hair, suit and skin in many shades around a transparent background.
    const tones: Array<[number, number, number, number, number]> = [[0, 0, 0, 0, 1100]];
    for (let i = 0; i < 100; i++) tones.push([20 + ((i * 37) % 160), 15 + ((i * 53) % 120), 10 + ((i * 29) % 100), 255, 12]);
    const s = computeStats(pixels(...tones));
    expect(s.flat).toBeLessThan(0.5);
    expect(shouldRecolor(s)).toBe(false);
    expect(shouldInvert(s)).toBe(false);
  });

  it('recolors a colored mark next to a gray wordmark (Gmail)', () => {
    // Measured on Gmail's lockup: 74% transparent, half of the rest #5f6368 gray, half colored.
    const s = computeStats(pixels([0, 0, 0, 0, 74], [234, 67, 53, 255, 13], [95, 99, 104, 255, 13]));
    expect(shouldInvert(s)).toBe(false);
    expect(shouldRecolor(s)).toBe(true);
  });

  it('leaves photos and light logos alone', () => {
    expect(shouldRecolor(computeStats(pixels([200, 120, 60, 255, 60], [90, 90, 95, 255, 40])))).toBe(false);
    expect(shouldRecolor(computeStats(pixels([0, 0, 0, 0, 60], [240, 240, 240, 255, 40])))).toBe(false);
  });

  it('recolors a navy wordmark on transparency (a company logo)', () => {
    expect(shouldRecolor(computeStats(pixels([0, 0, 0, 0, 60], [12, 35, 90, 255, 40])))).toBe(true);
  });

  it('flips the lightness of dark pixels only, keeping their hue', () => {
    const data = pixels([95, 99, 104, 255, 1], [12, 35, 90, 255, 1], [234, 67, 53, 255, 1], [250, 250, 250, 255, 1], [0, 0, 0, 255, 1]);
    recolorPixels(data);
    const [gr, , gb] = data.slice(0, 3);
    expect(gr).toBeGreaterThan(140); // gray text turns light gray
    expect(gb).toBeGreaterThanOrEqual(gr); // still slightly cool
    const [nr, , nb] = data.slice(4, 7);
    expect(nb).toBeGreaterThan(200); // navy turns light blue
    expect(nb).toBeGreaterThan(nr);
    expect(Array.from(data.slice(8, 11))).toEqual([234, 67, 53]); // the red mark stays
    expect(Array.from(data.slice(12, 15))).toEqual([250, 250, 250]);
    expect(Array.from(data.slice(16, 19))).toEqual([255, 255, 255]);
  });
});
