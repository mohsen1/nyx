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
6. **Inline styles and attributes.**
   - `style=""` colors are mapped into `--nyx-i-*` properties on the element,
     which an attribute rule applies.
   - `bgcolor`, `<font color>`, SVG `fill`, `stroke` and `stop-color` values
     get attribute-selector rules.
7. **Images.** Images get `brightness()` and `grayscale()` from the theme.
   Small images that are mostly dark pixels on transparency are inverted;
   pixels are read through the background script when cross-origin.
8. **Detection.** After `DOMContentLoaded` (and again on `load`, or when
   `<html>`/`<body>` theme classes change) Nyx briefly disables its styles and
   samples the rendered page. If the page is already dark, Nyx steps aside,
   unless "ignore built-in dark mode" applies.
9. **Keep up.** The engine stays current through three mechanisms:
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
