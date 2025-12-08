#!/bin/bash
set -e

# Configuration
I18N_CLI="node i18n-refactor/dist/src/runner/run-dir.js"
TARGET_FILE="src/app/examples/todolist/todolist.component.ts"
TARGET_HTML="src/app/examples/todolist/todolist.component.html"

echo ">>> Building i18n-refactor..."
npm run i18n-refactor:build

echo ">>> [Step 0] Prepare"
# delete src2, copy src to src2
rm -rf src2
cp -r src src2

echo ">>> [Step 1] Bootstrap..."

$I18N_CLI --mode=bootstrap

# Verify
if [ ! -f "src/app/i18n/index.ts" ]; then echo "❌ Service missing"; exit 1; fi
if [ ! -f "src/app/i18n/i18n.pipe.ts" ]; then echo "❌ Pipe missing"; exit 1; fi
if [ ! -f "src2/src/i18n/default/zh.json" ]; then echo "❌ JSON export missing"; exit 1; fi
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

# 替换完成后 启动src2

npm run start:src2

