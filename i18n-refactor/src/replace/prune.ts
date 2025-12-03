import ts from 'typescript' // 引入 TypeScript 类型定义，仅用于类型标注

export function pruneUnused(sf: ts.SourceFile, code: string, varNames: string[]): string { // 移除未使用的 getLocal 相关赋值与声明
  let out = code // 从原始代码复制开始
  for (const v of varNames) { // 遍历待清理的变量名
    const reAssign = new RegExp('this\\.' + v + '\\s*=\\s*[^;]*\\.' + 'getLocal' + '\\([^)]*\\)\\s*;', 'g') // 匹配 this.<v> = ...getLocal(...) 赋值
    const reDeclTyped = new RegExp(`\b${v}\s*:\s*[^;]+;`, 'g') // 匹配带类型的声明 <v>: <type>;
    const reDeclBare = new RegExp(`\b${v}\s*;`, 'g') // 匹配仅声明不赋值的 <v>;
    out = out.replace(reAssign, '') // 删除 getLocal 赋值语句
    out = out.replace(reDeclTyped, '') // 删除带类型的声明
    out = out.replace(reDeclBare, '') // 删除仅声明语句
    out = out.replace(new RegExp(`\b${v}\s*:\s*any\s*;`, 'g'), '') // 删除 any 类型声明
  } // 结束变量遍历
  out = out.replace(/\blocal\s*:\s*any\s*;/g, '') // 兜底：移除 local: any; 声明
  return out // 返回清理后的代码
} // 函数结束
