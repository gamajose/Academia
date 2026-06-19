#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../apps/mobile"
flutter pub get
flutter build apk --release

echo "APK gerado em apps/mobile/build/app/outputs/flutter-apk/app-release.apk"
