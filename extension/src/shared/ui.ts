// Tiny DOM helpers shared by the toolbar menu and the settings page.

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

export function toggle(label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) });
  return h('label', { class: 'toggle' }, h('span', { class: 'toggle-text' }, label, hint ? h('small', {}, hint) : null), input);
}

export function themeSwatch(bg: string, text: string): HTMLElement {
  return h('span', { class: 'swatch', style: `background:${bg};color:${text}`, 'aria-hidden': 'true' }, 'Aa');
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
