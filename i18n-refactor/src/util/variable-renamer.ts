import ts from 'typescript';

/**
 * 变量重命名工具函数
 * 基于AST分析，查找并重命名指定变量的所有引用
 */
export interface RenameResult {
  code: string;
  renamedCount: number;
  errors: string[];
}

/**
 * 重命名TypeScript源码中的变量
 * @param sourceCode - 源代码
 * @param oldName - 旧变量名
 * @param newName - 新变量名
 * @param isIdentifier - 是否仅重命名标识符（默认true，避免重命名字符串中的变量名）
 * @returns 重命名结果
 */
export function renameVariable(
  sourceCode: string, 
  oldName: string, 
  newName: string, 
  isIdentifier: boolean = true
): RenameResult {
  // 创建源文件AST
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const errors: string[] = [];
  const renameRanges: Array<{ start: number; end: number; text: string }> = [];
  let renamedCount = 0;

  // 验证变量名格式
  if (!isValidIdentifier(oldName) || !isValidIdentifier(newName)) {
    errors.push(`Invalid identifier: oldName='${oldName}', newName='${newName}'`);
    return { code: sourceCode, renamedCount: 0, errors };
  }

  if (oldName === newName) {
    return { code: sourceCode, renamedCount: 0, errors };
  }

  // 遍历AST寻找需要重命名的节点
  const visit = (node: ts.Node): void => {
    // 检查是否为需要重命名的标识符
    if (ts.isIdentifier(node)) {
      if (isIdentifier) {
        // 仅重命合作为标识符的变量（避免重命名字符串中的变量名）
        if (node.text === oldName && isIdentifierInValidContext(node, sourceFile)) {
          // 检查是否是完整单词（避免重命名较长标识符的一部分）
          const start = node.getStart(sourceFile);
          const end = node.getEnd();
          
          // 检查前后字符是否为标识符字符，以避免部分重命名
          const fullText = sourceFile.getFullText();
          const beforeChar = start > 0 ? fullText.charAt(start - 1) : ' ';
          const afterChar = end < fullText.length ? fullText.charAt(end) : ' ';
          
          // 只有当前后都不是标识符字符时才重命名（确保是完整的标识符）
          if (!isIdentifierChar(beforeChar) && !isIdentifierChar(afterChar)) {
            renameRanges.push({ start, end, text: newName });
            renamedCount++;
          }
        }
      } else {
        // 重命名所有匹配的文本
        if (node.text === oldName) {
          const start = node.getStart(sourceFile);
          const end = node.getEnd();
          renameRanges.push({ start, end, text: newName });
          renamedCount++;
        }
      }
    }

    // 继续遍历子节点
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  // 按位置从后往前排序，避免替换时位置偏移
  renameRanges.sort((a, b) => b.start - a.start);

  // 执行替换
  let result = sourceCode;
  for (const range of renameRanges) {
    result = result.slice(0, range.start) + range.text + result.slice(range.end);
  }

  return { code: result, renamedCount, errors };
}

/**
 * 检查标识符是否在有效上下文中（避免重命名单独的标识符，如字符串、注释等）
 * @param identifier - 标识符节点
 * @param sourceFile - 源文件
 * @returns 是否在有效上下文中
 */
function isIdentifierInValidContext(identifier: ts.Identifier, sourceFile: ts.SourceFile): boolean {
  const parent = identifier.parent;
  
  // 检查父节点类型，确定是否为有效的标识符使用上下文
  if (
    ts.isPropertyAccessExpression(parent) && 
    parent.name === identifier
  ) {
    // this.oldName 形式，name是属性名
    return true;
  }
  
  if (
    ts.isPropertyAccessExpression(parent) && 
    parent.expression === identifier
  ) {
    // oldName.property 形式，expression是对象名
    return true;
  }
  
  if (ts.isVariableDeclaration(parent) && parent.name === identifier) {
    // 变量声明左侧的标识符
    return true;
  }
  
  if (ts.isBindingElement(parent) && parent.name === identifier) {
    // 解构赋值中的标识符
    return true;
  }
  
  if (ts.isParameter(parent) && parent.name === identifier) {
    // 函数参数中的标识符
    return true;
  }
  
  if (ts.isPropertyDeclaration(parent) && parent.name === identifier) {
    // 属性声明中的标识符
    return true;
  }
  
  if (ts.isPropertySignature(parent) && parent.name === identifier) {
    // 属性签名中的标识符
    return true;
  }
  
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === identifier) {
    // 简写属性赋值中的标识符
    return true;
  }
  
  if (ts.isFunctionDeclaration(parent) && parent.name === identifier) {
    // 函数声明中的标识符
    return true;
  }
  
  if (ts.isClassDeclaration(parent) && parent.name === identifier) {
    // 类声明中的标识符
    return true;
  }
  
  if (ts.isTypeAliasDeclaration(parent) && parent.name === identifier) {
    // 类型别名声明中的标识符
    return true;
  }
  
  if (ts.isEnumDeclaration(parent) && parent.name === identifier) {
    // 枚举声明中的标识符
    return true;
  }
  
  if (ts.isInterfaceDeclaration(parent) && parent.name === identifier) {
    // 接口声明中的标识符
    return true;
  }
  
  if (ts.isModuleDeclaration(parent) && parent.name === identifier) {
    // 模块声明中的标识符
    return true;
  }
  
  if (ts.isImportSpecifier(parent) && parent.name === identifier) {
    // 导入说明符中的标识符
    return true;
  }
  
  // 检查导入说明符中的原始名称 (import { originalName as newName })
  if (ts.isImportSpecifier(parent) && parent.propertyName && parent.propertyName === identifier) {
    // 当标识符是导入的原始名称时，也应该重命名
    return true;
  }
  
  if (ts.isImportClause(parent) && parent.name === identifier) {
    // 导入子句中的标识符
    return true;
  }
  
  if (ts.isNamespaceImport(parent) && parent.name === identifier) {
    // 命名空间导入中的标识符
    return true;
  }
  
  if (ts.isExportSpecifier(parent) && parent.name === identifier) {
    // 导出说明符中的标识符
    return true;
  }
  
  // 检查导出说明符中的原始名称 (export { originalName as newName })
  if (ts.isExportSpecifier(parent) && parent.propertyName && parent.propertyName === identifier) {
    // 当标识符是导出的原始名称时，也应该重命名
    return true;
  }
  
  // 检查是否在类型引用中（TypeReference）
  if (ts.isTypeReferenceNode(parent) && parent.typeName === identifier) {
    return true;
  }
  
  // 检查是否在表达式上下文中
  if (
    ts.isIdentifier(parent) || 
    ts.isPropertyAccessExpression(parent) || 
    ts.isElementAccessExpression(parent) || 
    ts.isCallExpression(parent) || 
    ts.isNewExpression(parent) || 
    ts.isBinaryExpression(parent) || 
    ts.isReturnStatement(parent) || 
    ts.isThrowStatement(parent) || 
    ts.isExpressionStatement(parent) ||
    ts.isIfStatement(parent) ||
    ts.isWhileStatement(parent) ||
    ts.isForStatement(parent) ||
    ts.isForInStatement(parent) ||
    ts.isForOfStatement(parent) ||
    ts.isSwitchStatement(parent) ||
    ts.isCaseClause(parent)
  ) {
    return true;
  }
  
  // 检查是否在对象字面量中作为属性名
  if (ts.isPropertyAssignment(parent) && parent.name === identifier) {
    return true;
  }
  
  // 检查是否在方法声明中
  if (ts.isMethodDeclaration(parent) && parent.name === identifier) {
    return true;
  }
  
  // 检查是否在访问器声明中
  if (ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) {
    return parent.name === identifier;
  }
  
  // 检查是否在标签语句中
  if (ts.isLabeledStatement(parent) && parent.label === identifier) {
    return true;
  }
  
  // 检查是否在break/continue语句中
  if ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === identifier) {
    return true;
  }
  
  // 检查是否在catch子句中
  if (ts.isCatchClause(parent) && parent.variableDeclaration && parent.variableDeclaration.name === identifier) {
    return true;
  }
  
  // 检查是否在标签中
  if (ts.isLabeledStatement(parent) && parent.label === identifier) {
    return true;
  }
  
  // 检查是否在装饰器中
  if (ts.isDecorator(parent) && ts.isCallExpression(parent.expression) && 
      ts.isIdentifier(parent.expression.expression) && 
      parent.expression.expression.text === identifier.text) {
    return true;
  }
  
  // 默认情况下，如果标识符是表达式的一部分，则认为是有效的
  return ts.isExpression(parent);
}

