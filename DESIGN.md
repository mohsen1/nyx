---
name: Nyx website
description: A quiet Apple-style product page for Nyx, the dark mode extension for Safari, that follows the visitor's appearance.
colors:
  page: "#ffffff"
  band: "#f5f5f7"
  ink: "#1d1d1f"
  ink-secondary: "#6e6e73"
  hairline: "rgb(0 0 0 / 0.1)"
  nyx-indigo: "#5856d6"
  nyx-indigo-soft: "rgb(88 86 214 / 0.1)"
  tint-ink: "#ffffff"
  page-dark: "#000000"
  band-dark: "#161617"
  ink-dark: "#f5f5f7"
  ink-secondary-dark: "#a1a1a6"
  hairline-dark: "rgb(255 255 255 / 0.14)"
  nyx-indigo-dark: "#7d7aff"
  nyx-indigo-fill-dark: "#5e5ce6"
  nyx-indigo-soft-dark: "rgb(125 122 255 / 0.16)"
  button-secondary-bg-dark: "rgb(255 255 255 / 0.12)"
  tag-dark-glass: "rgb(29 29 31 / 0.78)"
  tag-light-glass: "rgb(255 255 255 / 0.9)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "clamp(42px, 7.2vw, 80px)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "clamp(32px, 4.8vw, 56px)"
    fontWeight: 600
    lineHeight: 1.07
    letterSpacing: "-0.03em"
  doc-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "clamp(36px, 5.4vw, 52px)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.032em"
  doc-heading:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.07
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  lede:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "clamp(19px, 2vw, 22px)"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.005em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  small:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", \"Helvetica Neue\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.005em"
  mono:
    fontFamily: "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace"
    fontSize: "0.86em"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
rounded:
  code: "6px"
  icon: "7px"
  swatch: "12px"
  panel: "14px"
  frame: "18px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 4vw, 32px)"
  wrap: "1080px"
  doc-wrap: "680px"
  section: "clamp(80px, 11vw, 136px)"
  hero-top: "clamp(56px, 9vw, 104px)"
  hero-bottom: "clamp(56px, 8vw, 96px)"
  block-gap: "clamp(48px, 6vw, 72px)"
  column-gap: "40px"
  rule-pad: "22px"
  item-gap: "14px"
  header-height: "52px"
components:
  button-primary:
    backgroundColor: "{colors.nyx-indigo}"
    textColor: "{colors.tint-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "44px"
  button-primary-dark:
    backgroundColor: "{colors.nyx-indigo-fill-dark}"
    textColor: "{colors.tint-ink}"
  button-secondary:
    backgroundColor: "{colors.nyx-indigo-soft}"
    textColor: "{colors.nyx-indigo}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "44px"
  button-secondary-dark:
    backgroundColor: "{colors.button-secondary-bg-dark}"
    textColor: "{colors.ink-dark}"
  nav-cta:
    backgroundColor: "{colors.nyx-indigo}"
    textColor: "{colors.tint-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 13px"
  nav-bar:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    height: "{spacing.header-height}"
  segmented-track:
    backgroundColor: "{colors.band}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segmented-option:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "32px"
  segmented-option-selected:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
  compare-frame:
    backgroundColor: "{colors.band}"
    rounded: "{rounded.frame}"
  compare-tag-original:
    backgroundColor: "{colors.tag-dark-glass}"
    textColor: "{colors.tint-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
  compare-tag-nyx:
    backgroundColor: "{colors.tag-light-glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
  compare-handle:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "44px"
  theme-swatch:
    rounded: "{rounded.swatch}"
    padding: "12% 13%"
  install-item:
    backgroundColor: "{colors.page}"
    rounded: "{rounded.frame}"
    padding: "clamp(24px, 3.4vw, 36px)"
  doc-summary:
    backgroundColor: "{colors.band}"
    typography: "{typography.lede}"
    rounded: "{rounded.panel}"
    padding: "20px 22px"
  code-inline:
    backgroundColor: "{colors.band}"
    typography: "{typography.mono}"
    rounded: "{rounded.code}"
    padding: "0.1em 0.38em"
