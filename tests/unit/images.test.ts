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

  it('lightens only dark neutral pixels', () => {
    const data = pixels([95, 99, 104, 255, 1], [234, 67, 53, 255, 1], [250, 250, 250, 255, 1]);
    recolorPixels(data);
    expect(Array.from(data.slice(0, 3))).toEqual([160, 156, 151]);
    expect(Array.from(data.slice(4, 7))).toEqual([234, 67, 53]);
    expect(Array.from(data.slice(8, 11))).toEqual([250, 250, 250]);
  });
});
