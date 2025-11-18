export type Translations = {
  app: {
    title: string
    description: string
    switchToEn: string
    switchToZh: string
  }
  home: {
    welcome: string
  }
  list: {
    items: string[]
  }
  templates: {
    info: string
    itemTpl: string
  }
  user: {
    greetTpl: string
  }
}

export const en: Translations = {
  app: {
    title: 'Angular i18n (TS objects) demo',
    description: 'Translations are defined in TypeScript and referenced via objects.',
    switchToEn: 'Switch to English',
    switchToZh: '切换到中文'
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
}

export const zh: Translations = {
  app: {
    title: 'Angular 国际化（TS对象）示例',
    description: '词条采用 TypeScript 定义，使用处为对象引用。',
    switchToEn: '切换到英文',
    switchToZh: '切换到中文'
  },
  home: {
    welcome: '欢迎！'
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
}

// 分段包：用于演示 Object.assign 合并与覆盖
export const zhA: Partial<Translations> = {
  app: { title: '标题A', description: '描述A', switchToEn: '切到英文A', switchToZh: '切到中文A' },
  home: { welcome: '欢迎A！' },
  templates: { info: 'A：{name} 有 {count} 条通知。', itemTpl: 'A 索引 {index}：{value}' },
  list: { items: ['A1', 'A2'] }
}

export const zhB: Partial<Translations> = {
  app: { title: '标题B', description: '描述B' },
  home: { welcome: '欢迎B！' },
  templates: { info: 'B：{name} 有 {count} 条通知。' },
  list: { items: ['B1'] }
}

export const zhC: Partial<Translations> = {
  app: { title: '标题C' },
  home: { welcome: '欢迎C！' },
  list: { items: ['C1', 'C2', 'C3'] }
}

export const enA: Partial<Translations> = {
  app: { title: 'Title A', description: 'Desc A', switchToEn: 'Switch EN A', switchToZh: 'Switch ZH A' },
  home: { welcome: 'Welcome A!' },
  templates: { info: 'A: {name} has {count} notifications.', itemTpl: 'A Index {index}: {value}' },
  list: { items: ['A1', 'A2'] }
}

export const enB: Partial<Translations> = {
  app: { title: 'Title B', description: 'Desc B' },
  home: { welcome: 'Welcome B!' },
  templates: { info: 'B: {name} has {count} notifications.' },
  list: { items: ['B1'] }
}

export const enC: Partial<Translations> = {
  app: { title: 'Title C' },
  home: { welcome: 'Welcome C!' },
  list: { items: ['C1', 'C2', 'C3'] }
}

export let T: Translations = zh

function isPlainObject(val: any) {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

export function deepMerge<TBase extends object>(base: TBase, ...overrides: Partial<TBase>[]): TBase {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base }
  for (const ov of overrides) {
    if (!ov) continue
    for (const key of Object.keys(ov)) {
      const bv: any = (out as any)[key]
      const ovv: any = (ov as any)[key]
      if (isPlainObject(bv) && isPlainObject(ovv)) {
        ;(out as any)[key] = deepMerge(bv, ovv)
      } else {
        ;(out as any)[key] = Array.isArray(ovv) ? [...ovv] : ovv
      }
    }
  }
  return out as TBase
}

export function assignMerge<TBase extends object>(...objs: Partial<TBase>[]): TBase {
  const out: any = {}
  for (const o of objs) Object.assign(out, o || {})
  return out as TBase
}

export function setLang(code: 'en' | 'zh', ...overrides: Partial<Translations>[]) {
  const pack = code === 'en' ? en : zh
  T = deepMerge(pack, ...overrides)
}

export function replace(template: string, params: Record<string, string | number>) {
  let s = template
  for (const [k, v] of Object.entries(params)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  }
  return s
}