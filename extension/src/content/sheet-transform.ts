// Turns a CSSOM rule list into override CSS: for every style rule that sets a color, emit a
// rule with the same selector (inside the same @media/@supports/@layer/... wrappers) that sets
// the mapped colors. Placed right after the source sheet, the override wins the cascade exactly
// where the original declaration would have.

import { PROPERTY_ROLES, SHORTHANDS_WITH_COLOR, rewriteCustomProperty, rewriteValue, type RewriteContext } from '../shared/css-values';

export interface TransformOptions extends RewriteContext {
  /** Called for @import rules whose sheet cannot be read (cross-origin); returns override CSS or null. */
  onInaccessibleImport?: (href: string, media: string) => void;
  /**
   * Called for a custom property whose value builds a color out of other variables, e.g.
   * `--bg: hsl(var(--bg-h), var(--bg-s), var(--bg-l))`. Its parts can't be mapped one by one;
   * only the computed result is a color, so it is resolved at runtime.
   */
  onComposedColor?: (selector: string, name: string) => void;
  /** Called for a rule that paints a url() background (a logo, icon or sprite may be dark artwork). */
  onBackgroundImage?: (selector: string) => void;
  /**
   * Called for a color property whose value composes a color from variables right in place
   * (Bulma: background-color: hsl(var(--h), var(--s), var(--l))): resolved at runtime.
   */
  onComposedProperty?: (selector: string, prop: string, important: boolean, value: string) => void;
}

const PENDING_LONGHANDS = new Set(['background-color', 'color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke']);

/** Properties whose composed colors are resolved at runtime. */
const COMPOSED_LONGHAND: Record<string, string> = {
  'background': 'background-color',
  'background-color': 'background-color',
  'color': 'color',
  'border-color': 'border-top-color',
  'border': 'border-top-color',
  'fill': 'fill',
  'stroke': 'stroke',
  'outline-color': 'outline-color',
};

/** A color function or color-mix() with var() among its arguments. */
const COMPOSED_COLOR = /\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch|color|color-mix)\([^;]*var\(/i;

const BG_IMAGE_PROPS = new Set(['background', 'background-image']);

/** Builds the declaration block for one CSSStyleDeclaration; empty string when nothing changes. */
export function transformDeclarations(style: CSSStyleDeclaration, opts: TransformOptions, selector?: string): string {
  let out = '';
  const seen = new Set<string>();
  const emit = (prop: string, value: string, important: boolean) => {
    out += `${prop}: ${value}${important ? ' !important' : ''}; `;
  };

  // Gradient text (background-clip: text): the background *is* the text, so map it as text.
  const clipText = /\btext\b/.test(style.getPropertyValue('background-clip') + ' ' + style.getPropertyValue('-webkit-background-clip'));
  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    if (seen.has(prop)) continue;
    seen.add(prop);
    const value = style.getPropertyValue(prop);
    if (!value) {
      // A longhand left "pending substitution" by a var() shorthand that can no longer be
      // serialized (a later longhand overrode part of it): its value is lost to the CSSOM, so
      // the computed color is read at runtime instead.
      if (selector && !selector.includes('&') && PENDING_LONGHANDS.has(prop)) {
        opts.onComposedProperty?.(selector, prop, style.getPropertyPriority(prop) === 'important', '');
      }
      continue;
    }
    const important = style.getPropertyPriority(prop) === 'important';
    if (prop.startsWith('--')) {
      for (const [name, v] of rewriteCustomProperty(prop, value, opts)) emit(name, v, important);
      if (selector && !selector.includes('&') && COMPOSED_COLOR.test(value)) opts.onComposedColor?.(selector, prop);
      continue;
    }
    let role = PROPERTY_ROLES[prop];
    if (!role) continue;
    if (clipText && role === 'background') role = 'text';
    if (selector && BG_IMAGE_PROPS.has(prop) && value.includes('url(') && !selector.includes('&')) opts.onBackgroundImage?.(selector);
    const hide = !!opts.hideImages && BG_IMAGE_PROPS.has(prop);
    const v = rewriteValue(value, role, { ...opts, hideImages: hide });
    if (v !== null) emit(prop, v, important);
    const composed = selector && !selector.includes('&') && COMPOSED_LONGHAND[prop] && !clipText ? composedColorIn(value) : null;
    if (composed) opts.onComposedProperty?.(selector!, prop, important, composed);
  }

  // Shorthands containing var() leave their longhands empty ("pending substitution").
  for (const sh of SHORTHANDS_WITH_COLOR) {
    if (seen.has(sh)) continue;
    const value = style.getPropertyValue(sh);
    if (!value || !value.includes('var(')) continue;
    const role = clipText && PROPERTY_ROLES[sh] === 'background' ? 'text' : PROPERTY_ROLES[sh];
    const v = rewriteValue(value, role, { ...opts, hideImages: !!opts.hideImages && sh === 'background' });
    if (v !== null) emit(sh, v, style.getPropertyPriority(sh) === 'important');
  }
  return out;
}

/**
 * A color function whose channels come from several variables, which no static rewrite can map:
 * not `rgb(var(--x))` / `rgb(var(--x) / .5)` (one channel variable) and not a literal color with
 * only a variable alpha.
 */
function composedColorIn(value: string): string | null {
  const re = /\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(/gi;
  for (let m = re.exec(value); m; m = re.exec(value)) {
    // Balanced arguments (calc(var(--l) + var(--offset)) nests two levels).
    let depth = 1, i = m.index + m[0].length;
    for (; i < value.length && depth; i++) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')') depth--;
    }
    const args = value.slice(m.index + m[0].length, i - 1);
    if ((args.match(/var\(/g)?.length ?? 0) < 2) continue;
    if (/^\s*var\([^()]*\)\s*[,/]\s*var\([^()]*\)\s*$/.test(args)) continue; // rgba(var(--rgb), var(--alpha))
    return value.slice(m.index, i);
  }
  return null;
}

/** Rule-type checks that work across realms (iframes, jsdom) where instanceof is unreliable. */
const isStyleRule = (r: CSSRule): r is CSSStyleRule => r.type === 1 || r.constructor?.name === 'CSSStyleRule';
const isImportRule = (r: CSSRule): r is CSSImportRule => r.type === 3;

function groupHeader(rule: CSSRule): string | null {
  const text = rule.cssText;
  const brace = text.indexOf('{');
  if (brace < 0) return null;
  const header = text.slice(0, brace).trim();
  if (!header.startsWith('@')) return null;
  // Rules whose blocks hold declarations or frames, not style rules, are not mirrored.
  if (/^@(keyframes|-webkit-keyframes|font-face|page|property|counter-style|font-feature-values|view-transition|position-try)/i.test(header)) {
    return null;
  }
  return header;
}

function readRules(container: CSSStyleSheet | CSSGroupingRule | CSSStyleRule): CSSRuleList | null {
  try {
    return (container as CSSStyleSheet).cssRules ?? null;
  } catch {
    return null; // cross-origin
  }
}

export function transformRules(rules: CSSRuleList, opts: TransformOptions): string {
  let out = '';
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule.constructor?.name === 'CSSNestedDeclarations') {
      // CSSNestedDeclarations: bare declarations inside a nested style rule.
      const decls = transformDeclarations((rule as CSSStyleRule).style, opts);
      if (decls) out += `${decls}\n`;
      continue;
    }
    if (isStyleRule(rule)) {
      const decls = transformDeclarations(rule.style, opts, rule.selectorText);
      const nested = (rule as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules;
      const inner = nested && nested.length ? transformRules(nested, opts) : '';
      if (decls || inner) out += `${rule.selectorText} { ${decls}${inner} }\n`;
      continue;
    }
    if (isImportRule(rule)) {
      const sheet = rule.styleSheet;
      const media = rule.media?.mediaText ?? '';
      const imported = sheet ? readRules(sheet) : null;
      if (imported) {
        const inner = transformRules(imported, { ...opts, baseUrl: sheet?.href ?? opts.baseUrl });
        if (inner) out += media ? `@media ${media} { ${inner} }\n` : inner;
      } else if (rule.href && opts.onInaccessibleImport) {
        opts.onInaccessibleImport(absoluteHref(rule.href, opts.baseUrl), media);
      }
      continue;
    }
    const children = readRules(rule as CSSGroupingRule);
    if (!children || children.length === 0) continue;
    const header = groupHeader(rule);
    if (!header) continue;
    const inner = transformRules(children, opts);
    if (inner) out += `${header} { ${inner} }\n`;
  }
  return out;
}

