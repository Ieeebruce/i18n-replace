import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { config } from '../core/config';
import { walk } from '../processor/process-and-delete-mode';
import { processFile, FileResult } from '../processor/processor';
import { collectVarAliases } from '../core/var-alias';
import { VarAlias, ExternalAliasMap } from '../types/var-alias';

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath);
  switch (ext) {
    case '.html': return 'text/html';
    case '.js': return 'text/javascript';
    case '.css': return 'text/css';
    default: return 'text/plain';
  }
}

function scanProject(): FileResult[] {
  const dir = config.dir || process.cwd();
  const tsFiles = walk(dir, p => p.endsWith('.ts'));
  const externalAliases = new Map<string, VarAlias[]>();
  
  // 1. Scan for aliases first (same logic as process-and-delete-mode)
  for (const f of tsFiles) {
    try {
      const src = fs.readFileSync(f, 'utf8');
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      let className = '';
      let serviceName = '';
      const visit = (node: ts.Node) => {
        if (ts.isClassDeclaration(node) && node.name) {
          className = node.name.text;
          for (const m of node.members) {
            if (ts.isConstructorDeclaration(m)) {
              for (const p of m.parameters) {
                if (p.type && ts.isTypeReferenceNode(p.type) && ts.isIdentifier(p.type.typeName) && p.type.typeName.text === config.serviceTypeName) {
                  if (ts.isIdentifier(p.name)) serviceName = p.name.text;
                }
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      if (className && serviceName) {
        const aliases = collectVarAliases(sf, serviceName, config.getLocalMethod);
        if (aliases.length) {
          externalAliases.set(className, aliases);
        }
      }
    } catch (e) {
      console.error('Error scanning file for aliases:', f, e);
    }
  }

  // 2. Process all files
  const results: FileResult[] = [];
  for (const f of tsFiles) {
    try {
      const res = processFile(f, externalAliases);
      results.push(res);
    } catch (e) {
      console.error('Error processing file:', f, e);
    }
  }
  return results;
}

export function startUiServer(port: number = 3000) {
  // Get the directory where this script is located
  const scriptDir = path.dirname(__filename);
  const uiDir = path.join(scriptDir, 'ui');
  
  const server = http.createServer(async (req, res) => {
    // Enable CORS for development convenience if needed
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 检查请求路径
    const reqUrl = req.url || '/';
    // 提取路径部分，忽略查询参数
    const urlPath = reqUrl.split('?')[0];
    
    // 处理 API 路由
    if (urlPath === '/api/scan') {
      try {
        const results = scanProject();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
      return;
    }
    
    if (urlPath === '/api/apply' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const filesToApply: string[] = data.files || [];
          let appliedCount = 0;
          
          const results = scanProject();
          for (const r of results) {
            if (filesToApply.includes(r.tsPath) && r.changed) {
              fs.writeFileSync(r.tsPath, r.tsAfter, 'utf8');
              if (r.htmlPath && r.htmlAfter !== r.htmlBefore) {
                fs.writeFileSync(r.htmlPath, r.htmlAfter, 'utf8');
              }
              appliedCount++;
            }
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: appliedCount }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }
    
    // 处理静态文件请求
    let filePath = urlPath === '/' ? path.join(uiDir, 'index.html') : path.join(uiDir, urlPath);
    
    // 检查文件是否存在
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      try {
        const content = fs.readFileSync(filePath);
        const mimeType = getMimeType(filePath);
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(content);
        return;
      } catch (e) {
        console.error('Error reading file:', filePath, e);
      }
    }
    
    // 根路径回退 - 如果index.html不存在，尝试返回根路径
    if (urlPath === '/') {
      try {
        const content = fs.readFileSync(path.join(uiDir, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
        return;
      } catch (e) {
        console.error('Error reading index.html:', e);
      }
    }

    // 其他路径返回404
    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    console.log(`UI Server running at http://localhost:${port}`);
    console.log('Open this URL in your browser to visualize and apply changes.');
  });
}
