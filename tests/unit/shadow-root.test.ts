// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shadowOf } from '../../extension/src/content/shadow-root';

afterEach(() => vi.unstubAllGlobals());

describe('author shadow roots', () => {
  it.each(['textarea', 'input', 'select', 'button', 'video', 'audio', 'img', 'progress', 'meter'])
    ('does not ask privileged APIs for the browser-owned root of %s', (tag) => {
      const el = document.createElement(tag);
      // Safari exposes native controls through the same API as closed author roots.
      const privilegedLookup = vi.fn(() => document.createElement('div').attachShadow({ mode: 'closed' }));
      vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: privilegedLookup } });
      expect(shadowOf(el)).toBeNull();
      expect(privilegedLookup).not.toHaveBeenCalled();
    });

  it('also leaves native control internals alone with Firefox\'s privileged property', () => {
    const el = document.createElement('textarea');
    const getter = vi.fn(() => document.createElement('div').attachShadow({ mode: 'closed' }));
    Object.defineProperty(el, 'openOrClosedShadowRoot', { get: getter });
    expect(shadowOf(el)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(['div', 'span', 'nyx-test-widget'])('keeps closed author roots on %s accessible', (tag) => {
    const el = document.createElement(tag);
    const root = el.attachShadow({ mode: 'closed' });
    vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: () => root } });
    expect(shadowOf(el)).toBe(root);
  });

  it('finds open author roots without privileged access', () => {
    const el = document.createElement('div');
    const root = el.attachShadow({ mode: 'open' });
    expect(shadowOf(el)).toBe(root);
  });

  it('does not probe SVG elements whose names contain a hyphen', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'font-face');
    const lookup = vi.fn();
    vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: lookup } });
    expect(shadowOf(el)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
