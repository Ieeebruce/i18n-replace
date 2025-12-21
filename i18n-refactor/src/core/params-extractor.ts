export type ReplaceParam = Record<string, string> // 替换参数对象类型，键为模板占位符，值为表达式文本

export function extractReplaceParams(chainText: string): ReplaceParam { // 从链式 .replace 调用中抽取参数
  const out: ReplaceParam = {} // 初始化输出对象
  const re = /\.replace\(\s*["']\{([^}]+)\}["']\s*,\s*([^)]+)\s*\)/g // 正则匹配 .replace('{key}', expr)
  let m: RegExpExecArray | null // 临时匹配结果
  while ((m = re.exec(chainText))) { // 逐个匹配链中的所有 replace
    out[m[1]] = m[2].trim() // 记录参数：key → expr
  }
  return out // 返回参数对象
}
