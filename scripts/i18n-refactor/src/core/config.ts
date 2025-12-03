export type Config = {
  serviceTypeName: string
  getLocalMethod: string
  fallbackServiceParamName: string
  tsGetHelperName: string
}

export const config: Config = {
  serviceTypeName: 'I18nLocaleService',
  getLocalMethod: 'getLocal',
  fallbackServiceParamName: 'locale',
  tsGetHelperName: 'i18nGet',
}
