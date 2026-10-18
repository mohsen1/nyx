# Architecture

```
extension/src/
  shared/            pure logic shared by every context
    color.ts         CSS color parsing, OKLab/OKLCH, contrast
    palette.ts       maps original colors onto the theme (by role: background/text/border/shadow)
    css-values.ts    rewrites declaration values: colors, var() references, url()s
    settings.ts      settings model, scopes, decide(), merge for sync
    theme.ts         theme model, built-in library, share-link codec (Noir compatible)
  content/           runs in every frame at document_start
    main.ts          decides whether to style the page; reacts to settings, system appearance, schedule
    engine.ts        per-root (document and open shadow roots) style generation and DOM observation
    sheet-transform  CSSOM → override CSS, mirroring @media/@supports/@layer/@container wrappers
    detect.ts        built-in dark mode detection
    contrast.ts      contrast guard: lifts any on-screen text that ended up unreadable
    images.ts        decides which images to invert
    theme-import.ts  one-click import on the theme sharing page
  background/        fetches cross-origin CSS/images, keyboard shortcuts, sync
  popup/             the toolbar menu
  options/           the settings page
apple/               Safari container app (iOS + macOS), native messaging, App Intents, Control
```

## How a page is darkened

1. **Decide.** At `document_start` the content script reads settings from
   `storage.local`. It resolves the most specific settings scope (page → host
   → parent domain) and calls `decide()`, which checks pause, status, Auto
   (system or schedule), theme and appearance options.
2. **Prevent a flash.** While the document is loading, a temporary rule paints
   `html` and `body` in the theme's colors.
3. **Generate overrides.** For every stylesheet the engine walks the CSSOM and
   emits a rule with the *same selector* for each declaration that involves
   color, wrapped in the same conditional rules, and inserts it right after
   the source sheet. Because the override has equal specificity and comes
   later, it wins exactly where the original rule won, so the cascade is
   preserved.
   - Cross-origin sheets are fetched by the background script and parsed in a
     detached `CSSStyleSheet`.
   - When a sheet can be neither read nor fetched (Safari without access to
     the site's CDN, no CORS), its colors never reach the rewriter. The
     contrast guard then maps light backgrounds from their computed values as
     text comes on screen, and lifts the text on them.
   - Adopted stylesheets get an adopted override.
4. **Map colors by role.** Each color is mapped according to what it paints:
   - **Background colors:** light becomes the theme background with elevation
     steps; saturated colors stay vivid but darker.
   - **Text colors:** dark becomes the theme text; accent colors keep their
     hue and are lifted to at least WCAG 4.5:1 contrast.
   - **Borders and shadows** get their own rules.
   - Neutral colors are interpolated in OKLab between the theme's background
     and text colors, so any two-color theme produces a coherent page.
   - With **dynamic colors** off, every color is mapped onto that line.
5. **Custom properties.** `--x: #fff` gains copies such as `--nyx-b--x`,
   `--nyx-t--x` and `--nyx-o--x`, one per role. Uses are rewritten to
   `var(--nyx-t--x, var(--x))`, so a variable used for both background and
   text gets the right value in each place.
   - **Channel lists** (`--grey-50: 249, 249, 248`, shadcn's `0 0% 100%`) get
     channel copies (`--nyx-bc--x`), used only inside `rgb(var(--x))` /
     `hsl(var(--x) / a)`, so triplets that aren't colors are never touched.
   - Literal colors with a variable alpha (Tailwind's
     `rgb(255 255 255 / var(--tw-bg-opacity))`) map the channels and keep the
     alpha.
   - Inline custom properties (`style="--fill: #fff"`) get copies too.
6. **Runtime resolution.** Some colors can't be mapped from the stylesheet
   text, so the engine reads what the page computes and adds rules after
   every override:
   - colors composed from several variables (`hsl(var(--h), var(--s),
     var(--l))`, as a variable or right in a property), evaluated on a hidden
     probe element;
   - longhands left empty in the CSSOM by an unserializable `var()`
     shorthand;
   - `background-color: currentColor`, from the page's own text color.
   Only selectors that match something are resolved, in small time slices.
7. **Inline styles and attributes.**
   - `style=""` colors are mapped into `--nyx-i-*` properties on the element,
     which an attribute rule applies. Inline `!important` colors are
     overwritten in place and restored when Nyx stops.
   - `bgcolor`, `<font color>`, SVG `fill`, `stroke` and `stop-color` values
     get attribute-selector rules; legacy `background="tile.gif"` is dropped.
   - Gradient text (`background-clip: text`) and mask icons
     (`mask-image: url()`) map their background as ink.
8. **Images.** Images get `brightness()` and `grayscale()` from the theme.
   Pixels are read through the background script when cross-origin.
   - Dark artwork on transparency is inverted; logos that mix color with dark
     parts (Gmail's wordmark) are redrawn with only the dark pixels lightened
     and shown through `content: url()`. CSS background logos and sprites get
     the same treatment at natural size.
   - Large pale backdrops with text on them (hero images, `<video>`,
     `<canvas>`, full-page background images) are darkened. When a backdrop's
     pixels can't be read (no host access, no CORS), it is darkened if the
     page's own text on it is dark.
9. **Contrast guard.** Whatever produced the final colors, text that is on screen is
   checked against the solid background actually behind it. Text below 3:1 (a color
   the rewriter could not see: an unreadable stylesheet, a variable set from script,
   an inline `!important`) is lifted to 4.5:1, keeping its hue, accounting for
   opacity. It also covers icon-font glyphs, form fields and gray SVG icons. It
   runs lazily on elements as they scroll into view and again when stylesheets
   change. Text over photos or gradients is left alone.
10. **Detection.** After `DOMContentLoaded` (and again on `load`, or when
   `<html>`/`<body>` theme classes change) Nyx briefly disables its styles and
   samples the rendered page, looking through modal backdrops. If most of the
   viewport is already dark (75%), Nyx steps aside, unless "ignore built-in
   dark mode" applies.
11. **Keep up.** The engine stays current through three mechanisms:
   - **MutationObservers** catch new stylesheets, inline style changes and
     shadow roots.
   - **A one-second poll** catches CSSOM changes (`insertRule`) and custom
     elements that attach shadow roots after upgrade.
   - **Storage change events** apply settings changes live.

## Settings and sync

The settings document (`Settings` in `shared/settings.ts`) lives in
`browser.storage.local`, because content scripts can read it synchronously at
page start.

**On Safari,** the background script exchanges it with the native app through
`sendNativeMessage`. The app stores it in the App Group, which the app,
Shortcuts and widgets share, and in iCloud key-value storage, which other
devices see. Both copies are merged entry by entry by `updatedAt`.

**In other browsers,** `storage.sync` plays the same role.

Changes made in the app reach Safari in three ways:

- on the next page load (throttled to once a minute)
- every 5 minutes
- whenever the toolbar menu opens