function absoluteHref(href: string, base: string | null): string {
  try {
    return new URL(href, base ?? undefined).href;
  } catch {
    return href;
  }
}

/** Transforms a whole sheet; returns null when its rules cannot be read (cross-origin). */
export function transformSheet(sheet: CSSStyleSheet, opts: TransformOptions): string | null {
  const rules = readRules(sheet);
  if (!rules) return null;
  return transformRules(rules, { ...opts, baseUrl: sheet.href ?? opts.baseUrl });
}

/**
 * Removes @import statements from raw CSS text. Their URLs can hold semicolons inside quotes
 * (Google Fonts: `family=Outfit:wght@300;400;700`), so the end of each statement is found by
 * scanning past strings, parentheses and comments rather than at the first `;`.
 */
export function stripImports(css: string): string {
  let out = '';
  let i = 0;
  // Index just past a string or comment starting at `j`, or -1 when none starts there.
  const skip = (j: number): number => {
    const ch = css[j];
    if (ch === '"' || ch === "'") {
      const end = css.indexOf(ch, j + 1);
      return end < 0 ? css.length : end + 1;
    }
    if (ch === '/' && css[j + 1] === '*') {
      const end = css.indexOf('*/', j + 2);
      return end < 0 ? css.length : end + 2;
    }
    return -1;
  };
  let kept = 0; // start of the text not yet copied to `out`
  while (i < css.length) {
    const past = skip(i);
    if (past >= 0) {
      i = past;
      continue;
    }
    if (css[i] !== '@' || css.slice(i, i + 7).toLowerCase() !== '@import') {
      i++;
      continue;
    }
    out += css.slice(kept, i);
    let j = i + 7;
    let depth = 0;
    while (j < css.length) {
      const over = skip(j);
      if (over >= 0) {
        j = over;
        continue;
      }
      const ch = css[j++];
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ';' && depth === 0) break;
    }
    i = kept = j;
  }
  return out + css.slice(kept);
}
