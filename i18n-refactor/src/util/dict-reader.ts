import * as fs from 'fs' // 引入文件系统模块，用于读取字典文件
import * as path from 'path' // 引入路径模块，用于拼接与解析目录
import ts from 'typescript'
import { warn, debug } from './logger'
import { ParseError } from './errors'

type DictMap = Record<string, Set<string>> // 根名称到其包含键集合的映射

function tryPaths(): string[] { // 返回可用的字典目录候选列表
  const cwd = process.cwd() // 当前工作目录
  const here = __dirname // 当前文件所在目录
  if (dictDirOverride && fs.existsSync(dictDirOverride)) return [dictDirOverride] // 如有覆盖且存在则直接使用
  const candidates = [ // 备选目录集合
    path.join(cwd, 'src/app/i18n'), // 项目内默认目录
    path.join(cwd, 'srcbak/app/i18n'), // 备份目录
    path.resolve(here, '../../../src/app/i18n'), // 相对工具文件的上级默认目录
    path.resolve(here, '../../../srcbak/app/i18n') // 相对工具文件的上级备份目录
  ]
  return Array.from(new Set(candidates)).filter(p => fs.existsSync(p)) // 去重后过滤存在的目录
}

function flattenAstObject(obj: ts.ObjectLiteralExpression, base: string, out: Set<string>) {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const name = ts.isIdentifier(prop.name) ? prop.name.text : ts.isStringLiteral(prop.name) ? prop.name.text : ''
    if (!name) continue
    const next = base ? `${base}.${name}` : name
    if (prop.initializer && ts.isObjectLiteralExpression(prop.initializer)) {
      flattenAstObject(prop.initializer, next, out)
    } else {
      out.add(next)
    }
  }
}

function parseDictFile(fp: string): Record<string, Set<string>> {
  const text = fs.readFileSync(fp, 'utf8')
  const sf = ts.createSourceFile(fp, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const roots: Record<string, Set<string>> = {}
  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer) {
          let top: ts.ObjectLiteralExpression | null = null
          if (ts.isObjectLiteralExpression(decl.initializer)) top = decl.initializer
          else if (ts.isAsExpression(decl.initializer) && ts.isObjectLiteralExpression(decl.initializer.expression)) top = decl.initializer.expression
          if (!top) continue
          for (const prop of top.properties) {
            if (!ts.isPropertyAssignment(prop)) continue
            const rootName = ts.isIdentifier(prop.name) ? prop.name.text : ts.isStringLiteral(prop.name) ? prop.name.text : ''
            if (!rootName) continue
            const set = roots[rootName] || (roots[rootName] = new Set<string>())
            if (prop.initializer && ts.isObjectLiteralExpression(prop.initializer)) flattenAstObject(prop.initializer, '', set)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return roots
}

function flatten(root: string, obj: any, base: string, out: Set<string>) { // 展开对象树到键路径集合
  if (obj && typeof obj === 'object') { // 仅处理对象
    for (const k of Object.keys(obj)) { // 遍历子键
      const v = obj[k] // 子值
      const next = base ? `${base}.${k}` : k // 计算下一层路径
      if (v && typeof v === 'object' && !Array.isArray(v)) { // 子值仍为对象，递归展开
        flatten(root, v, next, out) // 递归
      } else { // 叶子节点（字符串/数组等）
        out.add(next) // 记录叶子路径
      }
    }
  }
}

function buildDictMap(): DictMap { // 构建根到键集合的映射
  const map: DictMap = {} // 初始化映射
  const dirs = tryPaths() // 获取候选目录
  for (const dir of dirs) { // 遍历目录
    for (const fname of ['zh.ts', 'en.ts']) { // 遍历语言文件
      const fp = path.join(dir, fname) // 组装文件路径
      if (!fs.existsSync(fp)) continue // 不存在则跳过
      try {
        const roots = parseDictFile(fp)
        for (const root of Object.keys(roots)) {
          const set = map[root] || (map[root] = new Set<string>())
          for (const k of roots[root]) set.add(k)
        }
        debug('dict parsed', { file: fp, roots: Object.keys(roots).length })
      } catch (e) {
        const err = new ParseError('dict parse failed', fp)
        warn(err.message, { file: fp })
      }
    }
  }
  return map // 返回结果
}

const cache: { map: DictMap | null, mock: DictMap | null } = { map: null, mock: null } // 简单缓存，避免重复解析字典

export function setMockDict(map: DictMap | null) {
  cache.mock = map
}

export function hasKey(root: string, pathInRoot: string): boolean { // 判断某根下是否存在给定路径
  if (cache.mock) {
    const set = cache.mock[root]
    return !!set && set.has(pathInRoot)
  }
  if (!cache.map) cache.map = buildDictMap() // 延迟构建映射
  const set = cache.map[root] // 取根集合
  return !!set && set.has(pathInRoot) // 返回存在性
}

export function getAllRoots(): string[] {
  if (cache.mock) return Object.keys(cache.mock)
  if (!cache.map) cache.map = buildDictMap()
  return Object.keys(cache.map)
}

export function pickRoot(roots: string[] | undefined, pathInRoot: string): string { // 在候选根中为给定路径选择最佳根
  if (!roots || !roots.length) return '' // 无候选则返回空
  for (let i = roots.length - 1; i >= 0; i--) { // 从右向左（覆盖顺序）检查
    const r = roots[i] // 当前根
    if (hasKey(r, pathInRoot)) return r // 命中则返回该根
  }
  return '' // 未命中则返回空，表示不加前缀
}
let dictDirOverride: string | null = null // 字典目录覆盖路径（可选）
export function setDictDir(dir?: string) { // 设置字典目录覆盖
  if (!dir || !dir.trim()) { dictDirOverride = null; return } // 空值则清除覆盖
  dictDirOverride = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir) // 绝对/相对路径处理
}
