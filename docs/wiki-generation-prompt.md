# Role
You are a technical writer expert in documenting developer tools. Your task is to generate a comprehensive README Wiki for the `i18n-refactor` tool based on the provided source code and configuration.

# Context
The `i18n-refactor` tool is a CLI utility designed to refactor Angular applications from a legacy i18n approach (using large JSON objects attached to components) to a modern, service-based i18n approach (using `I18nLocaleService` and `I18nPipe`).

# Source Code Analysis
Please analyze the following key files and concepts:

1.  **Configuration (`omrp.config.json`)**:
    *   `serviceTypeName`: The name of the new service (e.g., `I18nLocaleService`).
    *   `serviceVariableName`: The preferred variable name (e.g., `i18n`).
    *   `dictDir`: Directory containing dictionary files.
    *   `languages`: Supported languages (e.g., `['zh', 'en']`).

2.  **Modes (`src/runner/mode-dispatcher.ts`)**:
    *   `replace`: Main mode. Scans components, identifies aliases (e.g., `this.app = this.i18n.getLocale().app`), replaces usage with `this.i18n.get('app.title')`, and injects the service/pipe.
    *   `delete`: Cleanup mode. Removes the old dictionary files or specific keys.
    *   `dict-process`: Processes dictionary files (e.g., merging, formatting).
    *   `inject-i18n`: Standalone mode to inject `I18nLocaleService` and `I18nPipe` into components without full refactoring. Includes `report` (check status) and `fix` (apply changes) sub-modes.

3.  **Key Features**:
    *   **Smart Alias Resolution**: Identifies variables that are aliases to i18n data (even via object spread `...` or inheritance) and replaces them with safe `.get()` calls.
    *   **HTML Template Refactoring**: Automatically replaces `{{ app.title }}` with `{{ 'app.title' | i18n }}`.
    *   **Safety Checks**: Preserves non-i18n usages (e.g., `this.formGroup.get` is NOT replaced).
    *   **Code Pruning**: Removes unused alias definitions after refactoring.

# Output Requirements
Generate a `README.md` (or Wiki page) with the following structure:

1.  **Introduction**: What is this tool and why use it?
2.  **Installation**: How to set it up (e.g., `npm install`, `npm run build`).
3.  **Configuration**: Explanation of `omrp.config.json` fields.
4.  **Usage Guide**:
    *   Command line syntax.
    *   Detailed explanation of each mode (`replace`, `delete`, `dict-process`, `inject-i18n`).
    *   Examples of before/after code.
5.  **Best Practices**:
    *   Backup before running.
    *   Run `report` mode first.
    *   Check `omrp.config.json` defaults.
6.  **Troubleshooting**: Common issues (e.g., "Cannot find module").

# Style Guidelines
*   Use clear, professional English (or Chinese if requested).
*   Use code blocks for examples.
*   Highlight warnings and critical steps.
