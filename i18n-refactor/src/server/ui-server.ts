import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { CodeMod } from '../transformer/code-mod';
import { RefactorManifest } from '../core/types';

const CACHE_DIR = '.i18n-refactor-cache';
const PLAN_FILE = path.join(process.cwd(), CACHE_DIR, 'plan.json');

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath);
  switch (ext) {
    case '.html': return 'text/html';
    case '.js': return 'text/javascript';
    case '.css': return 'text/css';
    default: return 'text/plain';
  }
}

function runCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
            if (error) {
                reject(stderr || error.message);
                return;
            }
            resolve(stdout);
        });
    });
}

export function startUiServer(port: number = 3000) {
  const scriptDir = path.dirname(__filename);
  const uiDir = path.join(scriptDir, 'ui');
  
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const reqUrl = req.url || '/';
    const urlPath = reqUrl.split('?')[0];
    
    // API: Run Command
    if (urlPath === '/api/run' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const mode = data.mode; // 'scan', 'migrate', 'plan'
                
                if (!['scan', 'migrate', 'plan'].includes(mode)) {
                    throw new Error('Invalid mode');
                }

                // Run the CLI command
                // We need to point to the correct executable or script.
                // Assuming we are running from project root.
                // We should use 'npm run i18n-refactor -- --mode=...' or node directly.
                // Using npm run is safer for env.
                const cmd = `npm run i18n-refactor -- --mode=${mode}`;
                const output = await runCommand(cmd);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, output }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: String(e) }));
            }
        });
        return;
    }

    // API: Get Plan
    if (urlPath === '/api/plan') {
      try {
        if (!fs.existsSync(PLAN_FILE)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Plan file not found. Run "i18n-refactor plan" first.' }));
          return;
        }
        const plan = fs.readFileSync(PLAN_FILE, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(plan);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
      return;
    }

    // API: Apply Changes
    if (urlPath === '/api/apply' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const filesToApply: string[] = data.files || []; // List of files to apply
          
          if (!fs.existsSync(PLAN_FILE)) {
            throw new Error('Plan file not found');
          }
          
          const fullManifest: RefactorManifest = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
          
          // Filter manifest to only include requested files
          // If filesToApply is empty, maybe apply all? Or none?
          // Let's assume if provided, filter. If not provided or empty, apply all (or error).
          // For safety, let's require files list.
          
          const filteredManifest: RefactorManifest = {
            ...fullManifest,
            changes: fullManifest.changes.filter(c => filesToApply.includes(c.file))
          };

          const codemod = new CodeMod();
          await codemod.apply(filteredManifest);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: filteredManifest.changes.length }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }
    
    // Serve Static Files
    let filePath = urlPath === '/' ? path.join(uiDir, 'index.html') : path.join(uiDir, urlPath);
    
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
    
    // Fallback index.html
    if (urlPath === '/') {
        // Try fallback locations if running from src
        const fallbackUi = path.join(process.cwd(), 'i18n-refactor/src/server/ui/index.html');
         if (fs.existsSync(fallbackUi)) {
            const content = fs.readFileSync(fallbackUi);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
            return;
         }
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    console.log(`UI Server running at http://localhost:${port}`);
    console.log('Open this URL in your browser to review the plan.');
  });
}
