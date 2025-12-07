export type Config = { // 配置对象类型，定义脚本解析与渲染所需的标识符
  serviceTypeName: string
  getLocalMethod: string
  fallbackServiceParamName: string
  tsGetHelperName: string
  dictDir?: string
  languages?: string[]
  jsonOutDir?: string
  jsonArrayMode?: 'nested' | 'flat'
  ensureAngular?: 'report' | 'fix'
}

export const config: Config = { // 默认配置常量，供各模块使用
  serviceTypeName: 'I18nLocaleService', // 服务类型名
  getLocalMethod: 'getLocale', // 词条根对象方法（与现有代码保持一致）
  fallbackServiceParamName: 'locale', // 服务参数名回退值
  tsGetHelperName: 'i18nGet', // TS 辅助渲染方法名
  dictDir: 'src/app/i18n',
  languages: ['zh','en'],
  jsonOutDir: 'i18n-refactor/out',
  jsonArrayMode: 'nested',
  ensureAngular: 'fix'
}
