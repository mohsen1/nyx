# Reverse engineering Noir

This folder records how Nyx was derived from Noir's observable behavior. It follows
the working method of [REA (Reverse Engineer Anything)](https://github.com/morluto/rea):

1. **Route the target first.** Pick the analysis that fits the artifact (see below).
2. **Keep an evidence ledger.** Every claim about Noir points to a source with an
   ID ([evidence.md](evidence.md)), and each source is marked as an observation
   or an inference.
3. **Turn claims into obligations.** Each behavior Nyx must reproduce is an
   obligation with an owner (the code that implements it) and a verifier (the
   test that proves it) ([obligations.md](obligations.md)).
4. **Separate observation from design.** Where the evidence stops, Nyx makes a
   design choice. Those choices are labeled as such, never presented as Noir's
   behavior.
5. **Close with a gap list.** Unknowns stay listed instead of being guessed away.

## What kind of target Noir is

Noir ships as an Apple app bundle that contains a Safari Web Extension
(`*.appex`). The bundle names come from the App Store lookup API (E1):

| Platform | App ID | Bundle ID |
| --- | --- | --- |
| iOS / iPadOS | 1581140954 | `nl.jeffreykuiken.NoirApp` |
| macOS | 1592917505 | `nl.jeffreykuiken.NoirApp.mac` |
| visionOS | 6477319451 | `nl.jeffreykuiken.NoirApp.vision` |

REA routes each part of such a target differently:

| Part | REA route |
| --- | --- |
| The `.ipa` or `.app` container | `open_binary`, then `project_apple_application_graph` to inventory bundles, `.appex` roles and resources |
| `Info.plist` / `NSExtension` declarations | `inspect_plist` |
| The extension's JavaScript (`Contents/Resources/*.js` in the `.appex`) | `analyze_javascript_application` (static module graph, feature tracing) |
| The Swift host app (native messaging, App Intents) | Native analysis through Hopper, Ghidra or IDA (`analyze_function`, strings, xrefs) |
| Runtime behavior on real pages | `capture_browser_scenario` / `list_browser_targets` against Safari or WebKit |

## What this reconstruction used, and what it did not

The reconstruction was built from **public, observable evidence only**:

- App Store metadata and the complete public version history (E1, E2)
- the getnoir.app website, including the theme import page's source (E3)
- reviews and screenshots of the app's UI (E4, E7–E9)
- the developer's public statements (E6, E10, E11, E14)
- black-box behavior that can be reproduced in any browser

**No Noir binary, JavaScript or asset was obtained, decompiled or copied.** No
lawful way to download App Store binaries existed in the build environment, and
a clean-room approach is the safer path for an open-source project anyway. Nyx's
engine, UI, icon and theme colors are original. Interoperability points such as
the theme link format are reproduced from their public description, because
compatibility needs them.

## Running the REA workflow against your own copy of Noir

If you own Noir on a Mac, you can check Nyx's compatibility claims against the
shipped extension with REA. This is static inspection of software you
installed. Respect the app's license terms.

```bash
# Inventory the bundle: extensions, resources, declared roles
npx -y rea-agents@latest inspect-artifact "/Applications/Noir.app" --json > noir-inventory.json

# Static module graph of the Safari Web Extension's JavaScript
APPEX="$(ls -d /Applications/Noir.app/Contents/PlugIns/*.appex | head -1)"
npx -y rea-agents@latest analyze-javascript-application "$APPEX/Contents/Resources" --json > noir-js.json
```

Then compare these against the obligations in [obligations.md](obligations.md):

- the manifest permissions
- the message types exchanged with the native host
- the storage keys
- the theme query parameters

Record each result as new evidence (E-numbered) together with its limitations.
