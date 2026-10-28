/** Screenshot data stays in extension memory until the review tab takes it. */
export interface ScreenshotLayout {
  width: number;
  height: number;
  panels: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface ReportDraft {
  title: string;
  details: string;
  image: string | null;
  layout: ScreenshotLayout | null;
}

/** Fractions of one screenshot; applied to every comparison panel. */
export interface Blackout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function blackoutBetween(x1: number, y1: number, x2: number, y2: number): Blackout {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const left = clamp(Math.min(x1, x2)), top = clamp(Math.min(y1, y2));
  return { x: left, y: top, width: clamp(Math.max(x1, x2)) - left, height: clamp(Math.max(y1, y2)) - top };
}

/** Round outwards so scaling never leaves a sliver of the selected pixels visible. */
export function blackoutRects(layout: ScreenshotLayout, areas: Blackout[]): ScreenshotLayout['panels'] {
  return areas.flatMap((area) => layout.panels.map((panel) => {
    const x = panel.x + Math.floor(area.x * panel.width);
    const y = panel.y + Math.floor(area.y * panel.height);
    return {
      x, y,
      width: Math.ceil((area.x + area.width) * panel.width) + panel.x - x,
      height: Math.ceil((area.y + area.height) * panel.height) + panel.y - y,
    };
  }));
}

/** Fresh pixels only: opaque black is burned into the exported PNG, never an editable overlay. */
export function redactScreenshot(image: CanvasImageSource, layout: ScreenshotLayout, areas: Blackout[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Screenshot editing is unavailable in this browser.');
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = '#000000';
  for (const rect of blackoutRects(layout, areas)) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  return canvas;
}
