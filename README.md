# I18nDemo

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.3.8.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

## i18n-refactor 使用教程

- 目标：自动把 TS/HTML 中的词条访问统一为 `this.i18n.get('key', params)` 与 `{{ 'key' | i18n: params }}`，支持别名识别、根前缀选择与参数还原。
- 适用：Angular 组件内通过 `this.locale.getLocale()` 或已有 `this.i18n`/`this.dict` 等别名访问词条的代码与模板。

### 构建与运行
- 构建：`npm run i18n-refactor:build`

#### 1. 准备环境（Bootstrap）
- 目标：生成 `I18nLocaleService` 与 `I18nPipe`，并在 `app.component.ts` 全局导入 Pipe；同时将 TS 字典导出为 JSON 文件。
- 命令：
  - `node i18n-refactor/dist/src/runner/run-dir.js --mode=bootstrap`
- 效果：
  - 自动创建 `src/app/i18n/index.ts` (Service) 和 `src/app/i18n/i18n.pipe.ts` (Pipe)。
  - 自动修改 `src/app/app.component.ts` 导入 `I18nPipe`。
  - 将 `src/app/i18n/*.ts` 导出为 JSON 到 `i18n-refactor/out/`（路径可配置）。

#### 2. 执行替换（Replace）
- 快速替换（干运行）：
  - `node i18n-refactor/dist/src/runner/run-dir.js --dir=src --mode=replace --dry-run --logLevel=info --format=pretty`
  - 干运行不会写文件，只打印摘要与每个文件的变更情况。
- 应用替换（落盘）：
  - `node i18n-refactor/dist/src/runner/run-dir.js --dir=src --mode=replace`
- 还原模板管道（将模板中的管道表达式还原为变量访问与 .replace 链）：
  - `node i18n-refactor/dist/src/runner/run-dir.js --dir=src --mode=restore`

### 命令参数
- `--dir=PATH`：要处理的目录（默认当前工作目录）。
- `--mode=replace|restore|bootstrap`：
  - `bootstrap`: 初始化环境（生成 Service/Pipe、全局导入）并导出 JSON。
  - `replace`: 执行代码替换（默认）。
  - `restore`: 还原代码。
- `--dictDir=PATH`：指定字典目录（覆盖自动探测）。默认会尝试：`src/app/i18n`、`srcbak/app/i18n`。
- `--dry-run`：干运行，只输出不写文件。
- `--logLevel=debug|info|warn|error`：日志级别（默认 `info`）。
- `--format=json|pretty`：输出格式（默认 `json`）。
- `--config=PATH`：加载外部配置 JSON 覆盖默认行为（示例见下）。
- `--help`、`--version`：显示帮助与版本。

### 外部配置示例（`i18n.config.json`）
```
{
  "serviceTypeName": "I18nLocaleService",
  "getLocalMethod": "getLocale",
  "fallbackServiceParamName": "locale",
  "tsGetHelperName": "i18nGet",
  "dictDir": "src/app/i18n",
  "languages": ["zh", "en"],
  "jsonOutDir": "i18n-refactor/out",
  "jsonArrayMode": "nested",
  "ensureAngular": "fix"
}
```
- 基本配置：
  - `serviceTypeName` 等：与默认配置一致时可省略。
- 路径与导出配置：
  - `dictDir`: TS 字典源目录。
  - `languages`: 要处理的语言列表。
  - `jsonOutDir`: JSON 导出目录。
  - `jsonArrayMode`: 数组处理模式。
    - `"nested"`: 保持数组结构（默认）。
    - `"flat"`: 展开为对象（如 `list.0: "Item A"`）。
  - `ensureAngular`: Angular 环境修复策略。
    - `"fix"`: 自动创建缺失文件并导入（默认）。
    - `"report"`: 仅报告缺失。

### 字典目录约定
- 默认在项目根下查找 `src/app/i18n/zh.ts` 与 `src/app/i18n/en.ts`（也尝试 `srcbak/app/i18n`）。
- 解析采用 TypeScript AST，支持 `export const zh = { ... } as const` 的对象结构。
- 根选择规则：当别名声明有多个根来源（如 `{...app, ...common}`），对静态路径在候选根内右优先（后覆盖）查找，命中则加该根前缀。

### 工作原理（简述）
- TS：
  - 识别 `this.<alias> = this.locale.getLocale()` 与已存在的 `this.i18n`/`this.dict` 别名。
  - 将 `this.<alias>.<path>`、索引访问与链式 `.replace('{k}', expr)` 统一替换为 `this.i18n.get('key', params)`。
  - 在静态键替换时校验键是否存在于字典，缺失会记录告警，不阻断流程。
  - 清理与规范：统一构造函数注入 `public i18n: I18nLocaleService`，归一化 `get` 调用。
- HTML：
  - 通过模板采集器定位 `{{ var.path }}`、索引访问与 `.replace` 链，按位置生成 `{{ 'key' | i18n: params }}`，动态索引会生成 `{{ ('base.' + idx) | i18n }}`。
  - 还原模式会把管道表达式还原为变量访问与 `.replace` 链。

### 常见场景示例
- TS 属性链：
  - 输入：`this.dict.common.desc`
  - 输出：`this.i18n.get('common.desc')`
- TS 链式 replace：
  - 输入：`this.dict.user.greetTpl.replace('{name}', who)`
  - 输出：`this.i18n.get('user.greetTpl', {name: who})`
- HTML 索引字面量：
  - 输入：`{{ i18n.list.items['0'] }}`
  - 输出：`{{ 'list.items.0' | i18n }}`
- HTML 动态索引：
  - 输入：`{{ i18n.templates.itemTpl[idx] }}`
  - 输出：`{{ ('templates.itemTpl.' + idx) | i18n }}`

### 验证与测试
- 运行脚本的单元测试：`npm run refactor:test`
- CLI 集成测试手册：见 `i18n-refactor/tests/run-cli.spec.md`（包含使用步骤与预期输出）。

### 注意事项
- AST 解析对象字面量支持常见子集；如使用更复杂表达式，可能需要在字典文件中保持字面量结构。
- 模板语法覆盖常见插值形态；复杂或自定义管道组合的场景建议先 `--dry-run` 验证。
- 静态键缺失不会阻断替换，但会记录告警并在摘要中统计。
