#!/usr/bin/env bash
# Build, sign and verify the test APK. Run from the repository root:
#   bash mobile/tools/package.sh
# Needs: the original APK, the Android build tools unpacked under _tools/, and
# the test signing key under _signing/ (see mobile/README.md).
set -euo pipefail

ORIGINAL="一起游.apk.1"
BT="_tools/build-tools/android-11"
KS="_signing/instrip-test.p12"
PASS="_signing/keystore-password.txt"
OUT="_build/instrip-2.7.0-newui-test.apk"
UNSIGNED="_build/instrip-unsigned.apk"

node mobile/tools/check.mjs
mkdir -p _build
rm -f "$UNSIGNED" "$OUT" "$OUT.idsig"

python -I mobile/tools/build_apk.py "$ORIGINAL" mobile/assets "$UNSIGNED"
"$BT/zipalign.exe" -c -p 4 "$UNSIGNED" > /dev/null

java -jar "$BT/lib/apksigner.jar" sign \
  --ks "$KS" --ks-type PKCS12 --ks-key-alias instrip --ks-pass "file:$PASS" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT" "$UNSIGNED"
rm -f "$UNSIGNED" "$OUT.idsig"

java -jar "$BT/lib/apksigner.jar" verify "$OUT" 2>&1 | grep -v '^WARNING: META-INF' || true
"$BT/zipalign.exe" -c -p 4 "$OUT" > /dev/null
echo "built $OUT ($(stat -c %s "$OUT") bytes)"
sha256sum "$OUT"