---

# Design System: Nyx website

This file covers the public website in `site/` (home, privacy, support, 404). The extension's own UI (popup and options page) has a separate surface brief at `.impeccable/surfaces/extension-static-options-html.md` and is not part of this system. The shared-theme landing page `site/theme/index.html` is self-contained with its own inline styles and is also outside this system.

## Overview

**Creative North Star: "The Quiet Product Page"**

The site reads like an Apple product page: a white (or black) page, big tightly tracked headlines, lots of room, and the product itself doing the persuading. The first thing a visitor touches is a real website they can wipe from light to Nyx with a diagonal seam. Everything else holds back so that proof can carry the page.

It follows the visitor's appearance in both directions with no toggle: light visitors get white and pale gray bands, dark visitors get true black and near-black bands. One color, Nyx indigo, is the only hue the site adds. Real screenshots supply all other color: the comparison captures, the popup shot, and the 26 theme swatches, whose colors are data, not decoration.

Density is low and the rhythm is one-column: a centered hero, then sections that switch between page and band, each opening with a headline and a gray lede. Structure comes from whitespace and hairline rules, not from cards. Motion is limited to one entrance (the seam sweeps in from the right once) and small hover and press feedback.

**Key Characteristics:**
- Follows `prefers-color-scheme`; every token has a light and a dark value.
- One indigo tint for links, focus, the primary button and tick marks; nothing else is colored.
- System SF Pro stack, 600-weight headlines with negative tracking.
- Pill-shaped controls everywhere; 18px corners on large imagery.
- Soft, long, offset-down shadows on product imagery only.
- Hairline top rules organize feature lists instead of cards.

## Colors

A neutral Apple grayscale with a single indigo tint, mirrored for dark appearance.

### Primary
- **Nyx Indigo** (`nyx-indigo`, dark `nyx-indigo-dark`): text links, `:focus-visible` outlines, tick marks in the ticks list, the segmented focus ring and the compare handle's focus outline.
- **Indigo Fill** (`nyx-indigo` in light, `nyx-indigo-fill-dark` in dark): the background of the primary pill button, the nav "Get Nyx" pill, the skip link and text selection. In dark the fill is deeper than the link color so white text on it still passes AA.
- **Indigo Wash** (`nyx-indigo-soft`): the secondary button's background in light. In dark the secondary button uses a white wash (`button-secondary-bg-dark`) with ink text instead, because an indigo wash on black reads muddy.

### Neutral
- **Page** (`page` / `page-dark`): the default ground and the background of install cards and the selected segment.
- **Band** (`band` / `band-dark`): alternating full-bleed sections, the segmented track, the compare frame while images load, inline code, and the document summary box.
- **Ink** (`ink` / `ink-dark`): headlines, body text, the brand name, active nav item.
- **Secondary Ink** (`ink-secondary` / `ink-secondary-dark`): ledes, captions, point and fact descriptions, nav links at rest, footer, ordered-list text in install cards.
- **Hairline** (`hairline` / `hairline-dark`): the header's bottom border, the top rule on points and facts, footer border, details dividers, the inset ring on the segmented track and theme swatches.

### Fixed overlays
- **Original tag** (`tag-dark-glass`, white text) and **With Nyx tag** (`tag-light-glass`, ink text) are colored for the half of the picture they sit on, not for the visitor's appearance, so they do not change in dark mode. The compare seam and handle are fixed white for the same reason.

### Named Rules
**The One Tint Rule.** Indigo is the only hue the site contributes. It marks what you can act on (links, primary button, focus), the ticks list and the icons that label points, facts and install cards, and nothing decorative. No gradients, no glows, no second accent.

**The Content Brings the Color Rule.** Screenshots and theme swatches carry their own colors; the chrome around them stays neutral so they read as true.

