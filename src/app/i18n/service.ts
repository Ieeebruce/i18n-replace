import { Injectable } from '@angular/core'
import { zhA, zhB, zhC, enA, enB, enC } from './index'

@Injectable({ providedIn: 'root' })
export class I18nService {
  lang: 'zh' | 'en' = 'zh'
  get zhA() { return zhA }
  get zhB() { return zhB }
  get zhC() { return zhC }
  get enA() { return enA }
  get enB() { return enB }
  get enC() { return enC }
  setLang(lang: 'zh' | 'en') { this.lang = lang }
}