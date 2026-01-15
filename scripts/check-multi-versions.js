const { execSync } = require('child_process')

function collectDeps(node, map) {
  if (!node || !node.dependencies) return
  for (const [name, dep] of Object.entries(node.dependencies)) {
    if (dep && dep.version) {
      if (!map[name]) map[name] = new Set()
      map[name].add(dep.version)
    }
    collectDeps(dep, map)
  }
}

try {
  const output = execSync('npm ls --all --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const data = JSON.parse(output || '{}')
  const versionsMap = {}
  collectDeps(data, versionsMap)

  const multiVersionDeps = Object.entries(versionsMap)
    .filter(([, set]) => set.size > 1)
    .map(([name, set]) => ({ name, versions: Array.from(set).sort() }))

  if (multiVersionDeps.length > 0) {
    console.error('检测到以下依赖存在多个版本：')
    for (const dep of multiVersionDeps) {
      console.error(`- ${dep.name}: ${dep.versions.join(', ')}`)
    }
    process.exit(1)
  } else {
    console.log('依赖版本检查通过：未发现多版本冲突。')
  }
} catch (e) {
  console.error('运行 npm ls 失败：', e && e.message ? e.message : String(e))
  process.exit(1)
}

/**
 * 
 * 你现在扮演一名资深前端架构师，熟悉 npm 依赖、前端构建工具和运行时问题排查。

这是我项目运行 npm run deps:check-all 得到的 多版本依赖列表 ：

```
【在这里粘贴 check-multi-versions.js 的输出】
```
这是一个基于 Angular/TypeScript 的前端项目，使用 npm 作为包管理器。

你的任务： 从上面的多版本依赖中， 识别哪些包属于“高风险重复”，哪些属于“低风险可接受” ，并且给出简要理由。

请按照下面的判断规则来评估风险（非常重要，请严格遵守）：

1. 高风险（尽量只能有一个版本）——通常要重点治理
   
   - 前端框架和渲染核心：React / ReactDOM、Vue、Angular 核心（ @angular/core 、 @angular/router 、 @angular/forms 等）。
   - UI / 图表 / 地图等大型运行时库：如 echarts 、 highcharts 、 three 、 mapbox-gl 、各种 UI 组件库（antd / element / mui 等）。
   - 全局运行时 / polyfill / Zone：如 zone.js 、 core-js 、 regenerator-runtime 、各种修改全局对象或原生原型的 polyfill。
   - 全局状态管理 / 事件总线 / 单例服务：如果一个库通过单例或全局变量维护状态，多版本容易导致状态割裂。
   - 任何经常通过 peerDependencies 要求「必须共享同一个实例」的库（比如 React、某些路由/状态库等）。
   特征：
   
   - 往 window / global / 原生原型上挂东西；
   - 维护自己的全局上下文、组件树、响应式系统或全局配置；
   - 文档或社区 issue 中明确提到多版本或 peerDependency 冲突会导致运行时问题。
2. 中等风险（视实际情况而定）
   
   - 会参与构建流程输出到浏览器端的工具/运行时库，但不是框架/UI 栈核心。
   - 多版本可能不会立刻崩，但增加包体积或引入潜在不兼容。
3. 低风险（通常允许多版本存在，主要是体积问题）
   
   - 纯工具/函数库：如 lodash 、 dayjs 、 qs ，只提供纯函数、不改写全局。
   - 仅在 devDependencies 中使用、只在 Node.js 构建/测试阶段运行的工具链依赖：如 webpack 、 esbuild 、 rollup 、 jest 、 ts-jest 、 babel 系列、 chalk 、 yargs 等。
   - 尤其是只被 CLI/构建工具引用、不打包进浏览器的依赖。
请输出一个表格，字段包括：

- name : 包名
- versions : 出现的版本列表
- risk : high / medium / low
- reason : 一句话解释为什么是这个风险等级（结合上述规则，不要空泛描述）
要求：

- 必须覆盖输入中所有有多版本的依赖 ，不要漏掉。
- 根据你对这些包的常识、生态角色和典型用法来判断，不需要访问项目源码。
- 对于不确定的依赖，宁可偏保守：
  - 如果它看起来像框架/运行时/全局库，倾向标为 high ；
  - 如果它明显是构建工具内部的小依赖，倾向标为 low 。
最后，请单独列出一段「优先治理清单」，只包含 risk = high 的包名列表，按优先级（对前端运行时影响程度）从高到低排序。
 */