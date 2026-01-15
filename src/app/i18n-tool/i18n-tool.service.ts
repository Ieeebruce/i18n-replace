import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface I18nToolConfig {
  dir: string;
  dictDir: string;
  languages: string[];
  jsonOutDir: string;
  dryRun: boolean;
  mode: string;
  jsonArrayMode?: string;
  logLevel?: string;
  format?: string;
}

export interface ExecutionResult {
  summary: {
    dir: string;
    files: number;
    changed: number;
    missingKeys?: number;
  };
  results: Array<{
    file: string;
    type: 'ts' | 'html';
    changed: boolean;
  }>;
  details: Array<{
    file: string;
    type: 'ts' | 'html';
    changes: Array<{
      line: number;
      before: string;
      after: string;
      beforeKey: string | null;
      afterKey: string | null;
      zhBefore: string | null;
      enBefore: string | null;
      zhAfter: string | null;
      enAfter: string | null;
    }>;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class I18nToolService {
  private readonly API_BASE_URL = '/api/i18n-tool';

  constructor(private http: HttpClient) {}

  /**
   * 执行i18n-refactor工具
   */
  executeTool(config: I18nToolConfig): Observable<ExecutionResult> {
    return this.http.post<ExecutionResult>(`${this.API_BASE_URL}/execute`, config)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 获取工具执行状态
   */
  getStatus(): Observable<any> {
    return this.http.get(`${this.API_BASE_URL}/status`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 获取最新执行结果
   */
  getLastResult(): Observable<ExecutionResult> {
    return this.http.get<ExecutionResult>(`${this.API_BASE_URL}/last-result`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 获取当前配置
   */
  getConfig(): Observable<I18nToolConfig> {
    return this.http.get<I18nToolConfig>(`${this.API_BASE_URL}/config`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 获取目录列表
   */
  getDirectories(path?: string): Observable<any> {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.http.get(`${this.API_BASE_URL}/dirs${params}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 检查目录是否有效
   */
  checkDirectory(path: string): Observable<any> {
    return this.http.get(`${this.API_BASE_URL}/check-dir?path=${encodeURIComponent(path)}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * 错误处理
   */
  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An unknown error occurred!';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}