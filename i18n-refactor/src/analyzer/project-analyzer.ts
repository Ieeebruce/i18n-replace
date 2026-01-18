import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerResult, I18nUsage, ComplexCase } from '../core/types';
import { info, warn } from '../util/logger';
import { HtmlTemplateAnalyzer } from './html-template-analyzer';

export class ProjectAnalyzer {
  private program: ts.Program;
  private checker: ts.TypeChecker;
  private usages: I18nUsage[] = [];
  private complexCases: ComplexCase[] = [];
  private htmlAnalyzer = new HtmlTemplateAnalyzer();

  constructor(private tsConfigPath: string, private config: { getLocaleMethod: string }) {
    if (!fs.existsSync(tsConfigPath)) {
      throw new Error(`tsconfig.json not found at ${tsConfigPath}`);
    }
    
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(tsConfigPath)
    );

    this.program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
    this.checker = this.program.getTypeChecker();
  }

  public async analyze(): Promise<AnalyzerResult> {
    info('Starting project analysis...');
    
    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('node_modules')) {
        continue;
      }
      await this.analyzeFile(sourceFile);
    }

    return {
      usages: this.usages,
      complexCases: this.complexCases
    };
  }

  private async analyzeFile(sourceFile: ts.SourceFile) {
    // Map to track public properties that are tainted: name -> i18n path
    const publicTaintedProps = new Map<string, string[]>();

    const visit = (node: ts.Node) => {
      // 1. Find call to getLocale()
      if (ts.isCallExpression(node) && this.isGetLocaleCall(node)) {
        // Found a source!
        this.traceTaint(node, [], sourceFile, publicTaintedProps);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    // If we found any public tainted properties, analyze the associated HTML template
    if (publicTaintedProps.size > 0) {
      info(`Found public tainted props in ${sourceFile.fileName}: ${Array.from(publicTaintedProps.keys()).join(', ')}`);
      await this.analyzeComponentTemplate(sourceFile, publicTaintedProps);
    } else {
      // info(`No public tainted props in ${sourceFile.fileName}`);
    }
  }

  private async analyzeComponentTemplate(sourceFile: ts.SourceFile, publicTaintedProps: Map<string, string[]>) {
    // Find the Component decorator to get templateUrl
    let templateUrl: string | null = null;
    
    const findTemplateUrl = (node: ts.Node) => {
      if (ts.isClassDeclaration(node)) {
         // Check decorators
         const decorators = ts.getDecorators(node);
         if (decorators) {
           for (const decorator of decorators) {
             if (ts.isCallExpression(decorator.expression) && 
                 ts.isIdentifier(decorator.expression.expression) && 
                 decorator.expression.expression.text === 'Component') {
                 
                 const args = decorator.expression.arguments;
                 if (args.length > 0 && ts.isObjectLiteralExpression(args[0])) {
                   for (const prop of args[0].properties) {
                     if (ts.isPropertyAssignment(prop) && 
                         ts.isIdentifier(prop.name) && 
                         prop.name.text === 'templateUrl') {
                         if (ts.isStringLiteral(prop.initializer)) {
                           templateUrl = prop.initializer.text;
                         }
                     }
                   }
                 }
             }
           }
         }
      }
      ts.forEachChild(node, findTemplateUrl);
    }
    findTemplateUrl(sourceFile);

    if (templateUrl) {
      const templatePath = path.resolve(path.dirname(sourceFile.fileName), templateUrl);
      info(`Analyzing template: ${templatePath}`);
      if (fs.existsSync(templatePath)) {
         const htmlUsages = await this.htmlAnalyzer.analyze(templatePath, publicTaintedProps);
         info(`Found ${htmlUsages.length} usages in template ${templatePath}`);
         this.usages.push(...htmlUsages);
      } else {
         warn(`Template file not found: ${templatePath}`);
      }
    } else {
      // info(`No templateUrl found in ${sourceFile.fileName}`);
    }
  }

  private isGetLocaleCall(node: ts.CallExpression): boolean {
    // Simple check: method name matches
    if (ts.isPropertyAccessExpression(node.expression)) {
      return node.expression.name.text === this.config.getLocaleMethod;
    }
    return false;
  }

  /**
   * Trace the flow of tainted data
   * @param node The expression evaluating to tainted data
   * @param path The i18n key path accumulated so far
   */
  private traceTaint(node: ts.Node, currentPath: string[], sourceFile: ts.SourceFile, publicTaintedProps: Map<string, string[]>) {
    const parent = node.parent;

    // Case 1: Variable Declaration: const data = ...
    if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
      if (ts.isIdentifier(parent.name)) {
        this.traceVariableUsage(parent.name, currentPath, sourceFile, publicTaintedProps);
        
        // Mark the variable declaration for deletion
        // Check if we can delete the whole statement
        const varList = parent.parent;
        if (ts.isVariableDeclarationList(varList) && varList.declarations.length === 1) {
            const statement = varList.parent;
            if (ts.isVariableStatement(statement)) {
                 this.addUsage(statement, [], sourceFile, 'declaration_delete');
            } else {
                 this.addUsage(parent, [], sourceFile, 'declaration_delete');
            }
        } else {
             // Just delete the declaration (might need comma handling, but keep simple for now)
             this.addUsage(parent, [], sourceFile, 'declaration_delete');
        }

      } else if (ts.isObjectBindingPattern(parent.name)) {
        // Destructuring: const { app } = ...
        // Complex to delete partial destructuring. Skipping deletion for now unless all elements are unused.
        // But we trace usage anyway.
        for (const element of parent.name.elements) {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
            const propName = (element.propertyName as ts.Identifier)?.text || element.name.text;
            this.traceVariableUsage(element.name, [...currentPath, propName], sourceFile, publicTaintedProps);
          }
        }
      }
    }

    // Case 1.5: Property Declaration (Class Field): L = this.locale.getLocale()
    else if (ts.isPropertyDeclaration(parent) && parent.initializer === node) {
        if (ts.isIdentifier(parent.name)) {
            const symbol = this.checker.getSymbolAtLocation(parent.name);
            if (symbol && parent.parent && ts.isClassDeclaration(parent.parent)) {
                this.traceClassProperty(parent.parent, symbol, currentPath, publicTaintedProps);
            }
            // Mark property declaration for deletion
            this.addUsage(parent, [], sourceFile, 'declaration_delete');
        }
    }

    // Case 2: Assignment: this.data = ...
    else if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (parent.right === node) {
            // Source is on RHS, propagate to LHS
            if (ts.isPropertyAccessExpression(parent.left)) {
                this.tracePropertyUsage(parent.left, currentPath, publicTaintedProps);
            } else if (ts.isIdentifier(parent.left)) {
                this.traceVariableUsage(parent.left, currentPath, sourceFile, publicTaintedProps);
            }
        } else if (parent.left === node) {
            // Source is on LHS (e.g. we are tracing a tainted property usage, and found an assignment to it)
            // This means we are re-assigning the tainted property? Or initializing it?
            // If we are initializing it (e.g. this.title = ...), we should mark this assignment for deletion
            // because we want to replace usages of this.title with direct i18n calls.
            
            // Check if we should delete the whole statement
            if (parent.parent && ts.isExpressionStatement(parent.parent)) {
                this.addUsage(parent.parent, [], sourceFile, 'declaration_delete');
            } else {
                this.addUsage(parent, [], sourceFile, 'declaration_delete');
            }
        }
    }

    // Case 3: Property Access: data.app
    else if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
      this.traceTaint(parent, [...currentPath, parent.name.text], sourceFile, publicTaintedProps);
    }
    
    // Case 4: Element Access: data['app']
    else if (ts.isElementAccessExpression(parent) && parent.expression === node) {
       if (ts.isStringLiteral(parent.argumentExpression)) {
          this.traceTaint(parent, [...currentPath, parent.argumentExpression.text], sourceFile, publicTaintedProps);
       } else {
         // Dynamic key - complex case
         this.addComplexCase(parent, "Dynamic element access not supported yet", sourceFile);
       }
    }

    // Case 5: Direct Usage (Sink)
    else {
      // If we are at a leaf node (not further accessed), record usage
      // Check if we are "done"
      if (!ts.isPropertyAccessExpression(parent) && !ts.isElementAccessExpression(parent)) {
        this.addUsage(node, currentPath, sourceFile);
      }
    }
  }

  private traceVariableUsage(identifier: ts.Identifier, currentPath: string[], sourceFile: ts.SourceFile, publicTaintedProps: Map<string, string[]>) {
    const symbol = this.checker.getSymbolAtLocation(identifier);
    if (!symbol) return;

    const scope = this.getScope(identifier);
    if (!scope) return;

    const visit = (n: ts.Node) => {
      if (ts.isIdentifier(n) && n !== identifier) { // Skip declaration itself
         const s = this.checker.getSymbolAtLocation(n);
         if (s === symbol || (s && s.valueDeclaration === symbol.valueDeclaration)) {
           // Found a usage!
           this.traceTaint(n, currentPath, sourceFile, publicTaintedProps);
         }
      }
      ts.forEachChild(n, visit);
    };
    visit(scope);
  }

  private tracePropertyUsage(access: ts.PropertyAccessExpression, currentPath: string[], publicTaintedProps: Map<string, string[]>) {
     const symbol = this.checker.getSymbolAtLocation(access); // Symbol of the property
     if (!symbol) return;
     
     // Find the class declaration
     let current: ts.Node = access;
     while (current && !ts.isClassDeclaration(current)) {
       current = current.parent;
     }
     if (!current) return;
     const classDecl = current as ts.ClassDeclaration;

     this.traceClassProperty(classDecl, symbol, currentPath, publicTaintedProps);
  }

  private traceClassProperty(classDecl: ts.ClassDeclaration, symbol: ts.Symbol, currentPath: string[], publicTaintedProps: Map<string, string[]>) {
     // Check visibility: if public (default), add to publicTaintedProps for HTML analysis
     // Getting modifiers from symbol declarations
     const declarations = symbol.getDeclarations();
     let isPublic = true;
     if (declarations && declarations.length > 0) {
        const decl = declarations[0];
        if (ts.canHaveModifiers(decl)) {
            const modifiers = ts.getModifiers(decl);
            if (modifiers && modifiers.some(m => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword)) {
                isPublic = false;
            }
        }
     }

     if (isPublic) {
         publicTaintedProps.set(symbol.name, currentPath);
     }

     // Scan class for usages of this property
     const visit = (n: ts.Node) => {
       if (ts.isPropertyAccessExpression(n)) {
         const s = this.checker.getSymbolAtLocation(n);
         // Compare symbols directly or by declarations
         if (s === symbol || (s && symbol && s.valueDeclaration === symbol.valueDeclaration)) {
             // Avoid infinite recursion if we are analyzing the assignment itself?
             // traceTaint will check parent. Since we are visiting children, n is the usage.
             // But if n is part of the initialization expression?
             // e.g. L = this.locale.getLocale();
             // visit(classDecl) will visit 'L' declaration again?
             // traceTaint handles property access parent.
             this.traceTaint(n, currentPath, n.getSourceFile(), publicTaintedProps);
         }
       }
       ts.forEachChild(n, visit);
     };
     visit(classDecl);
  }


  private getScope(node: ts.Node): ts.Node | undefined {
    let current = node.parent;
    while (current) {
      if (ts.isBlock(current) || ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current) || ts.isSourceFile(current) || ts.isArrowFunction(current)) {
        return current;
      }
      current = current.parent;
    }
    return undefined;
  }

  private addUsage(node: ts.Node, path: string[], sourceFile: ts.SourceFile, kind: I18nUsage['kind'] = 'property_access') {
    // if (path.length === 0) return; // Ignore root object usage -- ALLOW for declaration_delete
    if (path.length === 0 && kind !== 'declaration_delete') return;

    this.usages.push({
      file: sourceFile.fileName,
      start: node.getStart(),
      end: node.getEnd(),
      sourceCode: node.getText(),
      path: path,
      kind: kind
    });
  }

  private addComplexCase(node: ts.Node, reason: string, sourceFile: ts.SourceFile) {
    this.complexCases.push({
      file: sourceFile.fileName,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      code: node.getText(),
      reason
    });
  }
}
