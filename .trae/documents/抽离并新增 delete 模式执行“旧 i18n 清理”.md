## 目标

* 将“删除旧的、无用的 i18n 代码”从默认流程中彻底抽离，仅在显式执行 `--mode=delete` 时才进行清理。

* 保持 `replace`/`restore`/`bootstrap` 行为不变（不做删除）。

* 在 `delete` 模式下也输出行级变更报告（文件、行号、原/新文本、原/新键、中/英文实际值）。

## 设计与改动点

* `i18n-refactor/src/runner/component.ts`：移除默认清理调用

  * 删除或禁用 `processComponent` 中对 `pruneUnused` 的调用（现有位置：i18n-refactor/src/runner/component.ts:331-333）。

  * `replace` 模式仅做语义替换与管道渲染，不做删除。

* `i18n-refactor/src/runner/run-dir.ts`：新增 `delete` 模式入口

  * 参数解析支持 `--mode=delete`（现解析处：i18n-refactor/src/runner/run-dir.ts:176-181）。

  * 当 `mode === 'delete'`：

    * 遍历 TS 文件，读取原文，调用 `pruneUnused(fileAst, code, [])` 执行删除（API 位于 i18n-refactor/src/replace/prune.ts:3）。

    * 写回文件（非 dry-run 时）并将差异纳入 `details` 输出，重用行级 diff 与键值计算逻辑（`diffLines`/`extractKeys`/`flattenLangFile` 已在 run-dir.ts 中）。

  * 其它模式维持原有流程。

* `README`：CLI 使用说明增加 `delete` 模式，强调该模式才会执行旧 i18n 清理。

## 报告输出（delete 模式）

* 与当前丰富报告一致：

  * `file`、`type: 'ts'`、`changes[]`：`line/before/after/beforeKey/afterKey/zhBefore/enBefore/zhAfter/enAfter`。

  * 键解析：

    * 旧键：从 `this.alias.getLocale().path`、`this.alias.path` 等形态提取；必要时用并集词典做最短候选匹配。

    * 新键：通常为空（纯删除），如变为 `this.i18n.get('...')` 则按新键显示。

## 安全与边界

* `pruneUnused` 当前删除策略：

  * 删除通过 `getLocale|getLocal` 赋值的别名属性与其赋值语句；

  * 避免误删 `constructor(public i18n: I18nLocaleService)`（这是构造参数属性，不是 `PropertyDeclaration`，不会被当前规则删除）。

* 若存在显式类字段 `i18n`，会被删除（`prune.ts:31-35`）；保留此行为以清理旧式定义，构造参数注入仍生效。

* `dryRun` 支持保留：`delete` 模式下也仅输出报告不落盘。

## 验证

* 单元测试：

  * 新增用例：`replace` 不删除；`delete` 删除别名字段与赋值。

  * 保持现有 `run-dir.spec.ts` 与 `prune.spec.ts` 通过。

* 本地验证：

  * `node dist/src/runner/run-dir.js --mode=delete`，检查 `details` 行级差异与中/英文值填充。

## 交付项

* 代码改动：`component.ts`、`run-dir.ts`；

* 文档改动：`README` CLI 模式说明。

## 下一步

* 确认后实施上述改动，更新构建并演示 `delete` 模式的报告输出。

