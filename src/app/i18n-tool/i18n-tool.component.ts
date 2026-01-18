import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { I18nToolService, I18nToolConfig, ExecutionResult } from './i18n-tool.service';

@Component({
  selector: 'app-i18n-tool',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './i18n-tool.component.html',
  styleUrls: ['./i18n-tool.component.scss']
})
export class I18nToolComponent {
  selectedMode: string | null = null;
  executionStatus: 'idle' | 'running' | 'success' | 'error' = 'idle';
  outputLog = '';
  executionSummary: any = null;
  executionResults: any = null;

  config = {
    dir: 'src',
    dictDir: 'src/app/i18n',
    languagesStr: 'zh,en',
    jsonOutDir: 'i18n-refactor/out',
    dryRun: true
  };

  // Directory selection states
  showDirSelector = false;
  currentDirSelection = '';
  directoryList: any[] = [];
  currentPath = ''; // For directory browsing

  constructor(
    private i18nToolService: I18nToolService,
    private router: Router
  ) {}

  // Open directory selector modal for specific field
  openDirSelector(field: string) {
    this.currentDirSelection = field;
    this.loadDirectories();
  }

  loadDirectories(path?: string) {
    this.i18nToolService.getDirectories(path).subscribe({
      next: (response) => {
        this.directoryList = response.directories;
        this.currentPath = response.currentPath;
        this.showDirSelector = true;
      },
      error: (error) => {
        console.error('Error loading directories:', error);
      }
    });
  }

  selectDirectory(directory: any) {
    // Update the appropriate config field based on which button triggered the selection
    switch(this.currentDirSelection) {
      case 'dir':
        this.config.dir = directory.path;
        break;
      case 'dictDir':
        this.config.dictDir = directory.path;
        break;
      case 'jsonOutDir':
        this.config.jsonOutDir = directory.path;
        break;
    }
    this.closeDirSelector();
  }

  goToParentDirectory() {
    // const parentPath = require('path').dirname(this.currentPath);
    // this.loadDirectories(parentPath);
  }

  closeDirSelector() {
    this.showDirSelector = false;
    this.currentDirSelection = '';
    this.directoryList = [];
  }

  // Convenience methods for each directory type
  openFolderDialog() {
    this.openDirSelector('dir');
  }

  openDictFolderDialog() {
    this.openDirSelector('dictDir');
  }

  openJsonOutFolderDialog() {
    this.openDirSelector('jsonOutDir');
  }

  selectMode(mode: string) {
    this.selectedMode = mode;
    this.clearOutput();
  }

  executeTool() {
    if (!this.selectedMode) {
      alert('请选择一个执行模式');
      return;
    }

    this.executionStatus = 'running';
    this.outputLog = `正在执行 ${this.selectedMode} 模式...\n`;
    
    // 准备配置
    const toolConfig: I18nToolConfig = {
      mode: this.selectedMode,
      dir: this.config.dir,
      dictDir: this.config.dictDir,
      languages: this.config.languagesStr.split(',').map(lang => lang.trim()),
      jsonOutDir: this.config.jsonOutDir,
      dryRun: this.config.dryRun
    };
    
    // 调用后端API执行工具
    this.i18nToolService.executeTool(toolConfig).subscribe({
      next: (result: ExecutionResult) => {
        this.handleExecutionSuccess(result);
      },
      error: (error) => {
        this.handleExecutionError(error);
      }
    });
  }

  private handleExecutionSuccess(result: ExecutionResult) {
    this.executionSummary = result.summary;
    this.executionResults = result;
    this.executionStatus = 'success';
    
    // 更新输出日志
    this.outputLog += `执行完成！处理了 ${this.executionSummary.files} 个文件，${this.executionSummary.changed} 个文件已更改。\n`;
    
    if (this.executionSummary.missingKeys && this.executionSummary.missingKeys > 0) {
      this.outputLog += `注意: 发现 ${this.executionSummary.missingKeys} 个缺失的键。\n`;
    }
    
    // 添加一些文件变更信息到日志
    const changedFiles = result.results.filter(r => r.changed).length;
    this.outputLog += `其中 ${changedFiles} 个文件有实际变更。\n`;
  }

  private handleExecutionError(error: any) {
    this.executionStatus = 'error';
    this.outputLog += `\n执行失败: ${error.message || '未知错误'}\n`;
    console.error('执行工具时发生错误:', error);
  }



  getStatusText(): string {
    switch(this.executionStatus) {
      case 'idle': return '就绪';
      case 'running': return '执行中...';
      case 'success': return '执行成功';
      case 'error': return '执行失败';
      default: return '未知状态';
    }
  }

  resetConfig() {
    this.config = {
      dir: 'src',
      dictDir: 'src/app/i18n',
      languagesStr: 'zh,en',
      jsonOutDir: 'i18n-refactor/out',
      dryRun: true
    };
    this.selectedMode = null;
    this.clearOutput();
  }

  clearOutput() {
    this.outputLog = '';
    this.executionSummary = null;
    this.executionResults = null;
    this.executionStatus = 'idle';
  }

  goToEnvInit() {
    this.router.navigate(['/env-init']);
  }
}