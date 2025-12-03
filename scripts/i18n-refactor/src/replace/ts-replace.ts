import { KeyResolution } from '../core/key-resolver'

export function renderTsGet(aliasName: string, res: KeyResolution): string {
  const p = res.params && Object.keys(res.params).length ? `, ${JSON.stringify(res.params)}` : ''
  const k = (/^['"]/).test(res.keyExpr) || res.keyExpr.includes('+') ? res.keyExpr : `'${res.keyExpr}'`
  return `this.${aliasName}.get(${k}${p})`
}
