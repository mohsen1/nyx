# Chrome Web Store listing

Package: `npm run chrome:package` → `dist/nyx-chrome-<version>.zip`. Images in this folder come from `node scripts/chrome-store-assets.mjs`.

| Field | Value |
| --- | --- |
| Name (from manifest) | Nyx – Dark Mode |
| Summary (from manifest) | Dark mode for every website, generated from each page’s own colors. |
| Category | Accessibility |
| Language | English |
| Homepage URL | https://azimi.me/nyx/ |
| Support URL | https://azimi.me/nyx/support/ |
| Privacy policy URL | https://azimi.me/nyx/privacy/ |
| Visibility | Public |
| Pricing | Free |
| Mature content | No |

## Description

Nyx adds a dark mode to websites that don't have one.

The quick way to darken a page is to invert it, which turns photos into negatives and orange buttons blue. Nyx reads each page's stylesheets instead and picks a new color for every background, text color and border. A blue link becomes a lighter blue. A red brand color stays red, just darker. Colored text is lightened until it's easy to read against the new background. Photos are dimmed a little to match the theme, and small dark icons on transparent backgrounds are inverted so they don't disappear.

When it runs
Auto follows your system's dark mode, or a schedule you choose (8 PM to 7 AM by default). On and Off do what they say. If a site already has its own dark mode, Nyx leaves it alone, unless you tell it not to. If a page looks off, you can pause Nyx on that site until tomorrow.

Per-site settings
Click the Nyx button to give the current site its own status and theme. A setting can cover a whole domain, one subdomain, or a single page.

Themes
26 built in, from Dark, Black and Sepia to Dracula, Nord, Solarized, Gruvbox, Catppuccin Mocha and Tokyo Night. You can make your own by picking a background color, text color, image brightness and grayscale, and share it with a link.

Keyboard shortcuts
Alt+Shift+N turns the current site on or off, Alt+Shift+P pauses it until tomorrow, and Alt+Shift+T switches themes. More commands can be assigned at chrome://extensions/shortcuts.

Privacy
Nyx collects no data. There's no account, analytics or ads. The only network requests it makes are for stylesheets and images the page already loads, so it can read their colors. Settings sync through your browser's sync storage.

Nyx is free and open source: https://github.com/mohsen1/nyx

## Privacy practices tab

**Single purpose:** Nyx shows websites in dark colors, following the user's settings for when and how.

**Permission justifications**

- `storage`: Saves the user's settings (status, schedule, themes, per-website choices) and syncs them through the browser's sync storage.
- `alarms`: Re-checks settings every few minutes so a schedule or a "pause until tomorrow" ends on time, and picks up settings synced from other devices.
- Host permission `<all_urls>`: Nyx darkens any website the user visits, so its content script must run on every page. It also reads the stylesheets and images a page loads, including ones served from other domains such as CDNs, to compute dark colors for them. When the user chooses Report a problem, it captures the visible tab, with and without Nyx, and copies the image to the clipboard for the user to paste into a GitHub issue. Nothing is sent anywhere.
- Remote code: No. All code is in the package.

**Data usage:** Nyx does not collect or use any of the listed data types. Certify all three statements (not sold to third parties, not used for unrelated purposes, not used for creditworthiness).

## Images

- Store icon 128×128: `extension/static/icons/icon-128.png`
- Screenshots 1280×800: `screenshot-1.png` … `screenshot-5.png`
- Small promo tile 440×280: `promo-small-440x280.png`