## Typography

**Display Font:** the system stack (`-apple-system`, BlinkMacSystemFont, SF Pro Text/Display, with Helvetica Neue, Segoe UI and system-ui fallbacks)
**Body Font:** the same stack
**Label/Mono Font:** `ui-monospace`, SF Mono, Menlo, Consolas (inline code only)

**Character:** One family, Apple's own, in two weights that do the work: 600 for headings and 400 for reading, with 500 for controls. Tracking gets tighter as size grows, from -0.01em on body text to -0.035em on the hero headline.

### Hierarchy
- **Display** (`typography.display`): the single hero headline, centered, max 13em wide.
- **Headline** (`typography.headline`): one per section, left-aligned (centered in the privacy section), max 16em wide.
- **Doc Title / Doc Heading** (`typography.doc-title`, `typography.doc-heading`): h1 and h2 on privacy, support and 404.
- **Title** (`typography.title`): h3 for points, facts, install cards; also the bold `summary` of a details row.
- **Lede** (`typography.lede`): the gray paragraph under each headline, max 40em (34em in the hero and privacy), `text-wrap: pretty`.
- **Body** (`typography.body`): 17px/1.5 everywhere; document pages relax line height to 1.6.
- **Caption** (`typography.caption`): the compare caption, document meta line and theme group names (group names at 600).
- **Label** (`typography.label`): nav links, segmented options, theme names.
- **Small** (`typography.small`): footer, compare tags (12px on phones).

### Named Rules
**The Tight Display Rule.** Headings are 600 weight, `text-wrap: balance`, with negative tracking that scales with size. Never uppercase, never letterspaced open.

**The Gray Lede Rule.** Every section headline is followed by at most one lede in secondary ink. The headline makes the claim; the lede backs it up.

## Layout

- **Container:** content is centered with a max width of 1080px plus a fluid gutter (`spacing.gutter`, 16 to 32px). Document pages use a 680px measure with the same gutter.
- **Header:** sticky, 52px tall, page color at 80% with `saturate(180%) blur(20px)` and a hairline bottom border. `scroll-padding-top: 72px` keeps anchored headings clear of it.
- **Section rhythm:** sections alternate between page and band, with `spacing.section` vertical padding (80 to 136px). When two page-colored sections touch, the second drops its top padding so they share one gap.
- **Hero:** `spacing.hero-top` above, `spacing.hero-bottom` below, all centered; the compare figure sits 44 to 72px below the actions at full content width.
- **Grids:** points use 3 columns (1 below 700px); facts use 4 columns (2 below 900px, 1 below 520px); install cards use 2 (1 below 760px). Blocks under a headline start `spacing.block-gap` below it.
- **Split:** text beside a product shot capped at 400px, with a fluid 40 to 96px gap; stacks below 820px.
- **Theme gallery:** a 7-column grid per collection on desktop; below 900px each collection becomes an edge-to-edge horizontal scroller with scroll snapping and a hidden scrollbar.
- **Nav collapse:** "How it works" and "Themes" hide below 760px; "Privacy" and "Support" hide below 520px. GitHub and the Get Nyx pill always stay.
- **Compare on phones:** below 640px the frame switches to 2:3 phone captures and the tags move to the bottom corners.

## Elevation & Depth

The site is flat. Depth appears only on things that are pictures of the product: the compare frame, the popup screenshot, theme swatches and the compare handle. Those get a soft, long shadow offset downward. In dark mode the shadow deepens and adds a 1px white ring at 8%, because a shadow alone vanishes on black. Text sections, install cards and the summary box get no shadow; they separate by tone (page against band).

