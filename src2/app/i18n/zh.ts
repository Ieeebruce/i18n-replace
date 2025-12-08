export const zh = {
  app: {
    title: 'Angular 国际化（TS对象）示例',
    description: '词条采用 TypeScript 定义，使用处为对象引用。',
    switchToEn: '切换到英文',
    switchToZh: '切换到中文',
    footer: '页脚',
    header: '应用头部覆盖',
    onlyApp: '仅应用',
    common: { desc: '应用覆盖的通用描述' },
    shared: { label: '应用标签覆盖' },
    settings: { theme: '应用主题' },
    user: { greetTpl: '应用你好，{name}!' },
    app: { desc: '应用描述' }
  },
  common: {
    common: { title: '通用标题', desc: '通用描述' },
    header: '通用头部',
    footer: '通用页脚',
    onlyCommon: '仅通用',
    shared: { label: '通用标签' },
    settings: { theme: '默认主题' },
    user: { greetTpl: '你好，{name}!'}
  },
  home: {
    welcome: '欢迎！',
    title: '首页'
  },
  list: {
    items: ['项目一', '项目二', '项目三']
  },
  templates: {
    info: '你好，{name}。你有 {count} 条通知。',
    itemTpl: '索引 {index}：{value}'
  },
  user: {
    greetTpl: '你好，{name}!'
  }
} as const
