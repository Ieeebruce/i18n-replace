import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { I18nToolService } from '../i18n-tool.service';

@Component({
  selector: 'app-environment-init',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './environment-init.component.html',
  styleUrls: ['./environment-init.component.scss']
})
export class EnvironmentInitComponent implements OnInit {
  selectedPath: string = '';
  isValidPath: boolean = false;
  isInitializing: boolean = false;
  outputLog: string = '';

  // Directory selection states
  showDirSelector = false;
  directoryList: any[] = [];
  currentPath = '';

  constructor(
    private i18nToolService: I18nToolService,
    private router: Router
  ) {}

  ngOnInit() {
    // Initialize with current working directory or project root
    this.validatePath('./');
  }

  // Open directory selector
  openPathSelector() {
    this.loadDirectories();
  }

  // Load directories from backend API
  loadDirectories(path?: string) {
    this.i18nToolService.getDirectories(path).subscribe({
      next: (response) => {
        this.directoryList = response.directories;
        this.currentPath = response.currentPath;
        this.showDirSelector = true;
      },
      error: (error) => {
        console.error('Error loading directories:', error);
        this.outputLog = `错误: ${error.message || '加载目录失败'}`;
      }
    });
  }

  // Select a directory
  selectDirectory(directory: any) {
    this.selectedPath = directory.path;
    this.validatePath(directory.path);
    this.closeDirSelector();
  }

  // Navigate to parent directory
  goToParentDirectory() {
    // const parentPath = require('path').dirname(this.currentPath);
    // this.loadDirectories(parentPath);
  }

  // Close directory selector
  closeDirSelector() {
    this.showDirSelector = false;
    this.directoryList = [];
  }

  // Validate the selected path
  validatePath(path: string) {
    if (!path) {
      this.isValidPath = false;
      return;
    }

    this.i18nToolService.checkDirectory(path).subscribe({
      next: (response) => {
        this.isValidPath = response.exists && response.isDirectory;
      },
      error: (error) => {
        console.error('Error validating path:', error);
        this.isValidPath = false;
      }
    });
  }

  // Initialize the environment with selected path
  initializeEnvironment() {
    if (!this.selectedPath || !this.isValidPath) {
      alert('请选择一个有效的目录路径');
      return;
    }

    this.isInitializing = true;
    this.outputLog = `开始初始化环境...\n目录: ${this.selectedPath}\n\n`;

    // Prepare configuration for bootstrap mode
    const config = {
      mode: 'bootstrap',
      dir: this.selectedPath,
      dictDir: `${this.selectedPath}/src/app/i18n`,
      languages: ['zh', 'en'],
      jsonOutDir: `${this.selectedPath}/i18n-refactor/out`,
      dryRun: false
    };

    // Execute bootstrap mode
    this.i18nToolService.executeTool(config).subscribe({
      next: (result) => {
        this.outputLog += '环境初始化成功完成!\n';
        this.outputLog += `处理了 ${result.summary.files} 个文件\n`;
        this.outputLog += `${result.summary.changed} 个文件被修改\n`;
        this.isInitializing = false;
      },
      error: (error) => {
        this.outputLog += `初始化过程中发生错误: ${error.message}\n`;
        console.error('Initialization error:', error);
        this.isInitializing = false;
      }
    });
  }

  // Clear output log
  clearOutput() {
    this.outputLog = '';
  }

  // Navigate to main tool
  goToMainTool() {
    this.router.navigate(['/main/i18n-tool']);
  }
}