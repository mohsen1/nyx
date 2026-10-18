# Nyx for Safari (iOS, iPadOS, macOS)

Safari extensions ship inside an app. This folder contains that app:

- **`App/`:** a SwiftUI settings app. It sets the default status, schedule and theme, imports theme links (`nyx://theme?…`, or pasted Noir links), shows setup instructions, and offers "Stop Focus Filter".
- **`Extension/`:** `SafariWebExtensionHandler`, the native-messaging endpoint that the web extension uses to sync settings.
- **`Shared/`:**
  - `SettingsStore`: an App Group plus iCloud key-value store.
  - The theme model.
  - App Intents: Set Status, Set Default Theme, Set Website Status, Pause Until Tomorrow, Resume.
  - A Focus Filter.
- **`Widgets/`:** a Control Center / Lock Screen control (iOS 18+).

## Build

Requirements: Xcode 16+, [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`), and Node.js 20+.

```bash
npm install && npm run build      # builds dist/safari, which the extension target copies in
cd apple && xcodegen              # generates Nyx.xcodeproj
open Nyx.xcodeproj
```

Before running on a device:

1. Set your team: copy `Local.xcconfig.example` to `Local.xcconfig` (gitignored) and put your team ID in it. Every target picks it up through `Signing.xcconfig`.
2. If the bundle identifiers (`app.nyx.NyxDarkMode…`) are taken, change them, and change the App Group (`group.app.nyx.NyxDarkMode`) to match. The App Group appears in three places: `project.yml`, `Entitlements/*.entitlements` and `SettingsStore.swift`.
3. If you change the extension bundle ID, also update the identifier in `ContentView.swift` that opens Safari's extension settings.

Then run the `Nyx-macOS` or `Nyx-iOS` scheme and enable the extension:

- **macOS:** Safari → Settings → Extensions.
- **iOS:** Settings → Apps → Safari → Extensions.

To build and sign from the command line instead, run `npm run apple:mac` (writes `apple/build/Nyx.app`) or `npm run apple:ios`. The first build registers the bundle IDs, App Group and iCloud capability with your team.

For local development on macOS without a paid developer account, turn on Safari → Settings → Advanced → "Show features for web developers", then Develop → "Allow unsigned extensions".

CI compiles both apps with signing disabled (`.github/workflows/ci.yml`).
