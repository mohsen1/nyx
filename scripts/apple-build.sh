#!/bin/sh
# Build and sign the Safari container app locally.
#
#   scripts/apple-build.sh            # macOS, Release → apple/build/Nyx.app
#   scripts/apple-build.sh ios        # iOS device build (generic/platform=iOS)
#
# Needs your team ID in apple/Local.xcconfig (copy Local.xcconfig.example) and
# an Xcode account signed in for that team. Xcode registers the bundle IDs, App
# Group and iCloud capability on first build, and adds this Mac to the team's
# devices so the development profile lets it launch.
set -eu
cd "$(dirname "$0")/.."

if ! grep -Eq '^DEVELOPMENT_TEAM *= *[A-Z0-9]{10}' apple/Local.xcconfig 2>/dev/null; then
  echo "error: set DEVELOPMENT_TEAM in apple/Local.xcconfig (see apple/Local.xcconfig.example)" >&2
  exit 1
fi

platform="${1:-macos}"
case "$platform" in
  macos) scheme=Nyx-macOS; destination='platform=macOS' ;;
  ios) scheme=Nyx-iOS; destination='generic/platform=iOS' ;;
  *) echo "usage: $0 [macos|ios]" >&2; exit 2 ;;
esac

npm run build
(cd apple && xcodegen --quiet)

xcodebuild \
  -project apple/Nyx.xcodeproj \
  -scheme "$scheme" \
  -configuration Release \
  -destination "$destination" \
  -derivedDataPath apple/DerivedData \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  clean build

products="apple/DerivedData/Build/Products"
if [ "$platform" = macos ]; then
  mkdir -p apple/build
  rm -rf apple/build/Nyx.app
  cp -R "$products/Release/Nyx.app" apple/build/
  codesign --verify --deep --strict apple/build/Nyx.app
  echo "Signed: apple/build/Nyx.app"
else
  echo "Signed: $products/Release-iphoneos/Nyx.app"
fi
