import * as fs from 'fs'
import * as path from 'path'

export type Config = { // 配置对象类型，定义脚本解析与渲染所需的标识符
  serviceTypeName: string
  serviceVariableName: string
  getLocalMethod: string
  dictDir?: string
  languages?: string[]
  jsonOutDir?: string
  jsonArrayMode?: 'nested' | 'flat'
  ensureAngular?: 'report' | 'fix'
  dir?: string
  dryRun?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  format?: 'json' | 'pretty' | 'html'
}

const defaults: Config = { // 默认配置常量，供各模块使用
  serviceTypeName: 'I18nLocaleService', // 服务类型名
  serviceVariableName: 'i18n', // 服务变量名
  getLocalMethod: 'getLocale', // 词条根对象方法（与现有代码保持一致）
  dictDir: 'src/app/i18n',
  languages: ['zh','en'],
  jsonOutDir: 'i18n-refactor/out',
  jsonArrayMode: 'nested',
  ensureAngular: 'fix',
  dir: process.cwd(),
  dryRun: false,
  logLevel: 'info',
  format: 'json'
}

function deepMerge<T extends Record<string, any>>(base: T, extra: Partial<T>): T { // 简单深合并（对象与数组覆盖）
  const out: any = { ...base }
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = deepMerge(out[k] || {}, v as any)
    else if (v !== undefined) out[k] = v
  }
  return out
}

export function loadConfig(): Config { // 从项目根读取 omrp.config.json 并与默认值合并
  try {
    const fp = path.join(process.cwd(), 'omrp.config.json')
    if (fs.existsSync(fp)) {
      const txt = fs.readFileSync(fp, 'utf8')
      const obj = JSON.parse(txt)
      return deepMerge(defaults, obj)
    }
  } catch {}
  return { ...defaults }
}

export const config: Config = loadConfig()
