
# 自动化注入策略优化方案：从局部到全局

在 Angular Standalone 组件架构下，我们可以通过更优雅的方式来减少每个组件的样板代码。以下是优化后的方案：

## 1. 为什么选择全局注入？

### 现状（局部注入）
每个组件都需要：
1.  手动导入 `I18nPipe` 到 `imports` 数组。
2.  在构造函数中注入 `public i18n: I18nLocaleService`。
3.  文件头部添加相应的 `import` 语句。

**缺点**：不仅增加了代码量，还提高了后续维护的复杂度。

### 优化（全局注入）
1.  **全局 Pipe**：虽然 Angular Standalone 默认鼓励显式导入，但我们可以通过建立一个共享的 `SharedModule` 或利用 Angular 19+ 的新特性（如 Host Directives，但这里最稳妥的是保持显式导入或使用 Base Class，**但考虑到项目现状，最实际的全局方案是：**）。
    *   **修正**：Angular Standalone 组件**必须**导入 Pipe 才能在模板中使用，**除非**我们通过全局配置（不推荐，因其破坏了 Tree Shaking）。
    *   **替代方案**：保持脚本自动导入 Pipe，因为这是 Standalone 的标准做法。**但是**，我们可以优化服务注入。

2.  **服务注入优化**：
    *   我们可以使用 `inject()` 函数（Angular 14+），这比构造函数注入更简洁。
    *   或者，我们可以创建一个 `BaseComponent`，但继承会引入耦合。
    *   **最佳实践**：保持构造函数注入或 `inject()`，但让脚本自动化完成。

**Wait, 用户 specifically asked "Can we do global injection?"**
在 Angular 中，**Pipe 必须在组件的 `imports` 中声明**（对于 Standalone 组件）。没有"全局注册 Pipe 让所有 Standalone 组件自动可用"的魔法，除非回到 NgModule。
但是，对于 **Service**，它已经是 `providedIn: 'root'`，所以它是全局单例。但组件仍需"注入"它才能使用。

**是否有"黑魔法"？**
有一种方法：**Mixin** 或 **Base Class**。
`export class BaseI18n { protected i18n = inject(I18nLocaleService); }`
然后组件 `extends BaseI18n`。
这减少了构造函数代码，但增加了继承关系。

**更彻底的思考**：
如果用户想要"全局"，可能是指不想在每个文件里写 `imports: [I18nPipe]`。
遗憾的是，Angular Standalone 的设计哲学就是显式依赖。
**但是**，我们可以让脚本做得更好：**保持自动化注入，但确保它无侵入且准确**。

**结论**：
Angular Standalone 机制决定了 Pipe 必须导入。服务必须注入。
我们无法真正"全局注入"到组件实例中而不修改组件代码。
**因此，我们的策略仍然是"自动化脚本修改组件"，但我们可以优化实现，使其更健壮。**

**不过，还有一个思路**：
如果我们将 `I18nPipe` 设为 default import 的一部分？
不，这改变不了 Angular 的编译规则。

**最终建议**：
坚持目前的**自动化注入**方案，因为这是符合 Angular Standalone 规范的唯一正途。
为了响应用户的"思考"，我将：
1.  解释为什么在 Standalone 模式下必须显式导入（为了 Tree Shaking 和明确依赖）。
2.  继续完善脚本，使其不仅能注入，还能处理 `inject()` 风格（如果项目较新）。
3.  但为了稳定性，目前保持构造函数注入是兼容性最好的。

## 实施计划

1.  **完善 Transformer**：
    *   增强 `ComponentInjectTransformer`，使其更智能地处理现有的构造函数。
    *   确保它能正确处理 `standalone: true` 的组件。
    *   添加对 `inject()` 函数的支持（可选，视项目 Angular 版本而定，当前项目看起来是标准的 class 风格）。

2.  **执行修复**：
    *   运行我们刚刚编写的 Transformer。
    *   它会自动遍历所有受影响的组件，添加 `imports: [I18nPipe]` 和 `public i18n: I18nLocaleService`。

3.  **验证**：
    *   运行 `npm start`，确认编译错误消失。
    *   确认页面功能正常。

此方案虽不是"魔法全局"，但它是"自动化全局处理"，达到了用户想要"不手动写代码"的目的。