### Shadow Vocabulary
- **Raise** (`0 18px 50px -18px rgb(0 0 0 / 0.28), 0 2px 6px rgb(0 0 0 / 0.06)`; dark: `0 18px 50px -18px rgb(0 0 0 / 0.9), 0 0 0 1px rgb(255 255 255 / 0.08)`): the compare frame and the popup screenshot.
- **Raise small** (`0 6px 18px -8px rgb(0 0 0 / 0.25)`; dark: `0 6px 18px -8px rgb(0 0 0 / 0.8), 0 0 0 1px rgb(255 255 255 / 0.08)`): theme swatches (with an inset hairline) and the compare handle.
- **Segment lift** (`0 1px 3px rgb(0 0 0 / 0.14), 0 0 0 0.5px rgb(0 0 0 / 0.06)`): the selected option in a segmented control.
- **Tag lift** (`0 1px 3px rgb(0 0 0 / 0.18)`): compare tags, which also blur what is behind them by 12px.

### Named Rules
**The Only Pictures Float Rule.** Shadows belong to product imagery and to the one draggable handle. Cards, sections and text blocks stay flat and separate by tone.

## Shapes

Corners are soft and few. Anything you press is a full pill (`rounded.pill`): buttons, the nav CTA, segmented track and options, compare tags, the skip link. The compare handle is a circle. Large imagery and install cards use 18px (`rounded.frame`); the popup shot and document summary use 14px (`rounded.panel`); theme swatches use 12px (`rounded.swatch`); the brand icon 7px; inline code and focus outlines 6px. Lines are 1px hairlines in `hairline`, drawn as top rules, never as boxes around content. The only angle in the system is the compare seam, which leans 6% of the frame width each way from its midpoint.

Small arrows are drawn in CSS from two bordered edges: the forward chevron after a link arrow, the tick in the ticks list, and the disclosure chevron on details rows. SVG icons come from Lucide (ISC license), inlined: the left-right chevrons inside the compare handle, and one icon above each point, fact and install-card title, plus a lock above the privacy headline. They use 24px artwork drawn at 28px (44px for the privacy lock), a 1.75 stroke (1.5 for the lock), round caps and joins, in the tint. An icon labels the title right below it; buttons, nav links, ticks and document pages carry none.

## Components

