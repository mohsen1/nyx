#!/bin/sh
# Archive the Safari container app and upload it to App Store Connect.
#
#   scripts/apple-publish.sh            # macOS and iOS
#   scripts/apple-publish.sh macos      # one platform: macos | ios
#
# Uses the Xcode account for your team (Xcode → Settings → Accounts) to sign
# with an Apple Distribution certificate and upload; no API key needed. The
# app must already exist in App Store Connect with bundle ID
# app.nyx.NyxDarkMode. The build number is the current UTC time, so every
# upload is unique; bump MARKETING_VERSION in apple/project.yml for a new
# App Store version. After processing, pick the build in App Store Connect and
# submit it for review.
set -eu
cd "$(dirname "$0")/.."

team=$(sed -nE 's/^DEVELOPMENT_TEAM *= *([A-Z0-9]{10}).*/\1/p' apple/Local.xcconfig 2>/dev/null)
if [ -z "$team" ]; then
  echo "error: set DEVELOPMENT_TEAM in apple/Local.xcconfig (see apple/Local.xcconfig.example)" >&2
  exit 1
fi

case "${1:-all}" in
  all) platforms="macos ios" ;;
  macos | ios) platforms="$1" ;;
  *) echo "usage: $0 [all|macos|ios]" >&2; exit 2 ;;
esac

build=$(date -u +%y%m%d.%H%M)
out=apple/build/publish
rm -rf "$out"
mkdir -p "$out"
cat > "$out/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$team</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
EOF

npm run build
(cd apple && xcodegen --quiet)

for platform in $platforms; do
  case "$platform" in
    macos) scheme=Nyx-macOS; destination='generic/platform=macOS' ;;
    ios) scheme=Nyx-iOS; destination='generic/platform=iOS' ;;
  esac
  archive="$out/$scheme.xcarchive"
  echo "==> Archiving $scheme (build $build)"
  xcodebuild \
    -project apple/Nyx.xcodeproj \
    -scheme "$scheme" \
    -configuration Release \
    -destination "$destination" \
    -derivedDataPath apple/DerivedData \
    -archivePath "$archive" \
    -allowProvisioningUpdates \
    CURRENT_PROJECT_VERSION="$build" \
    clean archive
  echo "==> Uploading $scheme to App Store Connect"
  xcodebuild \
    -exportArchive \
    -archivePath "$archive" \
    -exportOptionsPlist "$out/ExportOptions.plist" \
    -exportPath "$out/$scheme" \
    -allowProvisioningUpdates
done

echo "Uploaded build $build. It appears in App Store Connect → TestFlight once processed."
