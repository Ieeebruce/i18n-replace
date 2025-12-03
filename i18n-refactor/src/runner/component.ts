import ts from 'typescript'
import { collectVarAliases } from '../core/var-alias'
import { resolveKeyFromAccess } from '../core/key-resolver'

export function processComponent(tsCode: string, htmlCode: string): { tsOut: string, htmlOut: string } {
  return { tsOut: tsCode, htmlOut: htmlCode }
}
