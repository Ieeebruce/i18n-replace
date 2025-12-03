export type ReplaceParam = Record<string, string>

export function extractReplaceParams(chainText: string): ReplaceParam {
  const out: ReplaceParam = {}
  const re = /\.replace\(\s*["']\{([^}]+)\}["']\s*,\s*([^)]+)\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(chainText))) {
    out[m[1]] = m[2].trim()
  }
  return out
}
