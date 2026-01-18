import * as fs from 'fs';
import { RefactorManifest, RefactorChange } from '../core/types';
import { info, warn } from '../util/logger';

export class CodeMod {
  
  public async apply(manifest: RefactorManifest) {
    const changesByFile = new Map<string, RefactorChange[]>();
    
    // Group changes
    for (const change of manifest.changes) {
      if (!changesByFile.has(change.file)) {
        changesByFile.set(change.file, []);
      }
      changesByFile.get(change.file)!.push(change);
    }

    // Process each file
    for (const [file, changes] of changesByFile.entries()) {
      try {
        if (!fs.existsSync(file)) {
          warn(`File not found during apply: ${file}`);
          continue;
        }

        let content = fs.readFileSync(file, 'utf8');
        
        // Sort changes by start position in DESCENDING order
        // This is crucial so that replacing later chunks doesn't affect indices of earlier chunks
        changes.sort((a, b) => b.start - a.start);

        for (const change of changes) {
           // Verify context (paranoia check)
           const targetSnippet = content.substring(change.start, change.end);
           // Simple whitespace normalization for check might be needed, but strict check is safer
           if (targetSnippet !== change.originalCode) {
             warn(`Code mismatch in ${file} at ${change.start}. Expected "${change.originalCode}", found "${targetSnippet}". Skipping.`);
             continue;
           }

           const before = content.substring(0, change.start);
           const after = content.substring(change.end);
           content = before + change.newCode + after;
        }

        fs.writeFileSync(file, content, 'utf8');
        info(`Applied ${changes.length} changes to ${file}`);
        
      } catch (e) {
        warn(`Failed to apply changes to ${file}: ${e}`);
      }
    }
  }
}
