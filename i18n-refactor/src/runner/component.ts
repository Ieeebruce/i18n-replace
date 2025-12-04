import ts from 'typescript' // 引入 TypeScript AST 与类型
import { collectVarAliases } from '../core/var-alias' // 导入别名收集工具
import { extractReplaceParams } from '../core/params-extractor' // 导入 replace 参数抽取器
import { renderTsGet } from '../replace/ts-replace' // 导入 TS 调用渲染器
import { pruneUnused } from '../replace/prune' // 导入无用声明清理器
import { pickRoot } from '../util/dict-reader' // 导入字典根选择工具

function collectGetLocaleVars(code: string): string[] { // 收集通过 getLocale/getLocal 赋值的别名变量
  const names = new Set<string>() // 结果集合
  const reA = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocale\([^)]*\)/g // 匹配 getLocale 赋值
  const reB = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocal\([^)]*\)/g // 匹配 getLocal 赋值
  let m: RegExpExecArray | null // 临时匹配
  while ((m = reA.exec(code))) names.add(m[1]) // 记录变量名
  while ((m = reB.exec(code))) names.add(m[1]) // 记录变量名
  return Array.from(names) // 返回集合
}

type AliasInfo = { name: string; prefix: string | null; roots?: string[] } // 别名信息（名、前缀、合并来源）
function buildAliases(code: string): AliasInfo[] { // 从 TS 字符串中构建别名列表
  const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) // 解析源码
  const raw = collectVarAliases(sf, 'locale', 'getLocale') // 通过 AST 收集别名
  const out: AliasInfo[] = [] // 输出列表
  for (const a of raw) { // 转换结果结构
    out.push({ name: a.name, prefix: a.prefix, roots: a.roots }) // 推入别名
  }
  const rx = /\b([A-Za-z_]\w*)\s*=\s*this\.locale\.getLocale\s*\(/g // 直接赋值检测
  let m: RegExpExecArray | null // 匹配变量
  while ((m = rx.exec(code))) out.push({ name: m[1], prefix: null }) // 加入无前缀别名
  if (/\bi18n\s*:\s*/.test(code) || /this\.i18n\s*=/.test(code)) out.push({ name: 'i18n', prefix: null }) // 标记 i18n
  if (/\bdict\s*:\s*/.test(code) || /this\.dict\s*=/.test(code)) out.push({ name: 'dict', prefix: null }) // 标记 dict
  const rxAny = /this\.([A-Za-z_]\w*)\./g // 捕捉其它 this.<name>.
  let am: RegExpExecArray | null // 匹配循环
  while ((am = rxAny.exec(code))) {
    const nm = am[1] // 别名名
    if (nm !== 'locale') out.push({ name: nm, prefix: null }) // 排除 locale
  }
  // 去重：同名保留带前缀者
  const map = new Map<string, AliasInfo>() // 名称到别名映射
  for (const a of out) { // 遍历候选
    const prev = map.get(a.name) // 已有
    if (!prev || (a.prefix && !prev.prefix)) map.set(a.name, a) // 选择最佳
  }
  return Array.from(map.values()) // 返回列表
}

