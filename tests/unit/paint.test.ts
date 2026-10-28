// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { afterPaint } from '../../extension/src/content/paint';

describe('paint acknowledgment', () => {
  it('answers while Safari has paused animation frames, and never answers twice when they resume', () => {
    vi.useFakeTimers();
    try {
      const frames: FrameRequestCallback[] = [];
      const win = { setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window), requestAnimationFrame: (cb: FrameRequestCallback) => frames.push(cb) };
      const reply = vi.fn();
      afterPaint(reply, win);
      vi.advanceTimersByTime(150);
      expect(reply).toHaveBeenCalledTimes(1);
      frames.shift()!(0);
      expect(reply).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });

  it('answers after two painted frames without waiting for the fallback', () => {
    vi.useFakeTimers();
    try {
      const frames: FrameRequestCallback[] = [];
      const win = { setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window), requestAnimationFrame: (cb: FrameRequestCallback) => frames.push(cb) };
      const reply = vi.fn();
      afterPaint(reply, win);
      frames.shift()!(0);
      expect(reply).not.toHaveBeenCalled();
      frames.shift()!(16);
      expect(reply).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(150);
      expect(reply).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
