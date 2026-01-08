import { config } from '../core/config';
import { processDictFiles } from '../processor/dict-process-mode';
import { injectNgxTranslate } from '../processor/ngx-translate-injector';
import { processTsFilesAndHandle } from '../processor/process-and-delete-mode';
import { startUiServer } from '../server/ui-server';

export type Mode = 'replace' | 'delete' | 'dict-process' | 'inject-i18n' | 'ui';

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
    case 'ui':
      startUiServer(config.port || 3000); // Use configured port or default 3000
      break;
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}