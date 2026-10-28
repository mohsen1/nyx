# App Store listing

Source of truth for the App Store Connect metadata. Screenshots in this folder are rendered by `scripts/appstore-screenshots.mjs`.

App Store Connect app ID: `6824462594` (created on 2026-10-19 with iOS and macOS platforms).

Version **1.0.4**, build **261028.1101**, signed, uploaded and submitted for both iOS and macOS on **2026-10-28** after membership renewal activated. Both platforms: **Waiting for Review**. Manual release after approval remains selected. The previous 1.0.3 submissions were removed after the replacement builds were ready.

- iOS submission: `ac122c11-bfff-4646-983e-130481bfe6bd`
- macOS submission: `eef928a2-b3ba-4cb5-8a8f-29ceb297574e`

| Field | Value |
| --- | --- |
| Name | Nyx: Dark Mode for Safari |
| Subtitle | Night themes for any website |
| Bundle ID | app.nyx.NyxDarkMode (iOS and macOS, universal purchase) |
| SKU | nyx-dark-mode |
| Primary category | Utilities |
| Secondary category | Productivity |
| Price | Free |
| Age rating | 4+ (no objectionable content) |
| App privacy | Data Not Collected |
| Copyright | 2026 Mohsen Azimi |
| Support URL | https://azimi.me/nyx/support/ |
| Marketing URL | https://azimi.me/nyx/ |
| Privacy Policy URL | https://azimi.me/nyx/privacy/ |

## Promotional text

Nyx darkens websites in Safari using each site's own colors, so links stay blue and pages still look like themselves. 26 themes, per-site settings, iCloud sync.

## Keywords

sepia,oled,black,dim,low light,eye strain,contrast,midnight,bedtime,extension,browser,web,eyes

## Description

Nyx adds a dark mode to websites in Safari on iPhone, iPad and Mac.

The quick way to darken a page is to invert it, which turns photos into negatives and orange buttons blue. Nyx reads each page's stylesheets instead and picks a new color for every background, text color and border. A blue link becomes a lighter blue. A red brand color stays red, just darker. Colored text is lightened until it's easy to read against the new background. Photos are dimmed a little to match the theme, and small dark icons on transparent backgrounds are inverted so they don't disappear.

WHEN IT RUNS

Auto follows your device's Dark Mode, or a schedule you choose (8 PM to 7 AM by default). On and Off do what they say. If a site already has its own dark mode, Nyx leaves it alone, unless you tell it not to. And if a page looks off, you can pause Nyx on that site until tomorrow.

PER-SITE SETTINGS

Use the Nyx button in Safari to give the current site its own status and theme. A setting can cover a whole domain, one subdomain, or a single page.

THEMES

There are 26 built in:
• Dark, Black, Gray, Sepia, Dimmed, High Contrast and Grayscale
• Green, Yellow, Orange, Red, Purple and Blue
• Deep Sea, Forest, Ember, Candlelight, Midnight and Terminal
• Dracula, Nord, One Dark, Solarized, Gruvbox, Catppuccin Mocha and Tokyo Night

You can also make your own by picking a background color, text color, image brightness and grayscale, and share it with a link.

ON YOUR DEVICES

Settings sync through your iCloud account. Nyx has Shortcuts actions, a Focus Filter and a Control Center control. On Mac you also get keyboard shortcuts for turning the current site on or off, pausing it and switching themes.

PRIVACY

Nyx collects no data. There's no account to create and no analytics or ads. The only network requests it makes are for stylesheets and images the page already loads, so it can read their colors.

Nyx is free and open source: github.com/mohsen1/nyx

## What's new (1.0.4)

Google Sheets cells now darken with the rest of the page, and Gmail search icons stay visible. Improved detection of sites that switch their own dark mode after a system appearance change. Text contrast repairs now stay in place while controls transition colors.

## What's new (1.0.3)

Review report screenshots before copying them. Black out private areas in both comparison views, undo changes, and inspect screenshots at actual size. Report details can also be edited before opening GitHub.

Nyx now re-checks a site's own dark mode when browser appearance changes. Fixed excessive dimming of article images beneath fixed navigation, and a Safari screenshot-capture stall.

## What's new (1.0)

First release. If a site looks wrong, choose "Report a problem with this website" in the Nyx menu and it will open an issue on GitHub.

## Review notes

Nyx is a Safari Web Extension, so most of what it does happens inside Safari.

Mac: open Nyx and click "Open Safari Extension Settings". Turn on Nyx and allow it on all websites. Then visit any website, for example https://news.ycombinator.com.

iPhone and iPad: go to Settings > Apps > Safari > Extensions > Nyx, turn it on, and set All Websites to Allow. Then open any website in Safari.

The Nyx button in Safari's toolbar changes the status and theme for the current website. No account or sign-in is needed.
