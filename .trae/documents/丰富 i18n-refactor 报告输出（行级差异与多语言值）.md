## 目标

* 除了 `--mode=bootstrap` 外，所有运行参数从项目根 `omrp.config.json` 读取。

* 脚本实际执行路径复用 UT 使用的实现，删除重复/无用函数，保证 UT 通过且行为一致。

* 为涉及到的源码补充详细注释，解释意图、输入输出与边界行为。

## 变更范围

* `i18n-refactor/src/core/config.ts`

* `i18n-refactor/src/runner/run-dir.ts`

* `i18n-refactor/src/runner/component.ts`

* README 同步配置读取与参数说明

## 实施步骤

### 1) 固定根配置 omrp.config.json

* 在 `src/core/config.ts` 增加 `loadConfig()`：从 `process.cwd()/omrp.config.json` 读取并与默认值深合并；字段包含现有 `serviceTypeName/getLocalMethod/fallbackServiceParamName/tsGetHelperName/dictDir/languages/jsonOutDir/jsonArrayMode/ensureAngular/logLevel/format/dryRun/dir`。

* 导出已加载的 `config`，其它模块不再解析 `--config`；若配置缺失则使用默认值并记录告警。

* 注释：文件结构、默认值来源、错误处理策略。

### 2) 统一脚本与 UT 使用的实现

* 在 `src/runner/run-dir.ts`：

  * 参数解析仅保留 `--mode=replace|restore|bootstrap`；其它参数一律来自 `config`（满足“除了 bootstrap 参数外所有参数从配置文件拿”）。

  * 替换处理逻辑改为复用 `processComponent(tsCode, htmlCode)`（`src/runner/component.ts:234`）来生成 TS/HTML 输出；删除 `replaceTsContent`、`replaceHtmlContent` 等重复实现，仅保留 `restoreHtmlContent` 用于 `mode=restore`。

  * `processTsFile(tsPath)` 调整为：读取 TS 和关联 HTML（已有逻辑 `processTsFile` 提供 `htmlPath`），调用 `processComponent` 得到结果并写回；保持现有 UT 断言不变（`tests/runner/run-dir.spec.ts`）。

  * `bootstrap` 模式改为通过 `--mode=bootstrap` 触发（与 README 一致），调用现有 `ensureAngularFiles()` 与 `emitJson()`，其参数全部来自 `config`。

  * 注释：入口参数、文件遍历、与 UT 的实现复用关系、恢复模式的限制说明。

### 3) 保留/清理函数

* 删除未被调用的旧替换函数（`replaceTsContent`、`replaceHtmlContent`、`collectGetLocalVars` 等），避免双实现分歧。

* `restoreHtmlContent` 保留在 `run-dir.ts`，仅在 `mode=restore` 使用；在 `component.ts` 注明未覆盖恢复逻辑。

### 4) 详细注释补充

* 在上述 3 个文件中为导出函数、关键私有函数增加块级与行内注释，涵盖：

  * 目的与输入输出

  * 边界条件（别名检测、数组索引、链式 replace 收集）

  * 与配置的耦合点

  * 干运行与落盘行为

### 5) 文档同步

* README：

  * 新增“固定配置文件”章节，示例 `omrp.config.json` 字段。

  * 移除 `--dictDir/--logLevel/--format/--config` 等 CLI 说明，强调仅支持 `--mode` 切换，其他参数从配置读取。

  * 保留此前的 `bootstrap` 章节，补充“数组导出模式”与“ensureAngular”说明保持一致。

### 6) 验证

* 运行 UT：`npm run refactor:test`，确保全部通过。

* 手动验证：

  * 放置 `omrp.config.json`，执行：

    * `node i18n-refactor/dist/src/runner/run-dir.js --mode=bootstrap`

    * `node i18n-refactor/dist/src/runner/run-dir.js --mode=replace`

  * 检查 `i18n-refactor/out/*.json` 与应用可运行（`ng serve`）。

## 影响评估

* 向后兼容：删除 CLI 其他参数解析；若项目依赖这些参数，需要迁移到配置文件。

* 测试稳定性：脚本复用 UT 的实现路径，减少分歧，提升一致性。

## 请求确认

* 是否按上述方案推进（固定 `omrp.config.json`、脚本复用 UT 实现、仅保留 `--mode`）并同步更新 README？

