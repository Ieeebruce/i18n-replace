"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const variable_renamer_1 = require("../../src/util/variable-renamer");
describe('variable-renamer', () => {
    describe('renameVariable', () => {
        it('should rename a simple variable', () => {
            const sourceCode = `
        let oldName = 10;
        console.log(oldName);
        oldName = 20;
      `;
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'newName');
            expect(result.code).toContain('newName');
            expect(result.code).not.toContain('oldName');
            expect(result.renamedCount).toBe(3);
        });
        it('should rename property access expressions', () => {
            const sourceCode = `
        class MyClass {
          oldName: string = 'test';
          
          method() {
            return this.oldName;
          }
        }
      `;
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'newName');
            expect(result.code).toContain('newName');
            expect(result.code).not.toContain('oldName');
            expect(result.renamedCount).toBe(2); // 属性声明和this访问
        });
        it('should rename function parameters', () => {
            const sourceCode = `
        function test(oldName: string) {
          return oldName.toUpperCase();
        }
        
        const result = test('hello');
      `;
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'newName');
            expect(result.code).toContain('newName');
            expect(result.code).not.toContain('oldName');
            expect(result.renamedCount).toBe(2); // 参数声明和使用
        });
        it('should not rename variables inside strings', () => {
            const sourceCode = `
        let oldName = 'some value';
        const str = 'This is oldName in a string';
        console.log(oldName);
      `;
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'newName');
            expect(result.code).toContain('newName');
            expect(result.code).toContain('oldName'); // 应该保留在字符串中的 oldName
            expect(result.renamedCount).toBe(2); // 变量声明和使用，但不包括字符串中的
        });
        it('should not rename reserved words', () => {
            const sourceCode = 'let value = 10;';
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'value', 'const');
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.code).toBe(sourceCode);
        });
        it('should handle invalid identifiers', () => {
            const sourceCode = 'let oldName = 10;';
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'old-Name', 'newName');
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.code).toBe(sourceCode);
        });
        it('should not rename when old and new names are the same', () => {
            const sourceCode = 'let oldName = 10;';
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'oldName');
            expect(result.code).toBe(sourceCode);
            expect(result.renamedCount).toBe(0);
        });
        it('should rename class properties', () => {
            const sourceCode = `
        class TestClass {
          oldName: string;
          
          constructor() {
            this.oldName = 'value';
          }
          
          getOldName(): string {
            return this.oldName;
          }
        }
      `;
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'newName');
            expect(result.code).toContain('newName');
            expect(result.code).not.toContain('oldName');
            expect(result.renamedCount).toBe(3); // 属性声明、赋值、返回
        });
        it('should rename method names', () => {
            const sourceCode = `
        class TestClass {
          oldName() {
            return 'test';
          }
          
          callOldName() {
            return this.oldName();
          }
        }
      `;
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'newName');
            expect(result.code).toContain('newName');
            expect(result.code).not.toContain('oldName');
            expect(result.renamedCount).toBe(2); // 方法声明和调用
        });
        it('should rename import specifiers', () => {
            const sourceCode = `
        import { oldName } from './module';
        import { something, oldName as alias } from './module';
        
        const value = oldName();
      `;
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'newName');
            expect(result.code).toContain('newName');
            expect(result.code).not.toContain('oldName');
            expect(result.renamedCount).toBe(3); // import、重命名、使用
        });
    });
    describe('renameMultipleVariables', () => {
        it('should rename multiple variables in one pass', () => {
            const sourceCode = `
        let oldName1 = 10;
        let oldName2 = 20;
        console.log(oldName1, oldName2);
      `;
            const renames = {
                'oldName1': 'newName1',
                'oldName2': 'newName2'
            };
            const result = (0, variable_renamer_1.renameMultipleVariables)(sourceCode, renames);
            expect(result.code).toContain('newName1');
            expect(result.code).toContain('newName2');
            expect(result.code).not.toContain('oldName1');
            expect(result.code).not.toContain('oldName2');
            expect(result.renamedCount).toBe(4); // 2 declarations + 2 usages
        });
        it('should handle overlapping variable names correctly', () => {
            const sourceCode = `
        let user = 'test';
        let username = 'value';
        console.log(user, username);
      `;
            const renames = {
                'user': 'person',
                'username': 'personname'
            };
            const result = (0, variable_renamer_1.renameMultipleVariables)(sourceCode, renames);
            expect(result.code).toContain('person');
            expect(result.code).toContain('personname');
            expect(result.code).not.toContain('user');
            expect(result.code).not.toContain('username');
            expect(result.renamedCount).toBe(4); // 2 declarations + 2 usages
        });
    });
    describe('edge cases', () => {
        it('should handle nested scopes correctly', () => {
            const sourceCode = `
        let oldName = 10;
        
        function outer() {
          let oldName = 20; // different scope
          
          function inner() {
            let oldName = 30; // another scope
            return oldName;
          }
          
          return oldName + inner();
        }
        
        console.log(oldName);
      `;
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'newName');
            expect(result.code).toContain('newName');
            expect(result.code).not.toContain('oldName');
            expect(result.renamedCount).toBe(6); // 3 declarations + 3 usages
        });
        it('should rename destructured variables', () => {
            const sourceCode = `
        const { oldName, other } = obj;
        console.log(oldName);
      `;
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'newName');
            expect(result.code).toContain('{ newName, other }');
            expect(result.code).not.toContain('oldName');
            expect(result.renamedCount).toBe(2); // destructuring and usage
        });
        it('should rename array destructuring', () => {
            const sourceCode = `
        const [oldName, second] = arr;
        console.log(oldName);
      `;
            const result = (0, variable_renamer_1.renameVariable)(sourceCode, 'oldName', 'newName');
            expect(result.code).toContain('[newName, second]');
            expect(result.code).not.toContain('oldName');
            expect(result.renamedCount).toBe(2); // destructuring and usage
        });
    });
});