### Buttons
Pills that feel native rather than promotional.
- **Shape:** full pill, at least 44px tall, 22px side padding, 17px at 500 weight.
- **Primary:** indigo fill with white text. Used for "Get Nyx" and the main download.
- **Secondary:** indigo wash with indigo text in light; white wash with ink text in dark.
- **Hover / Active:** hover brightens slightly (`filter: brightness(1.06)`); press scales to 0.98. Both 0.2s on `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Link arrow:** a plain indigo text link with a CSS chevron that slides 3px right on hover. Used as the quiet second action beside a primary button.

### Navigation
- **Bar:** sticky translucent header; brand (28px icon at 7px radius plus "Nyx" at 18px/600) on the left, links on the right at 14px.
- **States:** links rest in secondary ink and turn ink on hover or when `aria-current="page"`; no underline.
- **CTA:** a compact indigo pill (4px 13px padding, 500 weight) that brightens by 8% on hover.
- **Footer:** a hairline above, 13px secondary text, links in secondary ink turning ink on hover.

### Segmented Control
Modeled on the native macOS/iOS control.
- **Track:** band-colored pill, 3px padding, 2px gap, inset hairline ring.
- **Options:** 32px tall, 16px side padding, 14px/500, secondary ink; hover turns ink.
- **Selected:** page-colored background, ink text and the segment lift shadow. It is a `radiogroup`; left and right arrow keys move the selection.

### Compare Viewer (signature)
The site's proof and its one signature interaction.
- **Frame:** 16:10 (2:3 phone captures below 640px), 18px corners, Raise shadow, band background while loading, `ew-resize` cursor.
- **Seam:** a 2px white line, skewed so it leans 6% of the width each way; the Nyx image is clipped to a matching polygon. The angle is recomputed on resize so it stays exact.
- **Handle:** 44px white circle with ink chevrons and Raise small, counter-skewed to stay upright; grows to 1.08 while dragging; shows the indigo focus outline when the hidden range input has keyboard focus.
- **Tags:** "Original" (dark glass, white text) top left and "With Nyx" (light glass, ink text) top right, 13px/500 pills with backdrop blur.
- **Input:** pointer drag anywhere on the frame, touch (vertical pan still scrolls) and keyboard through a transparent range input from 4 to 96.
- **Motion:** on first view the seam eases once from 92% to rest over 1400ms with an exponential ease-out. Turned off under reduced motion and cancelled if the visitor starts dragging.
- **Caption:** a segmented control picks the site, and a 15px secondary caption below it (`aria-live`) names the site and theme.

### Theme Swatch
- **Shape:** 4:3 tile, 12px corners, Raise small plus an inset hairline, padding 12% by 13%.
- **Content:** the theme's own background and text color (set inline per theme) with a large "Aa" (22 to 30px, 600) and a one-line sample at 11px; the theme name sits below in 14px ink.
- **Grouping:** collections get a 15px/600 secondary-ink name, 14px above the row.

### Ticks List
- **Style:** an unbulleted list with 14px between items; each item has a 30px left indent and an indigo CSS tick (12 by 7px, 2px stroke) on the first line.

### Points and Facts
- **Style:** a column of a 28px Lucide icon in the tint, an h3 title 14px below it, and a secondary-ink paragraph, separated by a hairline top rule with 22px above the icon. No background and no border box.

### Install Item
- **Style:** a page-colored panel on a band section, 18px corners, fluid 24 to 36px padding, no shadow. A 28px Lucide icon for the browser (compass for Safari, globe for Chrome, Edge and Firefox), the title, an ordered list of steps in secondary ink with 8px gaps, then a pill button pinned to the bottom so both cards' buttons line up.

### Document Pages
- **Measure:** 680px column with 56 to 96px top and 72 to 112px bottom padding.
- **Head:** doc title, then a 15px secondary meta line.
- **Summary box:** optional band-colored panel (14px corners, 20px 22px padding, 19px/1.45) that states the short answer first.
- **Body:** 1.6 line height, 12px between paragraphs, lists with 6px gaps; menu paths in 500 weight, never wrapped.
- **Details (FAQ):** rows divided by hairlines (top on each, bottom on the last), 16px vertical padding; the summary is 600 weight with a CSS chevron on the right that rotates from down to up when open.

### Inline Code
- **Style:** mono at 0.86em, 6px corners, band background (page background when it sits on a band), no letter-spacing.

## Do's and Don'ts

### Do:
- **Do** give every color a light and a dark value and switch on `prefers-color-scheme`; there is no theme toggle.
- **Do** keep indigo to links, the primary button, focus and the ticks list.
- **Do** use the full pill (`rounded.pill`) for anything pressable, with at least a 44px touch height for buttons.
- **Do** put shadows on product imagery only, and add the 1px white ring at 8% in dark mode.
- **Do** separate content with whitespace, page/band alternation and hairline top rules.
- **Do** use real screenshots and real theme colors as the page's imagery.
- **Do** keep motion to `cubic-bezier(0.16, 1, 0.3, 1)` at about 0.2s for feedback, and turn off any entrance animation under `prefers-reduced-motion`.
- **Do** keep a visible 2px indigo `:focus-visible` outline at 3px offset on every interactive element.

### Don't:
- **Don't** add a second accent, gradients, or colored glows behind content.
- **Don't** put eyebrow or kicker labels above headlines; the headline opens the section.
- **Don't** wrap features in a grid of equal shadowed cards; use rule-topped columns.
- **Don't** shadow text sections, install cards or the summary box.
- **Don't** add icons as decoration; an icon appears only where it labels something: the compare handle, and the Lucide icon above each point, fact and install-card title (plus the privacy lock). No icons in buttons, nav links or document pages.
- **Don't** set headlines in uppercase or with open letter-spacing.
