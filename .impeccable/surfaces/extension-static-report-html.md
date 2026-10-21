---
version: 1
slug: extension-static-report-html
primary_target: extension/static/report.html
related_targets: [extension/src/report/main.ts, extension/src/popup/report.ts]
---

# Screenshot review

Mode: Operate. Extend the existing Nyx extension UI; preserve its system font, indigo action buttons, semantic light/dark surfaces and native controls. No new identity or generated assets.

## Direction contract

THESIS: The user sees and removes private information before copying a report screenshot.

OWN-WORLD: Existing ui.css colors and button treatments. A full-width local screenshot workspace within a readable 1120px column, quiet instructions and a compact toolbar.

STORY: Capture locally, draw blackouts with pointer/touch or enter percentages by keyboard, undo mistakes, review report details, then copy and open GitHub. Cancel copies and uploads nothing.

FIRST VIEWPORT: Review screenshot heading and Cancel, one short instruction, Undo/Clear controls and scalable screenshot preview; export actions and editable report details follow in document order. Mobile wraps controls and keeps screenshots scrollable at actual size when requested.

FORM: Local addition in the established Apple-style extension interface. Seed: none (precise feature, inherited world). Blackouts mirror onto both comparison views and are burned into fresh PNG pixels.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
