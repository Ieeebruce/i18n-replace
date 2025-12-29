import { config } from '../core/config';
import { processDictFiles } from './dict-process-mode';
import { injectNgxTranslate } from './ngx-translate-injector';
import { processTsFilesAndHandle } from './process-and-delete-mode';

export type Mode = 'replace' | 'delete' | 'dict-process' | 'inject-i18n';

export function dispatchMode(mode: Mode) {
  switch (mode) {
    case 'replace':
    case 'delete':
      processTsFilesAndHandle(mode);
      break;
    case 'dict-process':
      processDictFiles(
        config.dictDir || 'src/app/i18n', 
        (config.jsonOutDir || 'i18n-refactor/out'), 
        (config.languages || ['zh','en']), 
        (config.jsonArrayMode || 'nested')
      );
      break;
    case 'inject-i18n':
      injectNgxTranslate(
        config.dictDir || 'src/app/i18n'
      );
      break;
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}