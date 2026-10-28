import { api } from '../shared/browser';
import type { Message } from '../shared/messages';
import { blackoutBetween, redactScreenshot, type Blackout, type ReportDraft } from '../shared/report';
import { h } from '../shared/ui';
import { copyImage } from '../popup/report';

const root = document.getElementById('app')!;

async function main(): Promise<void> {
  const id = location.hash.slice(1);
  // One-use request: a reload cannot retrieve the original screenshot again.
  const draft = await api.runtime.sendMessage({ type: 'takeReport', id } satisfies Message) as ReportDraft | null;
  root.removeAttribute('aria-busy');
  if (!draft) {
    root.replaceChildren(h('h1', {}, 'Screenshot no longer available'), h('p', {}, 'Close this tab and choose Report a problem again.'));
    return;
  }
  let image: HTMLImageElement | null = null;
  if (draft.image && draft.layout) {
    image = new Image();
    image.src = draft.image;
    try { await image.decode(); } catch { image = null; }
  }
  // Keep the raw pixels only in this tab's image, never in persistent extension storage.
  draft.image = null;
  const layout = draft.layout;
  const areas: Blackout[] = [];
  const previews: HTMLImageElement[] = [];
  const masks: HTMLElement[] = [];
  const grid = h('div', { class: 'report-previews' });
  const actualSize = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', onclick: () => {
    const actual = grid.classList.toggle('actual-size');
    actualSize.setAttribute('aria-pressed', String(actual));
    actualSize.textContent = actual ? 'Fit screenshots' : 'Show actual size';
  } }, 'Show actual size');
  let pending: Blackout | null = null;
  let drag: { pointer: number; canvas: HTMLImageElement; x: number; y: number } | null = null;
  const status = h('p', { role: 'status', 'aria-live': 'polite', class: 'report-status' });
  const details = h('textarea', { id: 'report-details', rows: 6, value: draft.details });
  const undo = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => { areas.pop(); pending = null; paint(); } }, 'Undo');
  const clear = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => { areas.length = 0; pending = null; paint(); } }, 'Clear blackouts');
  const cancel = h('button', { type: 'button', class: 'btn', onclick: () => { discard(); window.close(); } }, 'Cancel');
  const copy = h('button', { type: 'button', class: 'btn primary', onclick: () => void finish(true) }, 'Copy screenshot and continue');
  const without = h('button', { type: 'button', class: 'btn', onclick: () => void finish(false) }, 'Continue without screenshot');

  function paint(): void {
    if (!layout || !image) return;
    masks.forEach((layer) => {
      layer.replaceChildren(...(pending ? [...areas, pending] : areas).map((area) => h('span', {
        class: 'report-blackout', style: `left:${area.x * 100}%;top:${area.y * 100}%;width:${area.width * 100}%;height:${area.height * 100}%`,
      })));
    });
    undo.disabled = clear.disabled = areas.length === 0;
    copy.disabled = !!drag;
    status.textContent = areas.length ? `${areas.length} blackout${areas.length === 1 ? '' : 's'} applied to ${previews.length === 2 ? 'both views' : 'the screenshot'}.` : 'Nothing has been copied or uploaded.';
  }

  function point(canvas: HTMLImageElement, event: PointerEvent): [number, number] {
    const r = canvas.getBoundingClientRect();
    return [(event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height];
  }

  function discard(): void {
    if (image) image.src = '';
    image = null;
    areas.length = 0;
    previews.forEach((preview) => { preview.src = ''; });
    masks.forEach((layer) => layer.replaceChildren());
    details.value = '';
    draft!.details = '';
  }

  async function finish(withImage: boolean): Promise<void> {
    copy.disabled = without.disabled = true;
    let copied = false;
    if (withImage && image && layout) {
      // The ClipboardItem promise starts in this click for Safari's user-gesture requirement.
      const flattened = redactScreenshot(image, layout, areas);
      const blob = new Promise<Blob | null>((resolve) => flattened.toBlob(resolve, 'image/png'));
      copied = await copyImage(blob);
      flattened.width = flattened.height = 0;
      if (!copied) {
        status.textContent = 'Could not copy the screenshot. Try again, or continue without it.';
        copy.disabled = without.disabled = false;
        return;
      }
    }
    const screenshot = copied ? '\n\n**Screenshot:** the reviewed screenshot is on your clipboard. Paste it here (⌘V or Ctrl+V).' : '';
    const body = `${details.value}${screenshot}\n\n**What looks wrong?**\n\n`;
    try {
      await api.tabs.create({ url: `https://github.com/mohsen1/nyx/issues/new?${new URLSearchParams({ title: draft!.title, body, labels: 'website' })}` });
      discard();
      window.close();
    } catch {
      status.textContent = 'Could not open GitHub. Try again; your blackouts are still here.';
      copy.disabled = without.disabled = false;
    }
  }

  root.replaceChildren(
    h('header', { class: 'report-header' }, h('h1', {}, 'Review screenshot'), cancel),
    h('p', { class: 'report-help' }, image ? `Drag over anything private to black it out.${layout?.panels.length === 2 ? ' Matching areas are covered in both views.' : ''} Your screenshot stays on this device until you paste it into GitHub.` : 'The browser could not capture this page. You can still report the problem without a screenshot.'),
  );
  if (image && layout) {
    root.append(h('div', { class: 'report-tools' }, undo, clear, actualSize));
    layout.panels.forEach((panel, i) => {
      const label = layout.panels.length === 2 ? (i === 0 ? 'Original' : 'With Nyx') : 'Page';
      // Preview crops stay unchanged; blackouts are interactive overlays until PNG export.
      const crop = document.createElement('canvas');
      crop.width = panel.width; crop.height = panel.height;
      crop.getContext('2d')!.drawImage(image!, panel.x, panel.y, panel.width, panel.height, 0, 0, panel.width, panel.height);
      const canvas = h('img', { class: 'report-preview', width: panel.width, height: panel.height, src: crop.toDataURL('image/png'), alt: `${label} screenshot preview`, draggable: 'false' });
      crop.width = crop.height = 0;
      const mask = h('div', { class: 'report-masks', 'aria-hidden': 'true' });
      masks.push(mask);
      canvas.addEventListener('pointerdown', (event) => {
        if (drag || event.button !== 0 || !event.isPrimary) return;
        const [x, y] = point(canvas, event);
        drag = { pointer: event.pointerId, canvas, x, y };
        canvas.setPointerCapture(event.pointerId);
        pending = blackoutBetween(x, y, x, y);
        paint();
      });
      canvas.addEventListener('pointermove', (event) => {
        if (!drag || drag.pointer !== event.pointerId) return;
        const [x, y] = point(canvas, event);
        pending = blackoutBetween(drag.x, drag.y, x, y);
        paint();
      });
      const end = (event: PointerEvent) => {
        if (!drag || drag.pointer !== event.pointerId) return;
        if (event.type === 'pointerup' && pending && pending.width > 0 && pending.height > 0) areas.push(pending);
        drag = null;
        pending = null;
        paint();
      };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      previews.push(canvas);
      grid.append(h('figure', {}, h('figcaption', {}, label), h('div', { class: 'report-viewport', tabindex: 0, role: 'region', 'aria-label': `${label} screenshot scroll area` }, h('div', { class: 'report-image', style: `--report-width:${panel.width}px` }, canvas, mask))));
    });
    root.append(grid);
    const inputs = ['Left', 'Top', 'Width', 'Height'].map((label, i) => h('input', { type: 'number', min: i < 2 ? 0 : 1, max: 100, value: i < 2 ? 10 : 20, required: true, 'aria-label': `${label} percent` }));
    const form = h('form', { class: 'report-coordinates', onsubmit: (event: Event) => {
      event.preventDefault();
      const [x, y, width, height] = inputs.map((input) => Number(input.value) / 100);
      areas.push(blackoutBetween(x, y, x + width, y + height));
      paint();
    } }, ...inputs.map((input, i) => h('label', {}, ['Left %', 'Top %', 'Width %', 'Height %'][i], input)), h('button', { type: 'submit', class: 'btn' }, 'Add blackout'));
    root.append(h('details', { class: 'report-keyboard' }, h('summary', {}, 'Black out an area using the keyboard'), form));
  } else copy.hidden = true;
  root.append(
    h('div', { class: 'report-metadata' }, h('label', { for: 'report-details' }, 'Report details'), h('p', {}, 'Review the page address and remove anything private before continuing.'), details),
    h('div', { class: 'report-actions' }, copy, without), status,
  );
  await Promise.all(previews.map((preview) => preview.decode()));
  paint();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
  window.addEventListener('pagehide', discard, { once: true });
}

void main().catch(() => {
  root.removeAttribute('aria-busy');
  root.replaceChildren(h('h1', {}, 'Could not open screenshot review'), h('p', {}, 'Close this tab and choose Report a problem again.'));
});
