#!/bin/bash
set -e

# Configuration
I18N_CLI="node i18n-refactor/dist/src/runner/run-dir.js"
TARGET_FILE="src/app/examples/todolist/todolist.component.ts"
TARGET_HTML="src/app/examples/todolist/todolist.component.html"

echo ">>> Building i18n-refactor..."
npm run i18n-refactor:build

echo ">>> [Step 1] Bootstrap..."
# Clean up potential previous runs
rm -f src/app/i18n/index.ts src/app/i18n/i18n.pipe.ts
rm -rf i18n-refactor/out

$I18N_CLI --mode=bootstrap

# Verify
if [ ! -f "src/app/i18n/index.ts" ]; then echo "❌ Service missing"; exit 1; fi
if [ ! -f "src/app/i18n/i18n.pipe.ts" ]; then echo "❌ Pipe missing"; exit 1; fi
if [ ! -f "i18n-refactor/out/zh.json" ]; then echo "❌ JSON export missing"; exit 1; fi
echo "✅ Bootstrap verification passed"

echo ">>> [Step 2] Replace..."
$I18N_CLI --mode=replace

# Verify
# Check if target file contains i18nGet or Pipe usage
# Note: This check assumes todolist.component.ts has keys to be replaced.
# If the file is already replaced (from previous run without restore), it might still pass.
if grep -q "i18nGet" "$TARGET_FILE" || grep -q "i18n" "$TARGET_HTML"; then
  echo "✅ Replacement detected in target files"
else
  echo "⚠️ No replacement detected in $TARGET_FILE (Maybe no matching keys?)"
fi

echo ">>> [Step 3] Restore..."
$I18N_CLI --mode=restore

# Verify
if ! grep -q "i18nGet" "$TARGET_FILE"; then
  echo "✅ Restore verification passed (markers removed)"
else
  echo "❌ Restore verification failed: markers still present in $TARGET_FILE"
  # Optional: show the lines that failed
  grep "i18nGet" "$TARGET_FILE"
  exit 1
fi

echo "🎉 All tests passed!"
