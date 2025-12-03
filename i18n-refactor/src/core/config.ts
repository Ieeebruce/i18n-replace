export type Config = { // 配置对象类型，定义脚本解析与渲染所需的标识符
  serviceTypeName: string // 注入服务的类型名（用于识别构造函数中的依赖）
  getLocalMethod: string // 获取词条根对象的方法名（如 getLocal）
  fallbackServiceParamName: string // 找不到服务参数名时的回退名称（如 locale）
  tsGetHelperName: string // TS 渲染辅助方法的名称（预留，用于生成调用）
}

export const config: Config = { // 默认配置常量，供各模块使用
  serviceTypeName: 'I18nLocaleService', // 服务类型名
  getLocalMethod: 'getLocal', // 词条根对象方法
  fallbackServiceParamName: 'locale', // 服务参数名回退值
  tsGetHelperName: 'i18nGet', // TS 辅助渲染方法名
}
