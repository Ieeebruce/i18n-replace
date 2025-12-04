import { Pipe, PipeTransform } from '@angular/core'
import { I18nLocaleService } from './index'

@Pipe({ name: 'i18n', standalone: true })
export class I18nPipe implements PipeTransform {
  constructor(private locale: I18nLocaleService) {}
  transform(key: string, params?: Record<string, unknown>): string {
    return this.locale.get(key, params)
  }
}
