import { KeyResolution } from '../core/key-resolver' // 引入键解析结果类型

export function renderTsGet(aliasName: string, res: KeyResolution): string { // 渲染 TS 中的 this.<alias>.get(key, params?)
  let p = ''
  if (res.params && Object.keys(res.params).length) {
    const props = Object.entries(res.params).map(([k, v]) => {
      const key = /^[a-zA-Z_$][\w$]*$/.test(k) ? k : `'${k}'`
      return `${key}:${v}`
    }).join(', ')
    p = `, {${props}}`
  }
  const k = (/^['"]/).test(res.keyExpr) || res.keyExpr.includes('+') ? res.keyExpr : `'${res.keyExpr}'` // 键表达式处理（字面量或拼接）
  return `this.${aliasName}.get(${k}${p})` // 生成最终调用字符串
}
