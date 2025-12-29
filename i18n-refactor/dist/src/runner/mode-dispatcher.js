"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchMode = void 0;
const config_1 = require("../core/config");
const dict_process_mode_1 = require("./dict-process-mode");
const ngx_translate_injector_1 = require("./ngx-translate-injector");
const process_and_delete_mode_1 = require("./process-and-delete-mode");
function dispatchMode(mode) {
    switch (mode) {
        case 'replace':
        case 'delete':
            (0, process_and_delete_mode_1.processTsFilesAndHandle)(mode);
            break;
        case 'dict-process':
            (0, dict_process_mode_1.processDictFiles)(config_1.config.dictDir || 'src/app/i18n', (config_1.config.jsonOutDir || 'i18n-refactor/out'), (config_1.config.languages || ['zh', 'en']), (config_1.config.jsonArrayMode || 'nested'));
            break;
        case 'inject-i18n':
            (0, ngx_translate_injector_1.injectNgxTranslate)(config_1.config.dictDir || 'src/app/i18n');
            break;
        default:
            throw new Error(`Unknown mode: ${mode}`);
    }
}
exports.dispatchMode = dispatchMode;
