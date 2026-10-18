---
version: 1
slug: "extension-static-options-html"
primary_target: "extension/static/options.html"
related_targets: ["extension/static/popup.html","apple/App/ContentView.swift"]
---

# Extension UI (popup, settings page, container app)

Mode: Operate. Surfaces: `extension/static/popup.html` + `extension/src/popup/main.ts`, `extension/static/options.html` + `extension/src/options/main.ts`, shared `ui.css` / `ui.ts`, `apple/App/ContentView.swift`.

Job: change one website's dark mode in seconds from the toolbar; set up defaults and themes once.

## Direction contract

THESIS: Nyx reads as part of Safari and System Settings, not as a web dashboard. It refuses full-width cards, stretched segmented bars, button walls and explanatory copy.

OWN-WORLD: Apple grouped inset lists on a tinted grouped background (light #f2f2f7 page, #fff cells; dark #000 page, #1c1c1e cells, #2c2c2e elevated menus and sheet rows), hairline separators inset past the icon, system font at 13px with 11-12px secondary text, small Lucide icons at 16px in secondary color, popup buttons with an up-down chevron, iOS-style switches, segmented controls sized to content. One tint across web and native: Apple systemIndigo, #5856d6 light / #5e5ce6 dark (HIG Color, system colors), chosen because it matches the indigo app icon; light-indigo #a5a3ff for tinted text on dark cells to keep AA contrast; native AccentColor asset set to the same pair.

STORY: The user sees the website name and whether it is dark now, changes its status or theme in one click, and finds everything rarer behind Settings.

FIRST VIEWPORT: Popover: host title with scope chevron and status line, gear at right; one inset group for this website (Status row with a content-sized segmented control, theme popup with a live swatch, pause row, reset row when customized); a quieter All websites group below; one report link at the foot. Settings page: app icon at left, Safari-Settings-style toolbar of icon-over-label tabs centered at top, a 640px column of grouped lists below; theme library first, My themes last with a trailing New theme tile and the import row under it. Footers only carry live status.

FORM: Pinned by brief (native Apple settings canon). No concept roll; seed key: none (brief-pinned). Signature move: the theme gallery as appearance-picker thumbnails (mini pages painted in each theme, selection ring in tint), like macOS Appearance.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
