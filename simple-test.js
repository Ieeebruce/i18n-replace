const fs = require('fs')
const path = require('path')

console.log('🔍 检查词条替换工具配置...')

// 检查替换工具脚本
const replaceScriptPath = path.join(__dirname, 'scripts', 'replace-i18n.js')
if (fs.existsSync(replaceScriptPath)) {
  console.log('✅ 找到替换工具脚本')
  
  // 读取替换工具配置
  const scriptContent = fs.readFileSync(replaceScriptPath, 'utf8')
  console.log('📋 替换工具配置:')
  console.log('- 处理目录:', scriptContent.includes('src') ? 'src' : '未知')
  console.log('- 输出目录:', scriptContent.includes('scripts/out') ? 'scripts/out' : '未知')
}

// 检查src2目录
const src2Path = path.join(__dirname, 'src2')
if (fs.existsSync(src2Path)) {
  console.log('✅ src2目录存在')
  
  // 检查HTML文件数量
  const htmlFiles = []
  function findHtmlFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        findHtmlFiles(fullPath)
      } else if (entry.name.endsWith('.html')) {
        htmlFiles.push(fullPath)
      }
    }
  }
  
  findHtmlFiles(src2Path)
  console.log(`📄 src2目录中的HTML文件数: ${htmlFiles.length}`)
  
  // 检查是否有中文内容
  let hasChinese = false
  for (const file of htmlFiles.slice(0, 3)) { // 只检查前3个文件
    const content = fs.readFileSync(file, 'utf8')
    if (/[\u4e00-\u9fff]/.test(content)) {
      hasChinese = true
      console.log(`⚠️  发现中文内容在: ${path.relative(__dirname, file)}`)
      break
    }
  }
  
  if (!hasChinese) {
    console.log('✅ 未发现中文内容 - 可能已经替换完成')
  }
} else {
  console.log('❌ src2目录不存在')
}

console.log('\n📝 测试准备完成，可以运行词条替换工具')