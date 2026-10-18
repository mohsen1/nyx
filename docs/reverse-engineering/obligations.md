# Reconstruction obligations

Each obligation is a behavior Nyx must reproduce. For each one the table records:

- **Evidence:** the IDs in [evidence.md](evidence.md) that establish the behavior
- **Owner:** the code that implements it
- **Verifier:** the test that proves it

Statuses:

- **verified:** a passing automated test covers the obligation
- **implemented:** the code exists, but no automated test covers it. This applies to native Apple code that CI builds but cannot exercise.
- **design:** Nyx's own choice where the evidence is silent

The test files are `tests/unit/*.test.ts` (Vitest) and `tests/e2e/extension.spec.ts`. The e2e suite loads the built extension into Chromium.

## Status and scheduling

| ID | Obligation | Evidence | Owner | Verifier | Status |
| --- | --- | --- | --- | --- | --- |
| O1 | Global status is Auto, On or Off. Auto follows the system dark mode, and is the default. | E1, E6, E7 | `shared/settings.ts` `decide` | unit "follows the system appearance"; e2e "Auto leaves pages alone in light mode" | verified |
| O2 | Per-website status is Default, Auto, On or Off, and overrides the global status. | E6, E7 | `decide`, `updateSite`, popup | unit "lets a website override"; e2e "site Off wins" | verified |
| O3 | Settings can be scoped to a page, a subdomain, a domain, or a host with a port. The most specific scope wins. | E9, E11, E14 | `siteScopes`, `matchSiteKey`, popup scope picker | unit "website scopes" | verified |
| O4 | Auto can follow a time schedule instead of the system; schedules that cross midnight work. The default is 20:00–07:00. | E9, E10 | `isWithinSchedule`, content-script re-check timer | unit "schedule that crosses midnight" | verified |
| O5 | "Pause Until Tomorrow" for a website, and for everything. | E2, E4 | `tomorrowMorning`, popup, `pause-site` command | unit "pauses …"; e2e "pause until tomorrow" | verified (reset time is design, U2) |

## Rendering

| ID | Obligation | Evidence | Owner | Verifier | Status |
| --- | --- | --- | --- | --- | --- |
| O6 | Generate a dark style from the page's own colors (not by inverting the whole page). Contrast is preserved and accents stay recognizable. | E1, E12 | `shared/palette.ts`, `content/sheet-transform.ts`, `content/engine.ts` | unit `palette.test.ts`; e2e "darkens a light page" | verified |
| O7 | Cover inline styles, presentational attributes (bgcolor, fill), CSS variables, cross-origin stylesheets, open shadow roots and CSS-in-JS. | E1 [I] | `engine.ts`, `css-values.ts` | e2e "darkens a light page" | verified |
| O8 | No white flash while the page loads. | E1 ("you won't even notice") | `loadingCss`, document_start injection | manual; the screenshot pipeline shows no flash | implemented |

## Built-in dark mode detection

| ID | Obligation | Evidence | Owner | Verifier | Status |
| --- | --- | --- | --- | --- | --- |
| O9 | Detect a website's built-in dark mode and leave the website alone. | E7, E9 | `content/detect.ts` | e2e "leaves sites with their own dark mode alone" | verified |
| O10 | "Ignore built-in dark mode": a global default (off) plus a per-website Default/On/Off. | E7, E9 | `decide`, popup, options | unit "applies the global ignore default"; e2e "unless told to ignore it" | verified |
| O11 | Re-detect when a site switches its own theme. | E2 (2026.1.4 detection work) [I] | `watchThemeSwitches` | e2e "re-detects when a site switches its own theme" | verified |
| O12 | Report an incorrectly detected built-in dark mode, with a choice of ask or never. | E2 | popup `reportDetection`, `darkModeReporting` | — | implemented. Reports open a pre-filled GitHub issue; Nyx has no server, so there is no "automatic" option. |

## Themes and appearance

| ID | Obligation | Evidence | Owner | Verifier | Status |
| --- | --- | --- | --- | --- | --- |
| O13 | A theme has a background color, text color, image brightness and grayscale. More than 20 themes are built in. | E1, E4, E7 | `shared/theme.ts`, `builtin-themes.json` | unit "built-in library" | verified |
| O14 | Edit, duplicate and delete themes; reset an edited built-in theme; set the default theme; set a theme per website. | E7 | options page, `themeOverrides` | e2e "switches themes live" | verified (editor UI checked manually) |
| O15 | **Theme link compatibility:** read and write `…/theme?name=&bg=&text=&imageBrightness=&imageGrayscale=`, in both the `https://getnoir.app/theme` and `noir://theme` forms. | E3, E4, E5 | `parseThemeLink`, `themeQuery`, Swift `Theme(shareURL:)` | unit "Noir-compatible theme links"; e2e "imports a Noir theme link" | verified |
| O16 | Advanced appearance options are hidden until enabled. Once enabled, each website can set dynamic colors, background images and image inversion. | E2, E13 | `decide`, popup, `Palette.dynamicColors`, `hideImages`, `ImageAnalyzer` | unit "applies advanced appearance options only when enabled"; e2e "advanced appearance" | verified |
| O17 | Dark images on transparent backgrounds (logos, icons) are inverted; photos are not. | E2, E12 [I] | `content/images.ts` | e2e "darkens a light page" (logo inverted, photo not) | verified |

## Controls, integrations and sync

| ID | Obligation | Evidence | Owner | Verifier | Status |
| --- | --- | --- | --- | --- | --- |
| O18 | Keyboard shortcuts: toggle a website, step it through Auto → On → Off → Default, cycle themes, set the global status, pause, ignore dark mode. | E4, E8 | manifest `commands`, `background/main.ts` | unit "cycles the status"; "cycles themes" | verified (logic), implemented (bindings) |
| O19 | Settings sync between devices through iCloud. | E1, E2 | `background/sync.ts`, `apple/Shared/SettingsStore.swift` | unit "merges sync snapshots" | implemented |
| O20 | Shortcuts actions: Set Status, Set Default Theme, Set Website Status, Pause, Resume. | E1, E11 | `apple/Shared/Intents.swift` | CI build | implemented |
| O21 | A Focus Filter sets the status and theme, reverts when the Focus ends, and can be stopped from the app. | E1, E11 | `NyxFocusFilter` | CI build | implemented |
| O22 | A Control Center control turns dark mode on or off. | E2 | `apple/Widgets/NyxWidgets.swift` (iOS 18) | CI build | implemented (the macOS control is not built yet) |
| O23 | No browsing data is collected. | E1 | No network calls except the page's own resources, fetched on the page's behalf (`fetchResource`) | code review | verified by design |

## Not reproduced

These Noir behaviors are out of scope for now:

- home screen and desktop widgets (theme swatch grid)
- the visionOS app
- the "Noir for Web Apps" second extension
- the getnoir.app install-page handshake (`noir-ping`)
- the iPadOS compact-tab-bar warning
