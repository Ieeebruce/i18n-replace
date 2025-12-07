# CLI 集成测试手册

## 目标
- 验证 `--dry-run --logLevel --format --config` 参数解析与输出。
- 覆盖别名合并、动态索引与对象字面量参数还原路径。

## 步骤
1. 生成一组示例组件（或选择现有示例），包含：
   - TS 中 `this.locale.getLocale().x.y`、索引访问与 `.replace()` 链；
   - HTML 中 `{{ i18n.a.b }}`、`{{ i18n.a['c'] }}`、`{{ i18n.a[idx] }}`、`{{ dict.title.replace('{who}', me) }}`。
2. 运行：
   ```
   node dist/runner/run-dir.js --dir=./src --mode=replace --dry-run --logLevel=info --format=pretty
   ```
   - 预期：stderr 中出现 `summary` 与 `result` 行；stdout 输出 `pretty` 格式摘要。
3. 配置加载：
   ```
   node dist/runner/run-dir.js --config=./i18n.config.json --dry-run
   ```
   - 预期：stderr 有 `config loaded` 日志；行为按配置变化（如方法名）。
4. 还原模式：
   ```
   node dist/runner/run-dir.js --mode=restore --dry-run
   ```
   - 预期：HTML 管道表达式还原为变量访问与 `.replace` 链；失败场景记录 `warn`。

> 注：若项目未提供编译产物，可使用 ts-node/tsx 运行 TS 文件，或先构建到 dist 后执行。

