# App Store listing

Source of truth for the App Store Connect metadata. Screenshots in this folder are rendered by `scripts/appstore-screenshots.mjs`.

App Store Connect app ID: `6824462594` (created on 2026-10-19 with iOS and macOS platforms).

Version **1.0.4**, build **261102.1740**, uploaded for both platforms on **2026-11-02**. macOS was resubmitted and is **Waiting for Review**. iOS is saved as **Prepare for Submission**, pending the physical-device recording requested by Apple after rejecting the previous build for **Information Needed (2.1)**. Manual release after approval remains selected.

Apple's iOS response dated October 31 requests a physical-device screen recording starting with app launch, plus the purpose/audience, setup instructions, external dependencies, regional behavior and any applicable protected-content authorization. The expanded review notes below were saved to App Store Connect on both platforms on November 2. The physical-device recording is still required before iOS resubmission. Both replacement builds include the Safari background reset fix and have finished processing.

Further iPhone testing on November 2 found a popup startup defect, tracked in [issue #8](https://github.com/mohsen1/nyx/issues/8). Commit `0a8c907` fixes the initial render waiting indefinitely on page state. The fix passed automated checks and an iOS device build. It was installed successfully over USB on the physical iPhone and the container app launched correctly. A matching archive was uploaded successfully as iOS build **261102.1817**; it is not included in the earlier `261102.1740` builds. Verification of the updated Safari sheet is pending: Mirroring could show the screen and send keyboard input, but coordinate actions failed and reconnecting timed out. The existing phone installation previously passed popup, website On/Off, Sepia, and reload checks; site defaults were restored. Verify the updated Safari sheet and permission behavior, select `261102.1817` after processing, and record the requested demonstration before resubmitting iOS. Keep the existing macOS submission in review.

- iOS submission: `ac122c11-bfff-4646-983e-130481bfe6bd`
- macOS submission: `72d3cea9-932a-466e-803b-f73daf90b71a` (replaces `eef928a2-b3ba-4cb5-8a8f-29ceb297574e`)

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

PURPOSE AND AUDIENCE

Nyx is a free Safari Web Extension for people who want to read websites with darker backgrounds and readable text. It applies themes to the websites the user visits. Most of its functionality is used inside Safari; the container app provides setup instructions and default settings. It is a general-purpose consumer utility.

SETUP AND MAIN FEATURES

1. Launch Nyx. Select On to test darkening regardless of the device appearance. Auto follows the device appearance or a user-defined schedule; Off disables darkening.
2. On iPhone/iPad, open Settings > Apps > Safari > Extensions > Nyx. Enable Nyx and allow website access. On Mac, use "Open Safari Extension Settings" in Nyx and enable the extension.
3. Open Safari and visit https://news.ycombinator.com. This public page needs no account or sample files. Nyx darkens the page.
4. Open Safari's page menu and choose Nyx (on Mac, use the Nyx toolbar button). Change the current website's status or theme. Selecting Off restores that site's appearance; On applies Nyx. The default theme can also be selected in the container app.
5. Other features include per-site preferences, pause until tomorrow, custom themes and theme-link import. Settings sync through the user's existing iCloud account when available; iCloud is not required to use dark mode locally.

No Nyx registration, login, account deletion, subscription, in-app purchase or paid content exists. No demo credentials are needed. Nyx does not host a social feed or user-generated content service.

EXTERNAL SERVICES

Website appearance is processed locally by the bundled extension. It reads the visited page's styles and may fetch stylesheets and images already referenced by that page to analyze their colors. There is no Nyx backend, authentication service, payment processor, AI service or analytics provider. Apple's iCloud key-value storage optionally syncs settings. The optional "Report a problem with this website" flow lets the user review/edit a report and opens GitHub to file it; GitHub is not required for dark mode. The website/support/privacy links open azimi.me.

REGIONS AND THIRD-PARTY MATERIAL

Nyx has the same functionality in all regions and has no region-specific catalog. The availability of websites or Apple services can depend on the user's network and region. Nyx is not a regulated service and does not distribute a protected third-party content catalog. Users browse websites directly in Safari; Nyx changes their local appearance and does not provide access to paid content.
