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
- 仅支持 `--mode=replace|restore|bootstrap`：
  - `bootstrap`: 初始化环境（生成 Service/Pipe、全局导入）并导出 JSON。
  - `replace`: 执行代码替换。
  - `restore`: 还原代码。
- 其他参数均从固定配置文件读取，详见下文。

### 固定配置文件（项目根 `omrp.config.json`）
```
{
  "serviceTypeName": "I18nLocaleService",
  "getLocalMethod": "getLocale",
  "tsGetHelperName": "i18nGet",
  "dictDir": "src/app/i18n",
  "languages": ["zh", "en"],
  "jsonOutDir": "i18n-refactor/out",
  "jsonArrayMode": "nested",
  "ensureAngular": "fix",
  "dir": "src",
  "dryRun": false,
  "logLevel": "info",
  "format": "json"
}
```
- 字段说明：
  - 基本：`serviceTypeName`、`getLocalMethod`、`tsGetHelperName`。
  - 路径与导出：
   - `dictDir`: TS 字典源目录。
   - `languages`: 要处理的语言列表。
   - `jsonOutDir`: JSON 导出目录。
   - `jsonArrayMode`: 数组处理模式。
     - `"nested"`: 保持数组结构（默认）。
     - `"flat"`: 展开为对象（如 `list.0: "Item A"`）。
   - `ensureAngular`: Angular 环境修复策略。
     - `"fix"`: 自动创建缺失文件并导入（默认）。
     - `"report"`: 仅报告缺失。
  - 运行：
    - `dir`: 要处理的目录（如 `src`）。
    - `dryRun`: 是否干运行（不落盘）。
    - `logLevel`: 日志级别。
    - `format`: 输出格式。

#### 关于 `dryRun` 配置项

`dryRun`（干运行/试运行）是一个安全开关，用于在不实际修改文件的情况下预览脚本的执行结果。

### 删除逻辑说明

脚本包含两层删除/清理逻辑，旨在确保重构后的代码整洁无残留。

#### 1. 自动清理别名赋值 (Replace Mode)
在执行 `mode=replace` 时，脚本会自动识别并移除构造函数中用于初始化别名的赋值语句。
- **触发条件**：识别到形如 `this.L = this.locale.getLocale()` 或 `this.dict = ...` 的赋值语句，且该别名已被脚本识别并用于替换。
- **行为**：直接移除该赋值语句。
- **保护机制**：如果移除范围与其他替换操作重叠（冲突），则跳过移除，防止破坏代码结构。

#### 2. 清理无用声明 (Delete Mode)
通过 `mode=delete` 运行脚本，可执行更深度的清理，专门用于移除不再使用的属性声明。
- **命令**：`node i18n-refactor/dist/src/runner/run-dir.js --dir=src --mode=delete`
- **清理目标**：
  - 类属性声明（如 `L: any;`）。
  - 构造函数中的残留赋值语句（如 `this.L = ...`，如果 Replace 阶段未清理）。
- **判定规则**：
  - 属性名为配置的服务变量名（默认 `i18n`）且被重新声明。
  - 属性被识别为已清理的 Locale 别名（即该属性仅用于存储 `getLocale()` 结果，且无其他用途）。
- **建议**：建议在确认 `replace` 效果无误后，单独执行一次 `delete` 模式以完成最终清理。

**开启 (`true`) 与关闭 (`false`) 的区别：**

| 特性 | **开启 (`dryRun: true`)** | **关闭 (`dryRun: false`)** |
| :--- | :--- | :--- |
| **文件修改** | **不修改**任何源代码文件 (`.ts`, `.html`)。 | **直接修改**并覆盖源代码文件。 |
| **执行流程** | 完整执行扫描、分析、替换逻辑（在内存中进行）。 | 完整执行扫描、分析、替换逻辑。 |
| **日志输出** | 正常输出日志，显示“将会”发生的变更。 | 正常输出日志，显示实际发生的变更。 |
| **HTML 报告** | **正常生成**。您可以在报告中查看所有预期的变更详情。 | **正常生成**。报告记录了实际执行的变更详情。 |
| **适用场景** | **预览/检查**：想看脚本会改哪里，但不希望它真的动手时。 | **正式执行**：确认无误，准备应用代码重构时。 |

**总结**：建议您在初次运行或调整配置时，先开启 `dryRun: true`，查看生成的 `report.html` 确认变更符合预期，然后再将其改为 `false` 进行实际的批量替换。


### 字典目录约定
- 默认在项目根下查找 `src/app/i18n/zh.ts` 与 `src/app/i18n/en.ts`（也尝试 `srcbak/app/i18n`）。
- 解析采用 TypeScript AST，支持 `export const zh = { ... } as const` 的对象结构。
- 根选择规则：当别名声明有多个根来源（如 `{...app, ...common}`），对静态路径在候选根内右优先（后覆盖）查找，命中则加该根前缀。

### 工作原理（简述）
- TS：
  - 识别 `this.<alias> = this.<serviceParam>.getLocale()` 与已存在的 `this.i18n`/`this.dict` 别名；`<serviceParam>` 为构造函数中类型为 `I18nLocaleService` 的任意参数名（自动探测）。
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
