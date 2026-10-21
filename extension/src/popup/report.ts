// Screenshots for problem reports: the page as it is and, when Nyx is restyling it, the original.
// Nothing is uploaded; screenshots are reviewed and blacked out before copying into an issue.

import { api, type Tab } from '../shared/browser';
import type { Message } from '../shared/messages';

/** Widest each screenshot is drawn in the report image, in pixels. */
const MAX_WIDTH = 1280;
const LABEL_HEIGHT = 32;
const GAP = 8;

export interface Panel {
  label: string;
  image: CanvasImageSource & { width: number; height: number };
}

export interface Layout {
  width: number;
  height: number;
  panels: Array<{ x: number; y: number; width: number; height: number }>;
}

/** Side by side, each screenshot scaled down to at most MAX_WIDTH, with a label strip on top. */
export function comparisonLayout(sizes: Array<{ width: number; height: number }>): Layout {
  const scale = Math.min(1, ...sizes.map((s) => MAX_WIDTH / Math.max(1, s.width)));
  let x = 0;
  const panels = sizes.map((s) => {
    const width = Math.round(s.width * scale);
    const height = Math.round(s.height * scale);
    const panel = { x, y: LABEL_HEIGHT, width, height };
    x += width + GAP;
    return panel;
  });
  return {
    width: Math.max(1, x - GAP),
    height: LABEL_HEIGHT + Math.max(0, ...panels.map((p) => p.height)),
    panels,
  };
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return img;
}

function compose(panels: Panel[]): Promise<Blob | null> {
  const layout = comparisonLayout(panels.map((p) => p.image));
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#1c1c1e';
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.font = '600 15px -apple-system, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  panels.forEach((p, i) => {
    const box = layout.panels[i];
    ctx.drawImage(p.image, box.x, box.y, box.width, box.height);
    ctx.fillStyle = '#e3e3e6';
    ctx.fillText(p.label, box.x + 12, LABEL_HEIGHT / 2);
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function suspend(tabId: number, suspended: boolean): Promise<void> {
  await api.tabs.sendMessage(tabId, { type: 'setSuspended', suspended } satisfies Message).catch(() => undefined);
}

/**
 * Captures the tab with Nyx and, if Nyx is restyling it, without (briefly switching it off), and
 * returns both side by side as a PNG with panel coordinates. Null when the browser can't capture the tab.
 */
export async function captureComparison(tab: Tab, nyxActive: boolean, progress: (stage: string) => void = () => {}): Promise<{ image: Blob; layout: Layout } | null> {
  const capture = api.tabs.captureVisibleTab;
  if (!capture || tab.id === undefined) return null;
  const shoot = () => capture.call(api.tabs, tab.windowId, { format: 'png' });
  progress('Capturing page…');
  const withNyx = await shoot();
  let original: string | null = null;
  if (nyxActive) {
    try {
      progress('Showing original page…');
      await suspend(tab.id, true);
      progress('Capturing original…');
      original = await shoot();
    } finally {
      progress('Restoring Nyx…');
      await suspend(tab.id, false);
    }
  }
  progress('Preparing screenshot…');
  const panels: Panel[] = [];
  if (original) panels.push({ label: 'Original', image: await loadImage(original) });
  panels.push({ label: nyxActive ? 'With Nyx' : 'Page', image: await loadImage(withNyx) });
  const image = await compose(panels);
  return image ? { image, layout: comparisonLayout(panels.map((p) => p.image)) } : null;
}

/**
 * Puts the screenshot on the clipboard. The write starts right away, inside the click, because
 * Safari only allows clipboard writes during a user gesture; the image follows when ready.
 */
export async function copyImage(image: Promise<Blob | null>): Promise<boolean> {
  const required = image.then((b) => b ?? Promise.reject(new Error('no screenshot')));
  required.catch(() => undefined);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': required })]);
    return true;
  } catch {
    // Browsers without promised clipboard items: write the finished image instead.
    try {
      const blob = await image;
      if (!blob) return false;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }
}
