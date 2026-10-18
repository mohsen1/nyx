# Developing Nyx

## Build

```bash
npm install
npm run build        # → dist/chrome, dist/firefox, dist/safari
npm run watch        # rebuild on change
```

### Chrome, Edge, Firefox

- **Chrome / Edge:** open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick `dist/chrome`.
- **Firefox:** open `about:debugging`, choose "Load Temporary Add-on" and pick `dist/firefox/manifest.json`.

### Safari

Safari extensions ship inside a container app in [`apple/`](apple/). See [apple/README.md](apple/README.md) for Xcode setup, local signing (`npm run apple:mac`) and publishing to the App Store (`npm run apple:publish`).

## Test

```bash
npm run typecheck
npm test             # unit tests (Vitest)
npm run test:e2e     # loads the built extension into Chromium and checks real pages (Playwright)
npm run check        # all of the above
```

## Assets

```bash
node scripts/screenshots.mjs           # docs/images (demo page in several themes)
node scripts/appstore-screenshots.mjs  # docs/appstore (App Store screenshots, needs network)
node scripts/icons.mjs                 # re-render icons from assets/*.svg
```

## How it works

[docs/architecture.md](docs/architecture.md) explains the engine.

## Compatibility with Noir

Nyx is a clean-room reimplementation of the feature set of *Noir – Dark Mode for Safari*, and accepts theme links shared from Noir (`https://getnoir.app/theme?…` or `noir://theme?…`).

It was rebuilt from Noir's public, observable behavior (App Store metadata, version history, the theme sharing page, reviews and screenshots, the developer's public statements), following the evidence-first method of [REA](https://github.com/morluto/rea):

- every claim about Noir is recorded in an [evidence ledger](docs/reverse-engineering/evidence.md)
- every behavior Nyx must reproduce is an [obligation](docs/reverse-engineering/obligations.md) with an owner and a verifying test
- unknowns stay listed instead of being guessed

No Noir code, binaries or assets were used. If you own Noir, [docs/reverse-engineering](docs/reverse-engineering/README.md) explains how to check the compatibility claims against your copy.

Nyx is an independent project, not affiliated with or endorsed by Noir or its developer.
