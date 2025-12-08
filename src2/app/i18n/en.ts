export const en = {
  app: {
    title: 'Angular i18n (TS objects) demo',
    description: 'Translations are defined in TypeScript and referenced via objects.',
    switchToEn: 'Switch to English',
    switchToZh: '切换到中文',
    footer: 'Footer',
    header: 'App header override',
    onlyApp: 'Only in app',
    common: { desc: 'App overrides common description' },
    shared: { label: 'App label override' },
    settings: { theme: 'App theme' },
    user: { greetTpl: 'App hi, {name}!'},
    app: { desc: 'App description' }
  },
  common: {
    common: { title: 'Common title', desc: 'Common description' },
    header: 'Common header',
    footer: 'Common footer',
    onlyCommon: 'Only in common',
    shared: { label: 'Common label' },
    settings: { theme: 'Default theme' },
    user: { greetTpl: 'Hi, {name}!'}
  },
  home: {
    welcome: 'Welcome!'
  },
  list: {
    items: ['Item A', 'Item B', 'Item C']
  },
  templates: {
    info: 'Hello, {name}. You have {count} notifications.',
    itemTpl: 'Index {index}: {value}'
  },
  user: {
    greetTpl: 'Hi, {name}!'
  }
} as const
