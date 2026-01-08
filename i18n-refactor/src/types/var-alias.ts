// 变量别名信息：名称、前缀、根来源、定义节点
export type VarAlias = { name: string; prefix: string | null; roots: string[]; declNode?: any } 
// 外部类型别名映射：类名 -> 别名列表
export type ExternalAliasMap = Map<string, VarAlias[]>