/**
 * 检查字符串是否为有效的TypeScript标识符
 * @param name - 标识符字符串
 * @returns 是否为有效标识符
 */
function isValidIdentifier(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  // 检查是否以有效字符开头
  if (!/^[a-zA-Z_$]/.test(name)) {
    return false;
  }
  
  // 检查剩余字符是否有效
  if (!/^[a-zA-Z0-9_$]+$/.test(name)) {
    return false;
  }
  
  // 检查是否为保留字
  const reservedWords = [
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 
    'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 
    'false', 'finally', 'for', 'function', 'if', 'import', 'in', 
    'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 
    'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
    'as', 'implements', 'interface', 'let', 'package', 'private', 
    'protected', 'public', 'static', 'yield', 'any', 'boolean', 
    'constructor', 'declare', 'get', 'module', 'require', 'number', 
    'set', 'string', 'symbol', 'type', 'from', 'of'
  ];
  
  return !reservedWords.includes(name);
}

/**
 * 检查字符是否为标识符字符（字母、数字、下划线、美元符号）
 * @param char - 要检查的字符
 * @returns 是否为标识符字符
 */
function isIdentifierChar(char: string): boolean {
  return /^[a-zA-Z0-9_$]$/.test(char);
}

/**
 * 重命名TypeScript源码中的多个变量
 * @param sourceCode - 源代码
 * @param renames - 重命名映射 { oldName: newName }
 * @returns 重命名结果
 */
export function renameMultipleVariables(
  sourceCode: string,
  renames: Record<string, string>
): RenameResult {
  let result = sourceCode;
  let totalRenamedCount = 0;
  const allErrors: string[] = [];

  // 按长度升序排序，避免短名称替换影响长名称替换
  // 例如：先替换 'username' 再替换 'user'，避免 'user' 影响 'username' 的替换
  const sortedRenames = Object.entries(renames).sort(
    ([a], [b]) => b.length - a.length
  );

  for (const [oldName, newName] of sortedRenames) {
    const renameResult = renameVariable(result, oldName, newName);
    result = renameResult.code;
    totalRenamedCount += renameResult.renamedCount;
    allErrors.push(...renameResult.errors);
  }

  return { code: result, renamedCount: totalRenamedCount, errors: allErrors };
}