"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
test('multiple aliases i18n/dict/L in one component', () => {
    const ts = `class C { i18n: any; dict: any; L: any; constructor(private locale: I18nLocaleService){ this.i18n = this.locale.getLocale(); this.dict = { ...this.locale.getLocale().common, ...this.locale.getLocale().app }; this.L = this.locale.getLocale() } run(){ console.log(this.i18n.app.title); console.log(this.dict.common.desc); console.log(this.L.app.footer) } }`;
    const html = `<div>{{ i18n.app.title }}</div><div>{{ dict.common.desc }}</div><div>{{ L.app.footer }}</div>`;
    const out = (0, component_1.processComponent)(ts, html);
    expect(out.tsOut).toContain(`this.i18n.get('app.title')`);
    expect(out.tsOut).toContain(`this.i18n.get('app.common.desc')`);
    expect(out.tsOut).toContain(`this.i18n.get('app.footer')`);
    expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`);
    expect(out.htmlOut).toContain(`{{ 'app.common.desc' | i18n }}`);
    expect(out.htmlOut).toContain(`{{ 'app.footer' | i18n }}`);
});
test('multiple aliases i18n/dict/L in one component', () => {
    const ts = `class C { i18n: any; dict: any; L: any; constructor(private locale: I18nLocaleService){ this.i18n = this.locale.getLocale(); this.dict = { ...this.locale.getLocale().app, ...this.locale.getLocale().common }; this.L = this.locale.getLocale() } run(){ console.log(this.i18n.app.title); console.log(this.dict.common.desc); console.log(this.L.app.footer) } }`;
    const html = `<div>{{ i18n.app.title }}</div><div>{{ dict.common.desc }}</div><div>{{ L.app.footer }}</div>`;
    const out = (0, component_1.processComponent)(ts, html);
    expect(out.tsOut).toContain(`this.i18n.get('app.title')`);
    expect(out.tsOut).toContain(`this.i18n.get('common.common.desc')`);
    expect(out.tsOut).toContain(`this.i18n.get('app.footer')`);
    expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`);
    expect(out.htmlOut).toContain(`{{ 'common.common.desc' | i18n }}`);
    expect(out.htmlOut).toContain(`{{ 'app.footer' | i18n }}`);
});
test('multiple aliases i18n/dict/L in one component', () => {
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
    const out = (0, component_1.processComponent)(ts, html);
    expect(out.tsOut).toContain(`this.i18n.get('home.welcome')`);
    expect(out.tsOut).toContain(`this.i18n.get('app.onlyApp')`);
});
