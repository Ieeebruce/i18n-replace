import ts from 'typescript' // 引入 TypeScript，用于类型与潜在 AST 操作
import { collectVarAliases } from '../core/var-alias' // 收集别名信息的工具
import { resolveKeyFromAccess } from '../core/key-resolver' // 从表达式解析键的工具

export function processComponent(tsCode: string, htmlCode: string): { tsOut: string, htmlOut: string } { // 组件级处理入口（占位实现）
  return { tsOut: tsCode, htmlOut: htmlCode } // 当前直接返回原始内容，后续可接入替换能力
}
