import * as fs from 'fs'
import * as path from 'path'

// 配置对象类型，定义脚本解析与渲染所需的标识符
export type Config = {
  serviceTypeName: string
  serviceVariableName: string
  getLocalMethod: string
  dictDir?: string
  languages?: string[]
  jsonOutDir?: string
  jsonArrayMode?: 'nested' | 'flat'
  dir?: string
  dryRun?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  format?: 'json' | 'pretty' | 'html'
  port?: number
}

// 默认配置常量，供各模块使用
export const defaults: Config = {
  serviceTypeName: 'I18nLocaleService', // 服务类型名
  serviceVariableName: 'i18n', // 服务变量名
  getLocalMethod: 'getLocale', // 词条根对象方法（与现有代码保持一致）
  dictDir: 'src/app/i18n',
  languages: ['zh','en'],
  jsonOutDir: 'i18n-refactor/out',
  jsonArrayMode: 'nested',
  dir: process.cwd(),
  dryRun: false,
  logLevel: 'info',
  format: 'json',
  port: 3002
}

// 简单深合并（对象与数组覆盖）
export function deepMerge<T extends Record<string, any>>(base: T, extra: Partial<T>): T {
  const out: any = { ...base }
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(out[k] || {}, v as any)
    } else if (v !== undefined) {
      out[k] = v
    }
  }
  return out
}

// 从配置文件加载配置
export function loadConfigFromFile(configPath?: string): Partial<Config> {
  const defaultConfigPaths = [
    path.join(process.cwd(), 'omrp.config.json'),
    path.join(process.cwd(), 'i18n-refactor.config.json'),
    path.join(process.cwd(), '.i18n-refactor.json')
  ]

  const pathsToTry = configPath ? [configPath] : defaultConfigPaths

  for (const fp of pathsToTry) {
    try {
      if (fs.existsSync(fp)) {
        const txt = fs.readFileSync(fp, 'utf8')
        return JSON.parse(txt)
      }
    } catch (error) {
      console.warn(`Failed to load config from ${fp}:`, error)
    }
  }

  return {}
}

// 从环境变量加载配置
export function loadConfigFromEnv(): Partial<Config> {
  const envConfig: Partial<Config> = {}
  const prefix = 'I18N_REFACTOR_'

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && value !== undefined) {
      // 转换为驼峰命名
      const envKey = key.slice(prefix.length)
      const configKey = envKey.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase()) as keyof Config
      
      // 特殊处理不同类型的值
      if (value === 'true') {
        envConfig[configKey] = true as any
      } else if (value === 'false') {
        envConfig[configKey] = false as any
      } else if (!isNaN(Number(value))) {
        envConfig[configKey] = Number(value) as any
      } else if (configKey === 'languages') {
        envConfig[configKey] = value.split(',').map(lang => lang.trim()) as any
      } else {
        envConfig[configKey] = value as any
      }
    }
  }

  return envConfig
}

// 从命令行参数加载配置
export function loadConfigFromArgs(args: string[]): Partial<Config> {
  const argConfig: Partial<Config> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      
      if (key === 'dry-run') {
        argConfig.dryRun = true
      } else if (key === 'help' || key === 'version') {
        // These are handled separately in the CLI
        continue
      } else if (value !== undefined) {
        const configKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as keyof Config
        
        // 特殊处理不同类型的值
        if (value === 'true') {
          argConfig[configKey] = true as any
        } else if (value === 'false') {
          argConfig[configKey] = false as any
        } else if (!isNaN(Number(value))) {
          argConfig[configKey] = Number(value) as any
        } else if (configKey === 'languages') {
          argConfig[configKey] = value.split(',').map(lang => lang.trim()) as any
        } else {
          argConfig[configKey] = value as any
        }
      }
    }
  }

  return argConfig
}

// 主配置加载函数
export function loadConfig(args: string[] = process.argv.slice(2), configPath?: string): Config {
  const fileConfig = loadConfigFromFile(configPath)
  const envConfig = loadConfigFromEnv()
  const argConfig = loadConfigFromArgs(args)

  // 优先级：命令行参数 > 环境变量 > 配置文件 > 默认值
  return deepMerge(
    defaults,
    deepMerge(
      fileConfig,
      deepMerge(envConfig, argConfig)
    )
  )
}

// 导出默认配置实例
export const config: Config = loadConfig()
