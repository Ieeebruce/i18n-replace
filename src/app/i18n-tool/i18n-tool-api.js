const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = 8080;

app.use(express.json());

// API to execute i18n-refactor tool
app.post('/api/i18n-tool/execute', (req, res) => {
  const { mode, dir, dictDir, languages, jsonOutDir, dryRun } = req.body;
  
  console.log(`Executing i18n-refactor tool with mode: ${mode}`);
  
  // Build command arguments
  const args = [
    path.join(__dirname, '../../../i18n-refactor/dist/src/runner/run-dir.js'),
    '--mode=' + mode,
    '--dir=' + (dir || 'src'),
    '--dictDir=' + (dictDir || 'src/app/i18n'),
    '--jsonOutDir=' + (jsonOutDir || 'i18n-refactor/out'),
    ...(dryRun ? ['--dry-run'] : []),
    '--logLevel=info',
    '--format=json'
  ];
  
  // Add language arguments if needed
  if (languages && Array.isArray(languages) && languages.length > 0) {
    // Languages are typically handled through config file, not command line
  }
  
  console.log('Command:', 'node', args.join(' '));
  
  // Execute the i18n-refactor tool
  const child = spawn('node', args, {
    cwd: path.join(__dirname, '../../../'),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('close', (code) => {
    console.log(`Child process exited with code ${code}`);
    
    if (code !== 0) {
      console.error('Error executing i18n-refactor tool:', stderr);
      return res.status(500).json({ 
        error: `Process exited with code ${code}. Error: ${stderr}` 
      });
    }

    try {
      // Parse the JSON output from the tool
      const lines = stdout.split('\n').filter(line => line.trim() !== '');
      let outputObj = null;
      
      // Look for JSON output in the last few lines
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
        try {
          outputObj = JSON.parse(lines[i]);
          break;
        } catch (e) {
          // Continue to the previous line
          continue;
        }
      }
      
      if (!outputObj) {
        // If no JSON output found, return basic response
        return res.json({
          summary: {
            dir: dir || 'src',
            files: 0,
            changed: 0
          },
          results: [],
          details: []
        });
      }
      
      res.json(outputObj);
    } catch (parseError) {
      console.error('Error parsing output:', parseError);
      res.status(500).json({ 
        error: 'Failed to parse tool output', 
        stderr 
      });
    }
  });

  child.on('error', (error) => {
    console.error('Failed to start child process:', error);
    res.status(500).json({ 
      error: 'Failed to start tool execution', 
      message: error.message 
    });
  });
});

// API to get tool status
app.get('/api/i18n-tool/status', (req, res) => {
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

// API to get current config
app.get('/api/i18n-tool/config', (req, res) => {
  res.json({ 
    defaultConfig: {
      dir: 'src',
      dictDir: 'src/app/i18n',
      languages: ['zh', 'en'],
      jsonOutDir: 'i18n-refactor/out',
      dryRun: true
    }
  });
});

// API to get directory listing
app.get('/api/i18n-tool/dirs', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const rootPath = req.query.path ? path.resolve(req.query.path) : process.cwd();
    
    // Security check: ensure we're not accessing outside the allowed directories
    const projectRoot = process.cwd();
    // Allow access to project root and its subdirectories
    if (!rootPath.startsWith(projectRoot) && !projectRoot.startsWith(rootPath)) {
      return res.status(400).json({ error: 'Invalid path: Outside allowed directories' });
    }
    
    const items = fs.readdirSync(rootPath).map(item => {
      const itemPath = path.join(rootPath, item);
      const stat = fs.statSync(itemPath);
      return {
        name: item,
        path: itemPath,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile()
      };
    }).filter(item => item.isDirectory()); // Only return directories
    
    res.json({
      currentPath: rootPath,
      directories: items
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to check if directory is valid
app.get('/api/i18n-tool/check-dir', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  const dirPath = req.query.path;
  
  if (!dirPath) {
    return res.status(400).json({ error: 'Path parameter is required' });
  }
  
  try {
    const resolvedPath = path.resolve(dirPath);
    const projectRoot = process.cwd();
    
    // Security check: ensure we're not accessing outside allowed directories
    // Allow access to project root and its subdirectories
    if (!resolvedPath.startsWith(projectRoot) && !projectRoot.startsWith(resolvedPath)) {
      return res.status(400).json({ error: 'Invalid path: Outside allowed directories' });
    }
    
    const exists = fs.existsSync(resolvedPath);
    const isDirectory = exists ? fs.statSync(resolvedPath).isDirectory() : false;
    
    res.json({
      path: resolvedPath,
      exists: exists,
      isDirectory: isDirectory
    });
  } catch (error) {
    console.error('Error checking directory:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`i18n-tool API server running on port ${PORT}`);
});