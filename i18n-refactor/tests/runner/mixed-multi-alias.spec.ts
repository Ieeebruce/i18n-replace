import { processComponent } from '../../src/runner/component';
import { setMockDict } from '../../src/util/dict-reader';

beforeAll(() => {
  setMockDict({
    'common': new Set(['common.desc', 'onlyCommon', 'common.title']),
    'app': new Set(['title', 'footer', 'header', 'description', 'onlyApp', 'user.greetTpl', 'app.desc']),
    'home': new Set(['welcome']),
  });
});

// 测试用例：在同一个组件中使用多个别名，但 dict 的合并顺序不同（app在前，common在后）
test('multiple aliases i18n/dict/L in one component', () => {
  // 定义模拟的 TypeScript 代码，dict 别名先合并 app，再合并 common
  const ts = `class C { i18n: any; dict: any; L: any; constructor(private locale: I18nLocaleService){ this.i18n = this.locale.getLocale(); this.dict = { ...this.locale.getLocale().app, ...this.locale.getLocale().common }; this.L = this.locale.getLocale() } run(){ console.log(this.i18n.app.title); console.log(this.dict.common.desc); console.log(this.L.app.footer) } }`;
  // 定义模拟的 HTML 模板
  const html = `<div>{{ i18n.app.title }}</div><div>{{ dict.common.desc }}</div><div>{{ L.app.footer }}</div>`;
  // 调用处理函数
  const out = processComponent(ts, html);
  // 验证 TS 输出，i18n 是 getLocale()，所以 i18n.app.title -> app.title
  expect(out.tsOut).toContain(`this.locale.get('app.title')`);
  // 验证 TS 输出，dict 是 {...app, ...common}，common 在后覆盖。common.desc 在 common 根下，所以是 common.common.desc
  // 注意：这里的 key 应该是 common.common.desc 还是 common.desc 取决于 dict-reader 的解析和 alias 的 root 集合
  expect(out.tsOut).toContain(`this.locale.get('common.common.desc')`);
  // 验证 TS 输出，L 是 getLocale()，所以 L.app.footer -> app.footer
  expect(out.tsOut).toContain(`this.locale.get('app.footer')`);
  // 验证 HTML 输出
  expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`);
  // 验证 HTML 输出
  expect(out.htmlOut).toContain(`{{ 'common.common.desc' | i18n }}`);
  // 验证 HTML 输出
  expect(out.htmlOut).toContain(`{{ 'app.footer' | i18n }}`);
});


test('multiple aliases i18n/dict/L in one component', () => {
  // 定义模拟的 TypeScript 代码
  const ts = `class C { i18n: any; dict: any; L: any; constructor(private locale: I18nLocaleService){ this.i18n = this.locale.getLocale(); this.dict = { ...this.locale.getLocale().app, ...this.locale.getLocale().common }; this.L = this.locale.getLocale() } run(){ console.log(this.i18n.app.title); console.log(this.dict.common.desc); console.log(this.L.app.footer) } }`;
  // 定义模拟的 HTML 模板
  const html = `<div>{{ i18n.app.title }}</div><div>{{ dict.common.desc }}</div><div>{{ L.app.footer }}</div>`;
  // 调用处理函数
  const out = processComponent(ts, html);
  // 验证 TS 输出
  expect(out.tsOut).toContain(`this.locale.get('app.title')`);
  // 验证 TS 输出
  expect(out.tsOut).toContain(`this.locale.get('common.common.desc')`);
  // 验证 TS 输出
  expect(out.tsOut).toContain(`this.locale.get('app.footer')`);
  // 验证 HTML 输出
  expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`);
  // 验证 HTML 输出
  expect(out.htmlOut).toContain(`{{ 'common.common.desc' | i18n }}`);
  // 验证 HTML 输出
  expect(out.htmlOut).toContain(`{{ 'app.footer' | i18n }}`);
});



test('multiple aliases i18n/dict/L in one component', () => {
  // 定义模拟的 TypeScript 代码
  const ts = `import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService, ZH } from '../../i18n'

@Component({
  selector: 'app-merge-assign',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './merge-assign.component.html',
  styleUrl: './merge-assign.component.scss'
})
export class MergeAssignComponent {
  dict: ZH;
  title: string;
  i18n: { welcome: "欢迎！"; title: "首页"; description: "词条采用 TypeScript 定义，使用处为对象引用。"; switchToEn: "切换到英文"; switchToZh: "切换到中文"; };
  title2: string;
  dictMerge: any;
  header: string;
  footer: string;
  onlyCommon: string;
  onlyApp: string;
  greet: string;
  constructor(public locale: I18nLocaleService) {
    this.dict = this.locale.getLocale();
    this.i18n = {...this.locale.getLocale().app, ...this.locale.getLocale().home}
    this.dictMerge = { ...this.locale.getLocale().common, ...this.locale.getLocale().app }
  }

  xx() {
    this.title = this.dict.app.description
    this.title2 = this.i18n.welcome
    this.header = this.dictMerge.header
    this.footer = this.dictMerge.footer
    this.onlyCommon = this.dictMerge.onlyCommon
    this.onlyApp = this.dictMerge.onlyApp
    this.greet = this.dictMerge.user.greetTpl.replace('{name}', '李雷')
  }

}`;
  // 定义模拟的 HTML 模板
  const html = `
  <section style="padding:1rem">
  <div style="display:flex; gap:0.5rem">
  </div>

  <h2>{{ dict.app.title }}</h2>
  <p>{{ dict.app.description }}</p>
  <p>{{ dict.home.welcome }}</p>

  <h3>模板替换</h3>
  <p>{{ dict.templates.info.replace('{name}', '张三').replace('{count}', '5') }}</p>
  <h3>数组词条</h3>
</section>
`;
  // 调用处理函数
  const out = processComponent(ts, html);
  // 验证 TS 输出
  expect(out.tsOut).toContain(`this.locale.get('home.welcome')`);
  // 验证 TS 输出
  expect(out.tsOut).toContain(`this.locale.get('app.onlyApp')`);
  // 验证 TS 输出
  expect(out.tsOut).toContain(`this.locale.get('app.description')`);
  // 验证 TS 输出
  expect(out.tsOut).toContain(`this.locale.get('app.header')`);
  // 验证 TS 输出
  expect(out.tsOut).toContain(`this.locale.get('app.footer')`);
  // 验证 TS 输出
  expect(out.tsOut).toContain(`this.locale.get('common.onlyCommon')`);
  // 验证 TS 输出，忽略空格差异
  // ignore character escaping differences
  expect(out.tsOut.replace(/\s/g, '')).toContain(`this.locale.get('app.user.greetTpl', {name:'李雷'})`.replace(/\s/g, ''));
});
