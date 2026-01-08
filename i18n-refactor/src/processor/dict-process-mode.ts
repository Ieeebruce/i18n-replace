import * as fs from 'fs';
import * as path from 'path';
import { info, warn } from '../util/logger';
import { flattenLangFile, writeJson } from '../util/dict-flatten';

/**
 * 专门处理词条读取、拍平并写入文件的函数
 * @param dictDir 词条文件目录
 * @param outDir 输出目录
 * @param langs 语言列表
 * @param arrayMode 数组模式
 */
export async function processDictFiles(dictDir: string, outDir: string, langs: string[], arrayMode: 'nested'|'flat') {
  const { loadDictFile } = await import('../util/dict-simple');
  
  for (const lang of langs) {
    const fp = path.join(process.cwd(), dictDir, `${lang}.ts`);
    if (!fs.existsSync(fp)) { warn('lang file missing', { file: fp }); continue }
    
    try {
      // 使用新的 loadDictFile 函数读取词条文件
      const dictData = await loadDictFile(fp);
      
      // 展开对象树到键路径集合
      const flat: Record<string, any> = {}
      flattenDictObject(dictData, '', flat)
      
      // 写入JSON文件
      writeJson(path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir), lang, flat)
      info('dict processed and json written', { lang, file: fp, keys: Object.keys(flat).length })
    } catch (error) {
      warn('failed to process dict file', { file: fp, error: error as Error })
    }
  }
}

/**
 * 展开对象树到键路径集合
 * @param obj 对象
 * @param base 基础路径
 * @param out 输出集合
 */
function flattenDictObject(obj: any, base: string, out: Record<string, any>) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      const next = base ? `${base}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        flattenDictObject(v, next, out)
      } else {
        out[next] = v
      }
    }
  } else if (Array.isArray(obj)) {
    // 处理数组
    obj.forEach((item, index) => {
      const next = base ? `${base}.${index}` : `${index}`
      if (typeof item === 'object' && item !== null) {
        flattenDictObject(item, next, out)
      } else {
        out[next] = item
      }
    })
  } else {
    out[base] = obj
  }
}