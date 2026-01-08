#!/usr/bin/env node
import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'
import { config } from '../core/config'
import { configureLogger, info } from '../util/logger'
import { setDictDir } from '../util/dict-reader'
import { processComponent, ComplexCase } from './component'
import { ExternalAliasMap } from '../core/var-alias'
import { dispatchMode } from './mode-dispatcher'
export { ensureAngularFiles } from './ensure-angular-mode';

function readFile(p: string): string { return fs.readFileSync(p, 'utf8') } // 读取文本文件
let dryRun = !!config.dryRun // 干运行，从配置读取
function writeFile(p: string, s: string) { if (!dryRun) fs.writeFileSync(p, s, 'utf8') } // 写出文本文件（支持 dry-run）

export function processTsFile(tsPath: string, externalAliases?: ExternalAliasMap): { changed: boolean; code: string; aliases: string[]; htmlPath: string | null; complexCases: ComplexCase[] } {
  const before = readFile(tsPath)
  const sf = ts.createSourceFile(tsPath, before, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  // detect Angular Component and templateUrl
  let htmlPath: string | null = null
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node)) {
      const decos = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined
      for (const d of decos || []) {
        const expr = d.expression
        if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'Component') {
          const arg = expr.arguments[0]
          if (arg && ts.isObjectLiteralExpression(arg)) {
            for (const prop of arg.properties) {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'templateUrl') {
                const v = prop.initializer
                if (v && ts.isStringLiteral(v)) {
                  const dir = path.dirname(tsPath)
                  htmlPath = path.resolve(dir, v.text)
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const htmlBefore = htmlPath && fs.existsSync(htmlPath) ? readFile(htmlPath) : ''
  const { tsOut, htmlOut, aliases, complexCases: rawComplexCases } = processComponent(before, htmlBefore, tsPath, externalAliases)
  // 填充文件名
  const complexCases = rawComplexCases.map(c => ({ ...c, file: tsPath }))
  const changedTs = tsOut !== before
  const changedHtml = htmlPath ? (htmlOut !== htmlBefore) : false
  if (changedTs) writeFile(tsPath, tsOut)
  if (htmlPath && changedHtml) { writeFile(htmlPath, htmlOut) }
  (processTsFile as any)._last = { tsBefore: before, tsAfter: tsOut, htmlBefore, htmlAfter: htmlOut }
  return { changed: changedTs || changedHtml, code: tsOut, aliases, htmlPath, complexCases }
}

function main() {
  const args = process.argv.slice(2) // 读取参数
  let mode: 'replace' | 'delete' | 'dict-process' | 'inject-i18n' = 'replace'
  const usage = `Usage: i18n-refactor [--mode=replace|delete|dict-process|inject-i18n] [--help] [--version]`
  const version = '0.2.0'
  for (const a of args) { // 解析参数
    const r = a.match(/^--mode=(replace|delete|dict-process|inject-i18n)$/)
    if (r) mode = r[1] as any
    if (a === '--dry-run') dryRun = true
    if (a === '--help') { process.stdout.write(usage + '\n'); return }
    if (a === '--version') { process.stdout.write(version + '\n'); return }
  }
  dryRun = !!config.dryRun
  configureLogger({ level: config.logLevel, format: (config.format === 'json' || config.format === 'pretty' ? config.format : 'pretty') })
  setDictDir(config.dictDir || 'src/app/i18n')
  info('start', { dir: config.dir, mode, dryRun })

  // 分发模式处理
  dispatchMode(mode);
}

main()

