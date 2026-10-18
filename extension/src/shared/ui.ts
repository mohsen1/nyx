// Tiny DOM helpers shared by the toolbar menu and the settings page.

import { icon, type IconName } from './icons';

export { icon, type IconName };

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
    else if (k === 'checked' && 'checked' in el) (el as HTMLInputElement).checked = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** A segmented control (radio group) rendered as buttons. */
export function segmented<T extends string>(
  label: string,
  options: Array<{ value: T; label: string; title?: string }>,
  current: T,
  onChange: (v: T) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    ...options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(o.value === current),
          class: o.value === current ? 'selected' : '',
          title: o.title,
          onclick: () => onChange(o.value),
        },
        o.label,
      ),
    ),
  );
}

/** A labeled list row: optional leading icon, label with optional secondary line, trailing control. */
export function cell(
  label: string | Node,
  trailing?: Node | null,
  opts: { icon?: IconName; hint?: string; tag?: 'div' | 'label'; class?: string } = {},
): HTMLElement {
  return h(
    opts.tag ?? 'div',
    { class: ['cell', opts.icon ? 'has-icon' : '', opts.class ?? ''].filter(Boolean).join(' ') },
    opts.icon ? icon(opts.icon) : null,
    h('span', { class: 'label' }, label, opts.hint ? h('small', {}, opts.hint) : null),
    trailing,
  );
}

/** A full-width tappable row, like a button cell in an iOS list. */
export function actionCell(label: string, iconName: IconName | null, onClick: () => void, destructive = false): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: `cell ${destructive ? 'destructive' : 'action'}${iconName ? ' has-icon' : ''}`, onclick: onClick },
    iconName ? icon(iconName) : null,
    h('span', { class: 'label' }, label),
  );
}

/** An inset grouped list with an optional title above and footer text below. */
export function group(title: string | null, rows: Array<Node | null | false>, footer?: string | Node | null): HTMLElement {
  return h(
    'section',
    { class: 'group' },
    title ? h('h2', { class: 'group-title' }, title) : null,
    h('div', { class: 'list' }, ...rows),
    footer ? h('p', { class: 'group-footer' }, footer) : null,
  );
}

export function toggle(label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  const input = h('input', {
    type: 'checkbox',
    role: 'switch',
    class: 'switch',
    checked,
    onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
  });
  return cell(label, input, { tag: 'label', hint });
}

/**
 * A native <select> drawn as an Apple popup button: the selected value and an up-down chevron,
 * with the real control laid invisibly on top so it keeps native menus and keyboard handling.
 */
export function select(
  label: string,
  options: Array<{ value: string; label: string }>,
  current: string,
  onChange: (v: string) => void,
  opts: { chevron?: IconName; class?: string } = {},
): HTMLElement {
  const text = () => options.find((o) => o.value === el.value)?.label ?? '';
  const value = h('span', { class: 'select-value' });
  const el = h(
    'select',
    {
      'aria-label': label,
      onchange: () => {
        value.textContent = text();
        onChange(el.value);
      },
    },
    ...options.map((o) => h('option', { value: o.value }, o.label)),
  );
  el.value = current;
  value.textContent = text();
  return h('span', { class: ['select', opts.class ?? ''].filter(Boolean).join(' ') }, value, icon(opts.chevron ?? 'chevrons-up-down', 12), el);
}

export function themeSwatch(bg: string, text: string): HTMLElement {
  return h('span', { class: 'swatch', style: `background:${bg};color:${text}`, 'aria-hidden': 'true' }, 'Aa');
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/** "20:00" → the user's locale time format, e.g. "8:00 PM". */
export function formatClock(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
