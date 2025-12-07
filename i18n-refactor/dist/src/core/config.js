"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    serviceTypeName: 'I18nLocaleService', // 服务类型名
    getLocalMethod: 'getLocale', // 词条根对象方法（与现有代码保持一致）
    fallbackServiceParamName: 'locale', // 服务参数名回退值
    tsGetHelperName: 'i18nGet', // TS 辅助渲染方法名
};
