# Product

<!-- impeccable:product-schema 1 -->

<!-- Inferred from README.md, docs/architecture.md and the redesign brief; not confirmed in an interview. -->

## Platform

adaptive

## Users

People who browse in Safari on iPhone, iPad and Mac (and in Chrome or Firefox) and want websites to match a dark system appearance. They open Nyx for a few seconds at a time: to turn it off for one website that looks wrong, pick a different theme, or pause it. The settings page and the container app are visited rarely, usually once at setup.

## Product Purpose

Nyx darkens every website by generating a dark style from the page's own colors, so links, brand colors and cards stay recognizable. Success is a user who sets it up once and only touches the toolbar menu when a single website needs an exception.

## Positioning

Open source, private (no data collection), and compatible with an existing theme-link format used by other dark mode apps.

## Operating Context

- Toolbar popover in Safari (Mac popover, iOS sheet), Chrome and Firefox.
- Settings page opened from the popover, in a browser tab (wide on Mac, narrow on iPhone).
- Native container app (SwiftUI) used for setup, default status and theme, and theme-link import.

## Capabilities and Constraints

- Global status Auto / On / Off; Auto follows system appearance or a schedule.
- Per-website status (Default / Auto / On / Off), theme, pause until tomorrow, ignore built-in dark mode, optional advanced appearance switches; settings scopes for domain, subdomain, host:port, or page.
- 26 built-in themes in collections, custom themes (background, text, image brightness, grayscale), import and copy theme links.
- Backup export and import; keyboard shortcuts set in the browser.
- Extension pages cannot load remote resources; everything ships locally.
- User-visible copy must not name the other dark mode app (App Store review risk).

## Brand Commitments

- The name Nyx and the existing app icon (`extension/static/icons`).
- Binding from the brief: minimal, conventional, Apple-native settings feel; progressive disclosure; no copy about how the engine works; Lucide icons on the web, SF Symbols in the native app; system font stack; correct in light and dark.

## Product Principles

1. Familiar before clever: every control is one the user already knows from Apple settings.
2. Show the few things people change; tuck the rest one step away.
3. Labels say what a control does for the user, never how Nyx does it.
4. One setup, then out of the way.

## Accessibility & Inclusion

Keyboard operable, visible focus, WCAG AA text contrast in both appearances, respects reduced motion.
