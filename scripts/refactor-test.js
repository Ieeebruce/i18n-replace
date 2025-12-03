const fs = require('fs')
const path = require('path')

function copyDir(src, dest) {
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const e of entries) {
    const sp = path.join(src, e.name)
    const dp = path.join(dest, e.name)
    if (e.isDirectory()) copyDir(sp, dp)
    else fs.copyFileSync(sp, dp)
  }
}

function run() {
  const root = process.cwd()
  const src = path.join(root, 'src')
  const dest = path.join(root, 'src-refactor-test')
  copyDir(src, dest)
  const cmd = `node scripts/replace-i18n-ast.js --dir=${path.relative(root, dest)}`
  const { execSync } = require('child_process')
  const out = execSync(cmd, { cwd: root, stdio: 'pipe' }).toString()
  process.stdout.write(out)
}

run()
