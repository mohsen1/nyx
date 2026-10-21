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

import { blackoutBetween, blackoutRects } from '../../extension/src/shared/report';
import { ReportHandoff } from '../../extension/src/background/reports';
import { vi } from 'vitest';

describe('private screenshot review', () => {
  it('clamps reversed drags and covers the corresponding pixels in both views', () => {
    const area = blackoutBetween(0.75, 0.8, -0.1, 0.2);
    expect(area).toEqual({ x: 0, y: 0.2, width: 0.75, height: 0.6000000000000001 });
    const layout = comparisonLayout([{ width: 101, height: 80 }, { width: 101, height: 80 }]);
    expect(blackoutRects(layout, [area])).toEqual([
      { x: 0, y: 48, width: 76, height: 48 },
      { x: 109, y: 48, width: 76, height: 48 },
    ]);
  });

  it('hands raw screenshots to the review tab once and expires abandoned captures', () => {
    vi.useFakeTimers();
    try {
      const handoff = new ReportHandoff();
      const draft = { title: 'Test', details: 'Local report', image: null, layout: null };
      const first = handoff.put(draft);
      expect(handoff.take(first)).toEqual(draft);
      expect(handoff.take(first)).toBeNull();
      const abandoned = handoff.put(draft);
      vi.advanceTimersByTime(60_000);
      expect(handoff.take(abandoned)).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