function replaceTs(src: string): string { // 将 TS 中的对象访问统一替换为 this.<alias>.get(...)
  let s = src // 工作副本
  const aliases = buildAliases(src) // 构建别名列表
  const composeKey = (ai: AliasInfo, path: string) => { // 组合最终 key（考虑前缀/根）
    if (ai.prefix) { // 前缀别名：this.<alias>=getLocale().x.y
      const rootFirst = ai.prefix.split('.')[0] // 前缀首段根
      if (path.startsWith(rootFirst + '.')) path = path.slice(rootFirst.length + 1) // 去重根段
      return `${ai.prefix}.${path}` // 拼接前缀
    }
    if (ai.roots && ai.roots.length) { // 合并来源别名：按 roots 选根
      const r = pickRoot(ai.roots, path) // 动态选根
      return r ? `${r}.${path}` : path // 命中则加根
    }
    if (ai.name === 'i18n') { // 普通 i18n 别名：尝试按常见根选择
      const seg0 = path.split('.')[0] // 首段
      const candidates = ['common', 'app', 'home'] // 候选根
      if (candidates.includes(seg0)) return path // 已含根则原样返回
      const r = pickRoot(candidates, path) // 动态选根
      return r ? `${r}.${path}` : path // 返回组合
    }
    return path // 无前缀与根：原样
  }
  for (const ai of aliases) { // 遍历别名进行替换
    const name = ai.name // 别名名
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)((?:\\.replace\\([^)]*\\))+)`, 'g'), (_m, path, chain) => { // 链式 replace
      const params = extractReplaceParams(chain) // 提取参数
      return renderTsGet(name, { keyExpr: composeKey(ai, String(path)), params }) // 渲染 get 调用
    })
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[\\s*'([^']+)'\\s*\\]`, 'g'), (_m, base, lit) => { // 索引字面量 '...'
      const path = `${String(base)}.${String(lit)}` // 拼接路径
      return renderTsGet(name, { keyExpr: composeKey(ai, path) }) // 渲染
    })
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[\\s*\"([^\"]+)\"\\s*\\]`, 'g'), (_m, base, lit) => { // 索引字面量 "..."
      const path = `${String(base)}.${String(lit)}` // 拼接路径
      return renderTsGet(name, { keyExpr: composeKey(ai, path) }) // 渲染
    })
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]`, 'g'), (_m, base, expr) => { // 动态索引 [expr]
      const basePath = composeKey(ai, String(base)) // 基路径
      return renderTsGet(name, { keyExpr: `'${basePath}.' + ${String(expr).trim()}` }) // 拼接表达式
    })
    s = s.replace(new RegExp(`this\\.${name}\\.(?!get\\b)([A-Za-z0-9_.]+)(?!\\s*\\(|\\s*\\.replace|\\s*\\[|\\s*=)`, 'g'), (_m, path) => { // 普通属性链
      return renderTsGet(name, { keyExpr: composeKey(ai, String(path)) }) // 渲染
    })
  }
  return s // 返回替换后的代码
}

function replaceHtml(src: string, aliases: AliasInfo[]): string { // 将模板插值统一替换为 i18n 管道
  let s = src // 工作副本
  const info = new Map<string, AliasInfo>() // 名称到别名信息
  for (const a of aliases) info.set(a.name, a) // 填充映射
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)((?:\.replace\([^)]*\))+)[^}]*\}\}/g, (_m, v, key, chain) => { // 链式 replace
    const ai = info.get(String(v)) // 获取别名信息
    if (!ai) return _m // 未识别则原样返回
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(key)) : '' // 选根
    const rootPrefix = rp ? rp + '.' : '' // 根前缀
    const params = extractReplaceParams(chain) // 参数对象
    const p = Object.keys(params).length ? `: ${JSON.stringify(params)}` : '' // 管道参数文本
    return `{{ '${rootPrefix}${key}' | i18n${p} }}` // 渲染管道
  })
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[(['"])([^'\"]+)\3\]\s*\}\}/g, (_m, v, base, _q, lit) => { // 索引字面量
    const ai = info.get(String(v)) // 别名信息
    if (!ai) return _m // 未识别返回
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(base)) : '' // 选根
    const rootPrefix = rp ? rp + '.' : '' // 根前缀
    return `{{ '${rootPrefix}${base}.${lit}' | i18n }}` // 渲染
  })
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[([^\]]+)\]\s*\}\}/g, (_m, v, base, expr) => { // 动态索引
    const ai = info.get(String(v)) // 别名信息
    if (!ai) return _m // 未识别返回
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(base)) : '' // 选根
    const rootPrefix = rp ? rp + '.' : '' // 根前缀
    return `{{ ('${rootPrefix}${base}.' + ${expr.trim()}) | i18n }}` // 渲染
  })
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\}\}/g, (_m, v, key) => { // 普通属性链
    const ai = info.get(String(v)) // 别名信息
    if (!ai) return _m // 未识别返回
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(key)) : '' // 选根
    const rootPrefix = rp ? rp + '.' : '' // 根前缀
    return `{{ '${rootPrefix}${key}' | i18n }}` // 渲染
  })
  return s // 返回替换后的模板
}

export function processComponent(tsCode: string, htmlCode: string): { tsOut: string, htmlOut: string } { // 编排组件：TS 与 HTML 一致替换
  const varNames = collectGetLocaleVars(tsCode) // 收集待清理别名
  let tsOut = replaceTs(tsCode) // 统一 TS 访问形态（在清理前以保留别名根信息）
  tsOut = pruneUnused({} as any, tsOut, varNames) // 清理无用赋值/声明
  tsOut = tsOut.replace(/this\.[A-Za-z_]\w*\s*=\s*[^;]*\.(?:getLocal|getLocale)\([^)]*\)(?:\.[A-Za-z0-9_.]+)?\s*;?/g, '') // 移除残留赋值
  // 统一别名 get 调用到 this.i18n.get(...)
  const aliasInfos = buildAliases(tsOut) // 再次构建别名以便统一
  for (const ai of aliasInfos) { // 遍历别名
    if (ai.name !== 'i18n') { // 非 i18n 别名统一指向 this.i18n
      tsOut = tsOut.replace(new RegExp(`this\\.${ai.name}\\\.get(?!Locale)\\s*\\(`, 'g'), 'this.i18n.get(') // 调用替换
      tsOut = tsOut.replace(new RegExp(`\\b${ai.name}\\s*:\\s*any\\s*;`, 'g'), '') // 移除残留声明
    }
  }
  // 规范化构造函数注入 I18nService
  tsOut = tsOut.replace(/constructor\s*\(([^)]*)\)/, (m, params) => { // 重写构造签名
    let p = params // 参数文本
    p = p.replace(/\b(private|public)?\s*locale\s*:\s*I18nLocaleService\b/, 'public i18n: I18nService') // 替换旧依赖
    if (!/I18nService\b/.test(p)) { // 若不存在则追加
      p = (p.trim().length ? p + ', ' : '') + 'public i18n: I18nService'
    }
    return `constructor(${p})` // 返回构造函数头
  })
  const htmlAliases = buildAliases(tsCode) // 基于原 TS 收集用于 HTML 的别名
  const htmlOut = replaceHtml(htmlCode, htmlAliases) // 替换模板
  return { tsOut, htmlOut } // 返回结果
}
