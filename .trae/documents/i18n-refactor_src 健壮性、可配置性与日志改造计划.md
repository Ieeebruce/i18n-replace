## 目标
- 提升脚本健壮性：消除脆弱解析与静默失败，提供明确错误与回退。
- 增强可配置性：用统一配置贯穿解析与渲染，兼容不同项目形态。
- 提高日志可读性：结构化日志与统计，方便定位问题与验证效果。

## 配置贯穿
- 建立配置单元：沿用 `core/config.ts:1–13`，新增加载器支持 `--config=path` 与默认值合并。
- 替换硬编码：将 `runner/run-dir.ts:111–114` 的 `collectVarAliases(sf, 'locale', 'getLocale')` 改为读取配置的 `serviceParamName/getLocalMethod`；同理更新 `collectGetLocalVars` 与正则匹配处。
- 统一服务类型与别名：在 `runner/component.ts:249–253` 注入构造参数时，使用配置的服务类型名与别名约定。

## 日志设施
- 新增 `util/logger.ts`：提供 `debug/info/warn/error`、模块/文件上下文、可配置 `--log-level` 与 `--format=json|pretty`。
- CLI 打点：
  - 总览：处理文件数、变更数、失败数（`runner/run-dir.ts:321–323`）。
  - TS/HTML 渲染：匹配/替换计数、回退次数（`runner/run-dir.ts:24–67,77–101`）。
  - 字典读入：成功语言/根数、失败文件（`util/dict-reader.ts:45–61`）。

## 错误模型
- 新增 `util/errors.ts`：定义 `ParseError/IOError/ValidationError/ConfigError`，含文件路径与位置上下文。
- 捕获与汇总：
  - 字典解析失败：记录 `ParseError` 并继续其他文件（`util/dict-reader.ts:19–29,45–61`）。
  - HTML 还原失败：当前 `Function(...)` 捕获后静默（`runner/run-dir.ts:81–89`），改为 `warn` 并保留原文。
  - CLI 退出码：存在 `error` → 非零，`--dry-run` 保持只读。

## 安全解析替换 `Function(...)`
- TS 字典对象：用 TypeScript AST 解析 `export const zh = { ... } as const`，递归提取字面量，替换 `util/dict-reader.ts:19–29` 的动态执行。
- HTML 参数对象：在 `runner/run-dir.ts:81–89` 使用同样的对象字面量解析器，支持简单双引号键与尾逗号。

## 模板使用采集
- 实现 `core/template-usage.ts:3–5`：
  - 识别 `{{ var.path }}`、`{{ var.base['lit'] }}`、`{{ var.base[idx] }}` 与链式 `.replace('{k}', expr)`。
  - 输出 `TemplateUse[]` 并驱动 `replace/html-replace.ts:3–6`。
- 用采集结果替代现有正则直改（`runner/run-dir.ts:24–67`），降低误匹配风险。

## 键校验与审计
- 在 TS/HTML 渲染前：
  - 静态键调用 `hasKey(root, path)` 校验（`util/dict-reader.ts:66–79`）。
  - 动态键记录 `dynamicSegments`（`core/key-resolver.ts:38–53,69`）到审计报告，列出比例与示例。
- 将无法解析/缺失键纳入 `results` 与汇总。

## 类型与导出统一
- 新增 `types.ts` 汇总公共类型：`VarAlias`（`core/var-alias.ts:3`）、`KeyResolution`（`core/key-resolver.ts:4`）、`TemplateUse`（`core/template-usage.ts:1`）、`AliasInfo`（上提自 `runner/component.ts:233–247`）、`DictMap`（导出自 `util/dict-reader.ts:4`）。
- 模块 `index.ts` 输出稳定 API，补充 JSDoc 注释。

## CLI 增强
- 参数：`--help`、`--version`、`--dry-run`、`--include/--exclude`、`--concurrency`、`--log-level`、`--format`、`--config`（`runner/run-dir.ts:298–309`）。
- 输出：`pretty` 人类可读与 `json` 机器可读两种；错误详情与文件级汇总。
- 并发：遍历与处理并发队列，限速与错误聚合。

## 清理与替换稳健性
- `replace/prune.ts:3–66`：增加更多判断，避免误删用户自有字段；为每次删除记录位置与代码片段到日志。
- `replace/ts-replace.ts:3–14`：键名加引号规则保持但对包含非法标识符的键更严格；参数对象渲染保证键稳定顺序。

## 测试与验证
- 单元测试：
  - 别名收集边界（构造赋值、展开合并）：`core/var-alias.ts:26–138`。
  - 键解析静态/动态与根选择：`core/key-resolver.ts:14–70`。
  - HTML 采集与渲染往返：`core/template-usage.ts` 与 `replace/html-replace.ts`。
  - 字典解析 AST 化：`util/dict-reader.ts`。
- 集成测试：CLI `--dry-run` 对比、错误码、输出格式。
- 基准：大目录场景的耗时与内存。

## 迁移策略
- 第一阶段：仅引入日志与错误模型、`--dry-run`，不改变行为。
- 第二阶段：切换到 AST 字典解析与模板采集，同时保留旧正则路径为回退。
- 第三阶段：移除动态执行与旧正则，强制配置贯穿，完善测试与文档。

## 风险控制
- 对字典解析与模板采集设回退策略；任何失败不写文件，日志提示并统计。
- 保持默认配置与现有硬编码一致，逐步切换至配置读取。
