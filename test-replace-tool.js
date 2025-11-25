const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

function copyDir(src, dest) {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true })
  }
  fs.mkdirSync(dest, { recursive: true })
  
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function main() {
  console.log('🔄 开始测试词条替换工具...')
  
  const projectRoot = process.cwd()
  const srcDir = path.join(projectRoot, 'src')
  const src2Dir = path.join(projectRoot, 'src2')
  
  console.log('📁 复制 src 到 src2...')
  copyDir(srcDir, src2Dir)
  console.log('✅ 复制完成')
  
  console.log('🔧 运行词条替换工具...')
  try {
    // 修改替换工具配置，让它处理src2目录
    const replaceScript = path.join(projectRoot, 'scripts', 'replace-i18n.js')
    const originalContent = fs.readFileSync(replaceScript, 'utf8')
    
    // 临时修改脚本，将src替换为src2
    const modifiedContent = originalContent.replace(
      /path\.join\(process\.cwd\(\),\s*['"]src['"]\)/g,
      "path.join(process.cwd(), 'src2')"
    )
    
    fs.writeFileSync(replaceScript, modifiedContent)
    
    // 运行替换工具
    const output = execSync('node scripts/replace-i18n.js', { 
      cwd: projectRoot,
      encoding: 'utf8'
    })
    
    console.log('📊 替换结果:')
    console.log(output)
    
    // 恢复原始脚本
    fs.writeFileSync(replaceScript, originalContent)
    
    console.log('✅ 词条替换工具测试完成')
    
    // 检查输出文件
    const outputFile = path.join(projectRoot, 'scripts', 'out', 'i18n-replace.json')
    if (fs.existsSync(outputFile)) {
      const results = JSON.parse(fs.readFileSync(outputFile, 'utf8'))
      console.log(`\n📈 统计信息:`)
      console.log(`- 总文件数: ${results.results.length}`)
      console.log(`- 修改文件数: ${results.changed}`)
      console.log(`- 修改详情:`)
      results.results.forEach(result => {
        if (result.changed) {
          console.log(`  - ${result.file}: 已修改`)
        }
      })
    }
    
  } catch (error) {
    console.error('❌ 运行词条替换工具失败:', error.message)
    // 恢复原始脚本
    const replaceScript = path.join(projectRoot, 'scripts', 'replace-i18n.js')
    if (fs.existsSync(replaceScript)) {
      const originalContent = fs.readFileSync(replaceScript, 'utf8')
      const restoredContent = originalContent.replace(
        /path\.join\(process\.cwd\(\),\s*['"]src2['"]\)/g,
        "path.join(process.cwd(), 'src')"
      )
      fs.writeFileSync(replaceScript, restoredContent)
    }
  }
}

if (require.main === module) {
  main()
}

module.exports = { copyDir }