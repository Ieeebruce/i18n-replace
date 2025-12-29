# Variable Renamer Utility

基于AST的变量重命名工具函数，用于在TypeScript文件中重命名变量并替换所有引用。

## 功能特性

- 基于AST分析，精确识别变量引用
- 支持多种上下文中的变量重命名（属性、参数、声明等）
- 避免重命名字符串内容中的变量名
- 支持批量重命名多个变量
- 验证标识符有效性，防止使用保留字

## API

### `renameVariable(sourceCode, oldName, newName, isIdentifier?)`

重命名TypeScript源码中的单个变量。

**参数:**
- `sourceCode`: 源代码字符串
- `oldName`: 旧变量名
- `newName`: 新变量名
- `isIdentifier`: 是否仅重命名标识符（默认true，避免重命名字符串中的变量名）

**返回值:**
```ts
interface RenameResult {
  code: string;        // 重命名后的代码
  renamedCount: number; // 重命名的变量数量
  errors: string[];    // 错误信息数组
}
```

### `renameMultipleVariables(sourceCode, renames)`

重命名TypeScript源码中的多个变量。

**参数:**
- `sourceCode`: 源代码字符串
- `renames`: 重命名映射对象 { oldName: newName }

**返回值:**
```ts
interface RenameResult {
  code: string;        // 重命名后的代码
  renamedCount: number; // 重命名的变量总数
  errors: string[];    // 错误信息数组
}
```

## 使用示例

### 重命名单个变量

```ts
import { renameVariable } from './util/variable-renamer';

const sourceCode = `
  let oldName = 10;
  console.log(oldName);
  oldName = 20;
`;

const result = renameVariable(sourceCode, 'oldName', 'newName');
console.log(result.code);
// 输出:
// let newName = 10;
// console.log(newName);
// newName = 20;

console.log(result.renamedCount); // 3
```

### 重命名类属性

```ts
import { renameVariable } from './util/variable-renamer';

const sourceCode = `
  class MyClass {
    oldName: string = 'test';
    
    method() {
      return this.oldName;
    }
  }
`;

const result = renameVariable(sourceCode, 'oldName', 'newName');
// 重命名属性声明和this访问
```

### 批量重命名

```ts
import { renameMultipleVariables } from './util/variable-renamer';

const sourceCode = `
  let oldName1 = 10;
  let oldName2 = 20;
  console.log(oldName1, oldName2);
`;

const renames = {
  'oldName1': 'newName1',
  'oldName2': 'newName2'
};

const result = renameMultipleVariables(sourceCode, renames);
// 同时重命名多个变量
```

## 支持的上下文类型

工具支持在以下上下文中重命名变量：

- 变量声明 (`let`, `const`, `var`)
- 函数参数
- 类属性和方法
- 对象属性访问 (`obj.property`)
- 方法调用 (`obj.method()`)
- 解构赋值
- 类型引用
- 导入/导出说明符
- 以及更多AST节点类型

## 注意事项

- 工具会验证标识符的有效性，防止使用JavaScript/TypeScript保留字
- 默认情况下，工具仅重命名作为标识符的变量，避免重命名字符串、注释等内容
- 重命名操作是安全的，不会影响代码的其他部分
- 如果新旧名称相同，工具将不会进行任何更改