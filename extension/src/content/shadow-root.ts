// Only these built-in HTML elements (and custom elements) may host author shadow trees.
// Privileged extension APIs can also expose browser-owned roots on inputs, textareas,
// media, etc. Their internal DOM must never be treated as page content.
const AUTHOR_HOSTS = new Set([
  'article', 'aside', 'blockquote', 'body', 'div', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'main', 'nav', 'p', 'section', 'span',
]);

export function canHostAuthorShadowRoot(el: Element): boolean {
  return el.namespaceURI === 'http://www.w3.org/1999/xhtml'
    && (AUTHOR_HOSTS.has(el.localName) || el.localName.includes('-'));
}

/** Finds page-owned open or closed roots without entering native control internals. */
export function shadowOf(el: Element): ShadowRoot | null {
  if (!canHostAuthorShadowRoot(el)) return null;
  if (el.shadowRoot) return el.shadowRoot;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dom = (globalThis as any).chrome?.dom;
    if (typeof dom?.openOrClosedShadowRoot === 'function') return dom.openOrClosedShadowRoot(el) ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (el as any).openOrClosedShadowRoot ?? null;
  } catch {
    return null;
  }
}
