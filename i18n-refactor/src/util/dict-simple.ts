import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import * as ts from 'typescript'

// 简单的缓存机制
const dictCache: Record<string, any> = {}

/**
 * 通过动态导入读取词条文件（支持import语句）
 * @param fp 词条文件路径
 * @returns 词条数据对象
 */
export async function loadDictFile(fp: string): Promise<Record<string, any>> {
  // 检查缓存
  if (dictCache[fp]) {
    return dictCache[fp]
  }
  
  try {
    let moduleExports: any;
    
    // 对于 .ts 文件，使用 TypeScript 编译后执行
    if (fp.endsWith('.ts')) {
      const sourceCode = fs.readFileSync(fp, 'utf8')
      
      // 编译 TypeScript 代码为 JavaScript
      const compiled = ts.transpile(sourceCode, {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        strict: false,
        esModuleInterop: true
      })
      
      // 使用 Function 构造函数安全地执行代码
      const moduleFunc = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)
      const module = { exports: {} }
      const requireFunc = (id: string) => {
        if (id === 'typescript') return ts
        return require(id)
      }
      
      moduleFunc(module.exports, requireFunc, module, fp, path.dirname(fp))
      moduleExports = module.exports
    } else {
      // 对于 .js 文件，使用 require
      delete require.cache[require.resolve(fp)]
      moduleExports = require(fp)
    }
    
    // 处理默认导出和具名导出
    let result: Record<string, any> = {}
    
    // 如果有默认导出且默认导出是对象
    if (moduleExports && typeof moduleExports === 'object' && moduleExports.default && typeof moduleExports.default === 'object') {
      // 合并默认导出和具名导出
      result = { ...moduleExports.default, ...moduleExports }
      // 移除default属性本身
      delete result.default
    } else if (moduleExports && typeof moduleExports === 'object') {
      // 只有具名导出的情况
      result = { ...moduleExports }
    }
    
    // 缓存结果
    dictCache[fp] = result
    return result
  } catch (e) {
    console.error('Error loading dictionary file:', e)
    throw new Error(`Failed to import dictionary file: ${fp}`)
  }
}

/**
 * 获取所有词条键的集合（用于键存在性检查）
 * @param dictData 词条数据对象
 * @returns 根到键集合的映射
 */
export function getDictKeys(dictData: Record<string, any>): Record<string, Set<string>> {
  const roots: Record<string, Set<string>> = {}
  
  // 遍历所有导出的属性
  for (const [rootName, rootObj] of Object.entries(dictData)) {
    if (rootObj && typeof rootObj === 'object') {
      const set = roots[rootName] || (roots[rootName] = new Set<string>())
      flattenObject(rootObj, '', set)
    }
  }
  
  return roots
}

/**
 * 展开对象树到键路径集合
 * @param obj 对象
 * @param base 基础路径
 * @param out 输出集合
 */
function flattenObject(obj: any, base: string, out: Set<string>) {
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      const next = base ? `${base}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        flattenObject(v, next, out)
      } else {
        out.add(next)
      }
    }
  }
}

/**
 * 预处理词条文件，将TS格式转换为JSON格式
 * @param dictDir 词条文件目录
 * @param outDir 输出目录
 */
export async function preprocessDictFiles(dictDir: string, outDir: string = 'i18n-cache') {
  console.log('开始预处理词条文件...')
  
  // 创建输出目录
  fs.mkdirSync(outDir, { recursive: true })
  
  if (!fs.existsSync(dictDir)) {
    console.warn(`词条目录不存在: ${dictDir}`)
    return
  }
  
  // 查找语言文件
  const langFiles = fs.readdirSync(dictDir).filter(file => 
    file.endsWith('.ts') && /^[a-z]{2}(\.[a-z0-9_-]+)?\.ts$/.test(file)
  )
  
  console.log(`找到语言文件:`, langFiles)
  
  for (const file of langFiles) {
    try {
      const filePath = path.join(dictDir, file)
      console.log(`处理文件: ${filePath}`)
      
      // 读取词条文件
      const dictData = await loadDictFile(filePath)
      
      // 生成输出文件路径
      const outFile = path.join(outDir, file.replace('.ts', '.json'))
      
      // 保存为JSON文件
      fs.writeFileSync(outFile, JSON.stringify(dictData, null, 2), 'utf8')
      console.log(`已保存: ${outFile}`)
    } catch (error) {
      console.error(`处理文件 ${file} 时出错:`, error)
    }
  }
  
  console.log('词条文件预处理完成!')
}

/**
 * 从预处理的JSON文件中加载词条数据
 * @param lang 语言代码
 * @param cacheDir 缓存目录
 * @returns 词条数据对象
 */
export function loadPreprocessedDict(lang: string, cacheDir: string = 'i18n-cache'): Record<string, any> | null {
  const filePath = path.join(cacheDir, `${lang}.json`)
  
  if (!fs.existsSync(filePath)) {
    return null
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return data
  } catch (error) {
    console.error(`加载预处理文件 ${filePath} 时出错:`, error)
    return null
  }
}