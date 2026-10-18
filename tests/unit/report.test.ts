import { describe, expect, it } from 'vitest';
import { comparisonLayout } from '../../extension/src/popup/report';

describe('problem report screenshots', () => {
  it('places the original and the restyled page side by side under a label strip', () => {
    const l = comparisonLayout([
      { width: 1280, height: 800 },
      { width: 1280, height: 800 },
    ]);
    expect(l.panels).toEqual([
      { x: 0, y: 32, width: 1280, height: 800 },
      { x: 1288, y: 32, width: 1280, height: 800 },
    ]);
    expect(l.width).toBe(2568);
    expect(l.height).toBe(832);
  });

  it('scales Retina captures down to at most 1280 pixels wide', () => {
    const l = comparisonLayout([{ width: 2560, height: 1600 }]);
    expect(l.panels[0]).toEqual({ x: 0, y: 32, width: 1280, height: 800 });
    expect(l.width).toBe(1280);
  });
});
