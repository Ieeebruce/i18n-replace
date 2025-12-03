import * as fs from 'fs'
import * as path from 'path'

type DictMap = Record<string, Set<string>>

function tryPaths(): string[] {
  const cwd = process.cwd()
  const here = __dirname
  if (dictDirOverride && fs.existsSync(dictDirOverride)) return [dictDirOverride]
  const candidates = [
    path.join(cwd, 'src/app/i18n'),
    path.join(cwd, 'srcbak/app/i18n'),
    path.resolve(here, '../../../src/app/i18n'),
    path.resolve(here, '../../../srcbak/app/i18n')
  ]
  return Array.from(new Set(candidates)).filter(p => fs.existsSync(p))
}

function parseTsObject(fileContent: string): any {
  const s = fileContent
    .replace(/export\s+const\s+\w+\s*=\s*/, '')
    .replace(/as\s+const\s*;?\s*$/, '')
  try {
    // eslint-disable-next-line no-new-func
    return Function(`return (${s})`)()
  } catch {
    return null
  }
}

function flatten(root: string, obj: any, base: string, out: Set<string>) {
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      const next = base ? `${base}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        flatten(root, v, next, out)
      } else {
        out.add(next)
      }
    }
  }
}

function buildDictMap(): DictMap {
  const map: DictMap = {}
  const dirs = tryPaths()
  for (const dir of dirs) {
    for (const fname of ['zh.ts', 'en.ts']) {
      const fp = path.join(dir, fname)
      if (!fs.existsSync(fp)) continue
      const content = fs.readFileSync(fp, 'utf8')
      const obj = parseTsObject(content)
      if (!obj || typeof obj !== 'object') continue
      for (const root of Object.keys(obj)) {
        const set = map[root] || (map[root] = new Set<string>())
        flatten(root, obj[root], '', set)
      }
    }
  }
  return map
}

const cache: { map: DictMap | null } = { map: null }

export function hasKey(root: string, pathInRoot: string): boolean {
  if (!cache.map) cache.map = buildDictMap()
  const set = cache.map[root]
  return !!set && set.has(pathInRoot)
}

export function pickRoot(roots: string[] | undefined, pathInRoot: string): string {
  if (!roots || !roots.length) return ''
  for (let i = roots.length - 1; i >= 0; i--) {
    const r = roots[i]
    if (hasKey(r, pathInRoot)) return r
  }
  return roots[roots.length - 1]
}
let dictDirOverride: string | null = null
export function setDictDir(dir?: string) {
  if (!dir || !dir.trim()) { dictDirOverride = null; return }
  dictDirOverride = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir)
}
