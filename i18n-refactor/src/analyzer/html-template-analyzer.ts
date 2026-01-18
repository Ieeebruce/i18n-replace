// import { parse } from 'angular-html-parser';
import * as fs from 'fs';
import { I18nUsage } from '../core/types';

// Define types locally as angular-html-parser might not export them correctly in CJS/ESM interop
interface Node {
  type: string;
  sourceSpan: { start: { offset: number }, end: { offset: number } };
}

interface Element extends Node {
  type: 'Element';
  name: string;
  attrs: Attribute[];
  children: Node[];
}

interface Attribute extends Node {
  type: 'Attribute';
  name: string;
  value: string;
  valueSpan?: { start: { offset: number }, end: { offset: number } };
}

interface Interpolation extends Node {
  type: 'Interpolation';
  value: string;
  expressions: any[]; // We don't need deep structure for now
}

export class HtmlTemplateAnalyzer {
  
  /**
   * Analyze an HTML template for i18n usages
   * @param filePath Path to the HTML file
   * @param publicProperties Map of public property names in the component to their i18n paths (e.g. 'vm' -> [])
   * @returns List of i18n usages found
   */
  public async analyze(filePath: string, publicProperties: Map<string, string[]>): Promise<I18nUsage[]> {
    if (!fs.existsSync(filePath)) return [];
    
    const content = fs.readFileSync(filePath, 'utf8');
    const imported = await import('angular-html-parser');
    // console.log('Imported parser:', imported);
    const { parse } = imported;
    const result = parse(content);
    // console.log('Parse result keys:', Object.keys(result));
    const { rootNodes } = result;
    
    console.log(`Analyzing HTML: ${filePath}, Props: ${Array.from(publicProperties.keys())}, Nodes: ${rootNodes.length}`);

    const usages: I18nUsage[] = [];
    
    const visit = (node: any) => {
      // console.log(`Visiting node:`, JSON.stringify(node, null, 2));
      // Log keys to understand structure
      // console.log(`Node keys: ${Object.keys(node).join(', ')}, type: ${node.type}, kind: ${node.kind}, name: ${node.name}, value: ${node.value?.substring(0, 20)}`);
      
      const typeName = node.constructor.name;
      
      // Handle Interpolation / BoundText
      // Angular AST might use BoundText for text with {{ }}, or Interpolation class
      if (typeName === 'Interpolation' || typeName === 'BoundText') {
        // console.log(`Found interpolation: "${node.value}"`);
        this.analyzeInterpolation(node as Interpolation, content, publicProperties, usages, filePath);
      } 
      // Handle Element
      else if (typeName === 'Element' || (node.name && node.children)) {
        const element = node as Element;
        // Check attributes (e.g. [title]="vm.title")
        element.attrs.forEach((attr: Attribute) => {
           this.analyzeAttribute(attr, content, publicProperties, usages, filePath);
        });
        if (element.children && element.children.length > 0) {
             element.children.forEach(visit);
        }
      }
      // Handle Text nodes that might contain interpolation (if parser returns them as Text)
      else if (typeName === 'Text') {
          // Check if value contains {{ }}
          if (node.value && node.value.includes('{{')) {
              // Manual interpolation extraction if needed
              // But usually parser handles this. 
              // If we see Text with {{ }}, it means parser didn't treat it as interpolation?
              // angular-html-parser should parse it.
              // Let's treat it as potential interpolation just in case
              this.analyzeInterpolation(node as Interpolation, content, publicProperties, usages, filePath);
          }
      }
    };
    
    rootNodes.forEach(visit);
    return usages;
  }

  private analyzeInterpolation(
    node: Interpolation, 
    content: string, 
    publicProperties: Map<string, string[]>, 
    usages: I18nUsage[],
    filePath: string
  ) {
    const expr = node.value;
    for (const [propName, rootPath] of publicProperties.entries()) {
      // Regex to find the property usage. 
      const regex = new RegExp(`\\b${propName}(\\.[a-zA-Z0-9_]+)+`, 'g');
      let match;
      while ((match = regex.exec(expr)) !== null) {
        console.log(`Match found: ${match[0]}`);
        const fullMatch = match[0];
        const parts = fullMatch.split('.');
        const subPath = parts.slice(1); // ["home", "title"]
        
        // Final i18n path = rootPath + subPath
        const fullI18nPath = [...rootPath, ...subPath];
        
        const interpolationBodyStart = content.indexOf(expr, node.sourceSpan.start.offset);
        if (interpolationBodyStart === -1) continue; 
        
        const absoluteStart = interpolationBodyStart + match.index;
        const absoluteEnd = absoluteStart + fullMatch.length;
        
        usages.push({
          file: filePath,
          start: absoluteStart,
          end: absoluteEnd,
          sourceCode: fullMatch,
          path: fullI18nPath,
          kind: 'interpolation'
        });
      }
    }
  }

  private analyzeAttribute(
    attr: Attribute, 
    content: string, 
    publicProperties: Map<string, string[]>, 
    usages: I18nUsage[],
    filePath: string
  ) {
    // Check for property binding [attr]="expr" or bind-attr="expr"
    // angular-html-parser gives attr.name and attr.value
    // If attr.name starts with '[' or 'bind-', it's an expression.
    // Also *ngIf, *ngFor are expressions.
    
    if (!this.isExpressionAttribute(attr.name)) return;
    
    const expr = attr.value;
    for (const [propName, rootPath] of publicProperties.entries()) {
      const regex = new RegExp(`\\b${propName}(\\.[a-zA-Z0-9_]+)+`, 'g');
      let match;
      while ((match = regex.exec(expr)) !== null) {
        const fullMatch = match[0];
        const parts = fullMatch.split('.');
        const subPath = parts.slice(1);
        const fullI18nPath = [...rootPath, ...subPath];
        
        // attr.valueSpan gives the span of the value
        if (!attr.valueSpan) continue;
        
        const absoluteStart = attr.valueSpan.start.offset + match.index;
        const absoluteEnd = absoluteStart + fullMatch.length;
        
        usages.push({
          file: filePath,
          start: absoluteStart,
          end: absoluteEnd,
          sourceCode: fullMatch,
          path: fullI18nPath,
          kind: 'property_access' // In template attribute
        });
      }
    }
  }

  private isExpressionAttribute(name: string): boolean {
    return name.startsWith('[') || name.startsWith('bind-') || name.startsWith('*') || name.startsWith('(');
  }
}
