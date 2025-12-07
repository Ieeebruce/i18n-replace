## 用户预期
- 工具执行后：词条 key 替换正确，项目可正常运行。
- 不影响现有功能；参数从配置文件读取；初始化（生成 Service/Pipe 与 JSON 导出）合并为一步。

## 子命令与流程
1) 初始化（bootstrap）
- 命令：`i18n-refactor bootstrap --config=./i18n.config.json`
- 行为（仅按配置）：
  - 生成缺失的 `src/app/i18n/index.ts` 与 `src/app/i18n/i18n.pipe.ts`（若已存在则跳过）
  - 在 root 组件（standalone）或 `app.module.ts`（module）全局导入一次 `I18nPipe`（`ensureAngular` 控制 report/fix）
  - 从 `dictDir` 扁平化导出 `languages` 的 JSON 到 `jsonOutDir`（数组按 `jsonArrayMode` 处理）

2) 替换（replace）
- 命令：`i18n-refactor replace --config=./i18n.config.json`
- 保持现有行为：别名识别、模板采集、键校验与日志；不改变已验证功能。

3) 可选：还原（restore）
- 命令：`i18n-refactor restore --config=./i18n.config.json`

## 配置文件（i18n.config.json）
- `dictDir`: `src/app/i18n`
- `languages`: `["zh","en"]`
- `jsonOutDir`: `i18n-refactor/out`（词条导出路径）
- `jsonArrayMode`: `nested` | `flat`（默认 `nested`）
- `ensureAngular`: `report` | `fix`（默认 `fix`）
- `serviceTypeName`: `I18nLocaleService`
- `getLocalMethod`: `getLocale`
- `fallbackServiceParamName`: `locale`

## 正确性与运行验证
- 引入自动验证子步骤，不影响功能：
  - 静态验证：在 `replace` 后执行 TypeScript 编译检查（tsc -p），确保替换结果无类型/语法错误。
  - 运行时自检（可选）：
    - 生成一个轻量页面或脚本，调用 `I18nLocaleService.get('known.key')` 与模板 `{{ 'known.key' | i18n }}`，断言返回的字符串非空。
    - 或调用已有 UT（`npm run refactor:test`）校验替换与管道渲染。
- 验证报告：总结替换的文件数、缺失键告警计数、JSON 导出语言与键数；出现错误时提示定位且不更改现有功能。

## 技术要点
- JSON 导出：
  - `nested`：数组保持为 JSON 数组；对象按层级导出。
  - `flat`：数组展开为 `path.index`；仅导出字符串叶子，保留占位符 `{name}`。
- Angular 注入：
  - 创建/跳过逻辑确保幂等；global 导入一次 Pipe 按项目结构自动检测（standalone vs module）。
- 保持现有替换器的所有能力与 CLI 兼容；新增 `bootstrap` 完全由配置驱动。

## 测试
- `bootstrap.spec`：验证生成/导入与 JSON 导出一体化；对 nested/flat 的数组处理断言。
- `replace` 既有测试维持通过；增加 `verify.spec` 进行编译与关键键跑通检查。

## 风险与回退
- 未能判断 root 组件/模块结构：输出修复建议，不强制修改。
- 字典解析异常或非常规表达式：跳过并告警；不影响替换与项目构建。