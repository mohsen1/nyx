# Evidence ledger

Each entry is a public source about Noir's behavior. The entries were collected
in October 2026, when Noir was at version 2026.2 (iOS) and 2026.2.1 (Mac).

| Label | Meaning |
| --- | --- |
| **[O] observed** | The source states or shows it directly. |
| **[I] inferred** | Our reading of the source. |

## Sources

### E1. App Store metadata [O]

Retrieved from `itunes.apple.com/lookup?id=1581140954,1592917505,6477319451`.

- **Developer:** Jeffrey Kuiken.
- **Bundle IDs:**
  - `nl.jeffreykuiken.NoirApp` (iOS 15.0+)
  - `nl.jeffreykuiken.NoirApp.mac` (macOS 12.0+)
  - `nl.jeffreykuiken.NoirApp.vision` (visionOS 1.0+)
- **Description (quoted from the listing):**
  - "generates a custom dark style for each website you visit, based on the colors that are used on a page … contrast is preserved and highlights still pop"
  - "over 20 built-in themes and the ability to create your own"
  - "By default, Noir is linked to your device's Dark Mode"
  - "customize this to your liking, even per website"
  - "Shortcuts, Control Center, Focus Filters, and Widgets"
  - "settings are automatically synced to all your devices using iCloud"
  - "doesn't collect any of your browsing data"
- **visionOS listing:** "By default, Noir only darkens websites in the evening and night."

### E2. Version history, 2025.1.4 → 2026.2.1 [O]

Retrieved from the App Store web pages.

- **2025.2:**
  - The menu was redesigned and "brings frequent actions such as 'Pause Until Tomorrow' to the top of the menu".
  - Control Center and menu bar control.
  - Keyboard shortcuts on iPadOS and Mac.
- **2026.1:** "Advanced Appearance Options … disable dynamic colors, hide all background images, and disable image inversion". They are hidden until enabled "in the Advanced Settings inside the Noir app", are then set "for any website from the Noir menu in Safari", and are "synced … using iCloud".
- **2026.1:** "report incorrectly detected built-in dark modes directly from the Noir menu … send reports automatically, be asked each time, or never".
- **2026.1.4:** "focussed specifically on the detection of existing dark modes".
- **2026.1.7:** YouTube auto-play workaround (Mac); "default shortcuts (… Spotlight …)".
- **2026.1.9:** iOS 26.6 extension load delay; the menu now explains it.

### E3. getnoir.app/theme page source [O]

The page forwards its query string verbatim to the app:

```js
document.querySelector('#openButton').href = `noir://theme${window.location.search}`
```

The page title is `"<name> Theme – Noir – Dark Mode for Safari"`, without a second "Theme" when the name already ends in "theme".

### E4. MacStories, theming update (2022) [O]

Source: <https://www.macstories.net/reviews/safari-extension-noir-adds-theming-and-deeper-keyboard-shortcut-support/>

- **Example share link:** `https://getnoir.app/theme?name=John%E2%80%99s%20Theme&bg=182530&text=DBB745&imageBrightness=0.93`
- **Theme controls:** background color, text color, image brightness, grayscale.
- **New themes** start as white text on black.
- **Library collections:** "Six Colors", "Editor's Themes", "Moody".
- **Keyboard shortcuts:**
  - Global: set the default status, cycle themes.
  - Per website: set status and theme, "disable Noir until the next day", ignore the detected dark mode.

### E5. Indexed share link [O]

`https://getnoir.app/theme/?bg=161A1F&imageBrightness=0.88&imageGrayscale=0.11&name=Things+Dark&text=DFE3E8`

- The grayscale parameter is named **`imageGrayscale`**.
- Parameters can come in any order.
- `+` can encode a space.
- `/theme/` can carry a trailing slash.

### E6. Developer on the status modes, r/apple, 2021-10-10 [O]

- "Auto: Noir will only darken websites whenever the iOS Dark Mode is turned on"
- "On: … always darken websites, unless you've manually disabled Noir for a website"
- "Off: … never darken websites, unless you've manually enabled Noir for a website"

### E7. Press kit and App Store screenshots [O]

- **Main screen:** "Default Settings – These settings apply to every website, unless you have custom settings set up for a website", with `Auto | On | Off`.
- **Per-site status values:** `Default (x)`, `Auto`, `On`, `Off`. Example captions:
  - "Noir will always darken wikipedia.org"
  - "Noir will never darken lemonde.fr"
- **Toolbar menu rows:** Enabled; Ignore Dark Mode (`Default (Off)`); Report Issue With This Website.
- **Theme editor:** Name; Background Color; Text Color; Images → Brightness and Grayscale; Share Theme; Set as Default Theme; Reset Theme (built-in themes only); Delete Theme.

### E8. Keyboard-shortcut status cycle (MacStories 2022 screenshot) [O]

The status states are **Auto, On, Off, Default**. Caption: "Noir will step through these states when using the 'Set Enabled Status' keyboard shortcuts."

### E9. Advanced settings (Cult of Mac, May 2022) [O]

- "AUTO MODE: Auto Mode = System Dark Mode".
- Custom schedules for Auto.
- Page-specific website settings.
- The BUILT-IN DARK MODE global toggle is recommended off, and turned on per website instead.

### E10. getnoir.app/faq [O]

On Apple Vision Pro, Noir follows a time schedule: "By default Noir will darken pages between 8PM and 7AM".

### E11. Developer posts, @Noir on indieapps.space [O]

- Settings can be set per port on an IP address or domain (2024-01).
- A "Set Default Theme" Shortcuts action exists.
- Pages with a strict CSP can block the injected stylesheets.
- Focus Filters can be "stopped" in the app, which reverts their settings (2024.3.2).
- There is no native sunrise/sunset schedule; use Shortcuts automations instead.

### E12. Noir in-app Licenses page (2024 screenshot) [O]

Lists BetterSafariView, **Dark Reader (MIT)**, Dart Sass and tldts.

- **[I]** The page engine is most likely derived from Dark Reader's dynamic theme, which analyzes stylesheets and rewrites colors.
- **[I]** tldts provides the domain and subdomain handling.

### E13. Developer, App Store reply [O]

> If you enable advanced appearance options, you'll be able to disable dynamic colors, which causes text and links to always be in the exact color you specified in your theme.

### E14. Developer comments on settings scope [O]

> you can already customize Noir for each website, subdomain, or specific URL.

## Open unknowns (bounded searches that found nothing)

| ID | Unknown | How Nyx handles it |
| --- | --- | --- |
| U1 | The hex values of Noir's built-in themes. | Nyx ships its own palette. The editor themes use the public canonical colors of those color schemes. |
| U2 | The exact reset time of "Pause Until Tomorrow". | Nyx uses the next 06:00 that is at least an hour away. |
| U3 | The complete list of Shortcuts actions and Focus Filter parameters. | Nyx implements status, theme, website status, pause and resume. |
| U4 | The internal settings schema and native-messaging protocol. | Nyx defines its own. These are not interoperable surfaces, because Noir's settings live in its own sandbox. |
| U5 | The members of the "Moody" collection. | Nyx defines its own. |
