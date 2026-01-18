import * as ts from 'typescript';
import * as fs from 'fs';
import { info, warn } from '../util/logger';

export class ComponentInjectTransformer {
    constructor(
        private serviceName: string = 'I18nLocaleService',
        private serviceVarName: string = 'i18n',
        private pipeName: string = 'I18nPipe',
        private importPath: string = '../../i18n' // This might need to be dynamic relative to file
    ) {}

    public processFile(filePath: string) {
        if (!fs.existsSync(filePath)) return;
        const sourceCode = fs.readFileSync(filePath, 'utf8');
        const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);

        let newCode = sourceCode;

        // 1. Add Imports
        newCode = this.addImports(newCode, sourceFile);
        
        // Re-parse to get updated AST positions
        const updatedSourceFile = ts.createSourceFile(filePath, newCode, ts.ScriptTarget.Latest, true);

        // 2. Inject Service in Constructor & Add Pipe to Imports
        newCode = this.modifyComponentClass(newCode, updatedSourceFile);

        if (newCode !== sourceCode) {
            fs.writeFileSync(filePath, newCode, 'utf8');
            info(`Injected i18n service and pipe into ${filePath}`);
        }
    }

    private addImports(code: string, sourceFile: ts.SourceFile): string {
        let hasServiceImport = false;
        let hasPipeImport = false;
        
        // Use AST to find existing imports
        ts.forEachChild(sourceFile, node => {
            if (ts.isImportDeclaration(node)) {
                const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
                // Assuming path normalization or checking against config might be needed
                // For now, we check if the import *contains* our services/pipes
                if (node.importClause && node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                     node.importClause.namedBindings.elements.forEach(el => {
                         if (el.name.text === this.serviceName) hasServiceImport = true;
                         if (el.name.text === this.pipeName) hasPipeImport = true;
                     });
                }
            }
        });

        if (hasServiceImport && hasPipeImport) return code;

        // Try to update existing import that matches the path
        const importRegex = new RegExp(`import\\s*{([^}]*)}\\s*from\\s*['"]${this.importPath.replace(/\./g, '\\.')}['"]`);
        const match = code.match(importRegex);
        
        if (match) {
            const currentImports = match[1].split(',').map(s => s.trim()).filter(s => s);
            if (!currentImports.includes(this.serviceName)) currentImports.push(this.serviceName);
            if (!currentImports.includes(this.pipeName)) currentImports.push(this.pipeName);
            
            const newImportStmt = `import { ${currentImports.join(', ')} } from '${this.importPath}'`;
            code = code.replace(match[0], newImportStmt);
        } else {
            // Add new import at top
            const newImport = `import { ${this.serviceName}, ${this.pipeName} } from '${this.importPath}';\n`;
            code = newImport + code;
        }

        return code;
    }

    private modifyComponentClass(code: string, sourceFile: ts.SourceFile): string {
        let result = code;
        
        // Find Component Class
        ts.forEachChild(sourceFile, node => {
            if (ts.isClassDeclaration(node)) {
                const decorators = ts.getDecorators(node);
                const isComponent = decorators?.some(d => 
                    ts.isCallExpression(d.expression) && 
                    ts.isIdentifier(d.expression.expression) && 
                    d.expression.expression.text === 'Component'
                );

                if (isComponent) {
                    // 1. Add Pipe to Imports in Component Decorator
                    // Note: decorators[0] assumption is risky if multiple decorators, but standard for Component
                    // We should find the specific Component decorator
                    const componentDecorator = decorators!.find(d => 
                        ts.isCallExpression(d.expression) && 
                        ts.isIdentifier(d.expression.expression) && 
                        d.expression.expression.text === 'Component'
                    );
                    
                    if (componentDecorator) {
                        result = this.addPipeToComponentImports(result, componentDecorator);
                    }

                    // 2. Inject Service in Constructor
                    result = this.injectServiceInConstructor(result, node);
                }
            }
        });
        
        return result;
    }

    private addPipeToComponentImports(code: string, decorator: ts.Decorator): string {
        if (!ts.isCallExpression(decorator.expression) || decorator.expression.arguments.length === 0) return code;
        
        const metadata = decorator.expression.arguments[0];
        if (!ts.isObjectLiteralExpression(metadata)) return code;

        const importsProp = metadata.properties.find(p => 
            ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'imports'
        ) as ts.PropertyAssignment;

        if (importsProp && ts.isArrayLiteralExpression(importsProp.initializer)) {
            // Check if Pipe is already there
            const hasPipe = importsProp.initializer.elements.some(e => 
                ts.isIdentifier(e) && e.text === this.pipeName
            );
            
            if (!hasPipe) {
                // Insert Pipe
                const closeBracketPos = importsProp.initializer.end - 1;
                // Determine if we need a comma
                const hasElements = importsProp.initializer.elements.length > 0;
                const insertStr = (hasElements ? ', ' : '') + this.pipeName;
                code = code.slice(0, closeBracketPos) + insertStr + code.slice(closeBracketPos);
            }
        } else {
            // No imports property? Add it?
            // If standalone is true.
            // Complex to insert property. Skipping for simplicity unless requested.
            // Assuming imports array exists as per examples.
        }
        return code;
    }

    private injectServiceInConstructor(code: string, classDecl: ts.ClassDeclaration): string {
        // Find constructor
        const constructor = classDecl.members.find(m => ts.isConstructorDeclaration(m)) as ts.ConstructorDeclaration | undefined;
        
        if (constructor) {
            // Check if service is already injected
            const hasService = constructor.parameters.some(p => 
                p.name.getText() === this.serviceVarName
            );

            if (!hasService) {
                // Inject it
                // We want: public i18n: I18nLocaleService
                // But wait, user might have 'private locale: I18nLocaleService' already.
                // If so, we should probably rename/alias it or just add ours if we replaced usages with 'this.i18n'
                
                // Our refactor replaced 'this.locale.getLocale()' with 'this.i18n.get()'
                // So we NEED 'this.i18n'.
                
                // If 'i18n' property exists on class?
                const hasI18nProp = classDecl.members.some(m => 
                    ts.isPropertyDeclaration(m) && m.name.getText() === this.serviceVarName
                );
                
                // If prop exists (e.g. 'i18n: any'), we might want to remove it or replace it with constructor param?
                // The examples showed 'i18n: any' property being added manually by me earlier? Or existing?
                // In data-table example, 'i18n: any' was there.
                // We should remove explicit property declaration if we inject it public in constructor.
                
                // Let's add parameter to constructor.
                const paramStr = `public ${this.serviceVarName}: ${this.serviceName}`;
                const openParenPos = constructor.parameters.pos; // This might include whitespace
                // Better: constructor.parameters.end if length > 0, else constructor.pos + ...
                // Safe way: find 'constructor(' in string? No.
                
                // If parameters exist, append.
                if (constructor.parameters.length > 0) {
                     const lastParam = constructor.parameters[constructor.parameters.length - 1];
                     code = code.slice(0, lastParam.end) + `, ${paramStr}` + code.slice(lastParam.end);
                } else {
                     // No params. find 'constructor(' and ')'
                     // constructor.body?.pos is start of {
                     // constructor.end is end of }
                     // We need the parenthesis.
                     const text = constructor.getText();
                     const openParenIndex = code.indexOf('(', constructor.pos);
                     const closeParenIndex = code.indexOf(')', openParenIndex);
                     code = code.slice(0, closeParenIndex) + paramStr + code.slice(closeParenIndex);
                }
            }
        } else {
            // No constructor. Create one.
            // Insert at start of class body.
            const classStart = classDecl.members.pos;
            const constructorStr = `\n  constructor(public ${this.serviceVarName}: ${this.serviceName}) {}\n`;
            code = code.slice(0, classStart) + constructorStr + code.slice(classStart);
        }
        
        // Remove 'i18n: any' property if exists
        // We can do this by string replacement if simple
        const propRegex = new RegExp(`\\s*${this.serviceVarName}:\\s*any\\s*;?`);
        code = code.replace(propRegex, '');

        return code;
    }
}