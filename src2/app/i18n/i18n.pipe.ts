import { Pipe, PipeTransform } from '@angular/core'
import { I18nLocaleService } from './index'

@Pipe({
  name: 'i18n',
  standalone: true,
  pure: false
})
export class I18nPipe implements PipeTransform {
  constructor(private i18n: I18nLocaleService) {}
  transform(key: string, params?: Record<string, unknown>): string {
    return this.i18n.get(key, params)
  }
}
