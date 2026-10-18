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
}

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
    if (!value) continue;
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
