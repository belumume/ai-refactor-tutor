// src/app/api/apply/route.ts

import { NextResponse } from 'next/server';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse'; // Direct default import
import generate from '@babel/generator'; // Direct default import
import * as t from '@babel/types'; // Import all @babel/types as 't'

interface StructuredSuggestion {
  suggestion: string;
  explanation: string;
  type: string;
  params?: { [key: string]: any };
}

interface ApplyRequestBody {
  code: string;
  suggestion: StructuredSuggestion;
}

// Helper function to safely get nested properties
const getParam = (params: any, key: string): string | undefined => {
    return (params && typeof params === 'object' && typeof params[key] === 'string') ? params[key] : undefined;
};

export async function POST(request: Request) {
  console.log("Received request on /api/apply");

  try {
    const body: ApplyRequestBody = await request.json();
    const { code, suggestion } = body;

    // Validation
    if (!code || typeof code !== 'string') {
       return NextResponse.json({ error: 'Original code snippet is required.' }, { status: 400 });
     }
    if (!suggestion || typeof suggestion.type !== 'string') {
       return NextResponse.json({ error: 'Structured suggestion object with type is required.' }, { status: 400 });
     }

    console.log("Original Code Snippet:", code.substring(0, 100) + "...");
    console.log("Suggestion to Apply:", suggestion.suggestion);
    console.log("Suggestion Type:", suggestion.type);
    console.log("Suggestion Params:", suggestion.params);

    let modifiedCode = code;
    let transformationApplied = false;

    try {
      const ast = babelParser.parse(code, {
          sourceType: "module",
          plugins: ["jsx", "typescript"],
          errorRecovery: true, // Use with caution
      });
      console.log("AST parsed successfully.");

      // --- Determine correct function reference ---
      const traverseFunc = typeof traverse === 'function' ? traverse : (traverse as any).default;
      const generateFunc = typeof generate === 'function' ? generate : (generate as any).default;
      if (typeof traverseFunc !== 'function') { throw new Error("Babel traverse function could not be resolved."); }
      if (typeof generateFunc !== 'function') { throw new Error("Babel generate function could not be resolved."); }
      // --- End function reference check ---

      traverseFunc(ast, {
        enter(path) {
          // --- Attempt 1: Apply based on suggestion.type ---
          try {
            if (!transformationApplied) { // Only attempt if not already applied
              // --- Handle USE_CONST ---
              if (suggestion.type === 'USE_CONST') {
                  const varNameToChange = getParam(suggestion.params, 'variableName');
                  if (varNameToChange && path.isVariableDeclarator() && t.isIdentifier(path.node.id) && path.node.id.name === varNameToChange) {
                      const declarationPath = path.findParent((p) => p.isVariableDeclaration());
                      if (declarationPath?.isVariableDeclaration() && declarationPath.node.kind === 'let') {
                          const binding = path.scope.getBinding(varNameToChange);
                          if (binding?.constant) { // Check if it's safe (not reassigned)
                              console.log(`Applying TYPE: USE_CONST - Found 'let ${varNameToChange}', changing kind to 'const'`);
                              declarationPath.node.kind = 'const';
                              transformationApplied = true;
                              path.stop();
                          } else {
                              console.warn(`Applying TYPE: USE_CONST - Variable '${varNameToChange}' is reassigned or binding unclear, cannot change 'let' to 'const'.`);
                          }
                      }
                  }
              }
              // --- Handle RENAME_VARIABLE ---
              else if (suggestion.type === 'RENAME_VARIABLE') {
                  const oldName = getParam(suggestion.params, 'oldName');
                  const newName = getParam(suggestion.params, 'newName');
                  if (oldName && newName && path.scope.hasBinding(oldName)) {
                      const binding = path.scope.getBinding(oldName);
                      if (binding?.path.type !== 'FunctionDeclaration') {
                          console.log(`Applying TYPE: RENAME_VARIABLE - Renaming '${oldName}' to '${newName}'`);
                          path.scope.rename(oldName, newName);
                          transformationApplied = true;
                          path.stop();
                      }
                  }
              }
              // --- Handle RENAME_FUNCTION ---
              else if (suggestion.type === 'RENAME_FUNCTION') {
                  const oldFunctionName = getParam(suggestion.params, 'oldName');
                  const newFunctionName = getParam(suggestion.params, 'newName');
                  if (oldFunctionName && newFunctionName && path.isFunctionDeclaration() && path.node.id?.name === oldFunctionName) {
                      console.log(`Applying TYPE: RENAME_FUNCTION - Renaming '${oldFunctionName}' to '${newFunctionName}'`);
                      const scopeToRenameIn = path.scope.parent ?? path.scope;
                      if (scopeToRenameIn.hasBinding(oldFunctionName)) {
                          scopeToRenameIn.rename(oldFunctionName, newFunctionName);
                          transformationApplied = true;
                          path.stop();
                      } else { console.warn(`Binding not found for function ${oldFunctionName}`); }
                  }
              }
              // --- Handle USE_TEMPLATE_LITERAL ---
              else if (suggestion.type === 'USE_TEMPLATE_LITERAL') {
                 if (path.isCallExpression() && t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.object, { name: "console" }) && t.isIdentifier(path.node.callee.property, { name: "log" })) {
                     const firstArg = path.node.arguments[0];
                     if (t.isBinaryExpression(firstArg) && firstArg.operator === '+' && t.isStringLiteral(firstArg.left) && t.isIdentifier(firstArg.right)) {
                         console.log("Applying TYPE: USE_TEMPLATE_LITERAL - Replacing console.log argument");
                         const quasis = [ t.templateElement({ raw: firstArg.left.value, cooked: firstArg.left.value }), t.templateElement({ raw: '', cooked: '' }, true) ];
                         const expressions = [firstArg.right];
                         path.node.arguments[0] = t.templateLiteral(quasis, expressions);
                         transformationApplied = true;
                         path.stop();
                     }
                     // Add checks for identifier + string literal if needed
                 }
              }
              // --- Handle USE_OPERATOR_SHORTCUT ---
              else if (suggestion.type === 'USE_OPERATOR_SHORTCUT') {
                const operator = getParam(suggestion.params, 'operator'); // e.g., "+="
                const variable = getParam(suggestion.params, 'variable');
                if (operator && variable && path.isAssignmentExpression({ operator: '=' }) &&
                    t.isIdentifier(path.node.left, { name: variable }) &&
                    t.isBinaryExpression(path.node.right) &&
                    t.isIdentifier(path.node.right.left, { name: variable }) &&
                    ((operator === '+=' && path.node.right.operator === '+') || (operator === '-=' && path.node.right.operator === '-') || (operator === '*=' && path.node.right.operator === '*') || (operator === '/=' && path.node.right.operator === '/'))
                   )
                {
                    console.log(`Applying TYPE: USE_OPERATOR_SHORTCUT - Changing assignment for '${variable}' to '${operator}'`);
                    path.node.operator = operator; // Change '=' to '+=' etc.
                    path.node.right = path.node.right.right; // Assign the right part
                    transformationApplied = true;
                    path.stop();
                }
              }
              // --- Add other type handlers here ---
            }
          } catch (_typeError) { // Use underscore prefix
              console.error("Error applying suggestion based on TYPE:", _typeError);
          }

          // --- Attempt 2: Fallback to Regex on suggestion text ---
          if (!transformationApplied) {
            try {
              // Regex for Variable Rename
              const variableRenameMatch = suggestion.suggestion.match(/^Rename '(\w+)' .* '(\w+)'/i);
              // Regex for Function Rename
              const functionRenameMatch = suggestion.suggestion.match(/function name instead of '(\w+)'.*like '(\w+)'/i);
              // Regex for Operator Shortcut
              const operatorShortcutMatch = suggestion.suggestion.match(/Replace '(\w+)\s*=\s*\1\s*([\+\-\*\/])\s*(.*?)' with '\1\s*([\+\-\*\/]=)\s*.*'/i);

              if (variableRenameMatch && variableRenameMatch[1] && variableRenameMatch[2]) {
                  const oldName = variableRenameMatch[1];
                  const newName = variableRenameMatch[2];
                  if (path.scope.hasBinding(oldName)) {
                      const binding = path.scope.getBinding(oldName);
                      if (binding?.path.type !== 'FunctionDeclaration') {
                          console.log(`Applying REGEX: RENAME_VARIABLE - Renaming '${oldName}' to '${newName}'`);
                          path.scope.rename(oldName, newName);
                          transformationApplied = true;
                          path.stop();
                      }
                  }
              } else if (functionRenameMatch && functionRenameMatch[1] && functionRenameMatch[2]) {
                  const oldFunctionName = functionRenameMatch[1];
                  const newFunctionName = functionRenameMatch[2];
                   if (path.isFunctionDeclaration() && path.node.id?.name === oldFunctionName) {
                       console.log(`Applying REGEX: RENAME_FUNCTION - Renaming '${oldFunctionName}' to '${newFunctionName}'`);
                       const scopeToRenameIn = path.scope.parent ?? path.scope;
                       if (scopeToRenameIn.hasBinding(oldFunctionName)) {
                            scopeToRenameIn.rename(oldFunctionName, newFunctionName);
                            transformationApplied = true;
                            path.stop();
                       } else { console.warn(`Binding not found for function ${oldFunctionName} via regex.`); }
                   }
              }
              // --- Handle Operator Shortcut via Regex ---
              else if (operatorShortcutMatch) {
                  const varName = operatorShortcutMatch[1];
                  const shortcutOperator = operatorShortcutMatch[4]; // e.g., "+="
                  if (path.isAssignmentExpression({ operator: '=' }) &&
                      t.isIdentifier(path.node.left, { name: varName }) &&
                      t.isBinaryExpression(path.node.right) &&
                      t.isIdentifier(path.node.right.left, { name: varName }) &&
                      ((shortcutOperator === '+=' && path.node.right.operator === '+') || (shortcutOperator === '-=' && path.node.right.operator === '-') || (shortcutOperator === '*=' && path.node.right.operator === '*') || (shortcutOperator === '/=' && path.node.right.operator === '/'))
                     )
                  {
                      console.log(`Applying REGEX: USE_OPERATOR_SHORTCUT - Changing assignment for '${varName}' to '${shortcutOperator}'`);
                      path.node.operator = shortcutOperator;
                      path.node.right = path.node.right.right;
                      transformationApplied = true;
                      path.stop();
                  }
              }
              // --- Add other regex fallbacks here ---

            } catch (_regexError) { // Use underscore prefix
                 console.error("Error applying suggestion based on REGEX:", _regexError);
            }
          } // end REGEX fallback
        } // End enter()
      }); // End traverseFunc


      if (transformationApplied) {
        console.log("AST traversal complete, modifications were applied.");
        const output = generateFunc(ast, { retainLines: false, comments: true }, code);
        modifiedCode = output.code;
        console.log("Code generated from modified AST.");
      } else {
         console.log("AST traversal complete, no modifications applied (suggestion type/regex not handled or target not found).");
      }

    // --- Catch block for transformation errors ---
    } catch (_transformError) { // Use underscore prefix
      console.error("Error during code parsing or transformation:", _transformError);
      const message = _transformError instanceof Error ? _transformError.message : "Unknown transformation error";
      if (message.includes("not loaded correctly")) {
           return NextResponse.json({ error: `Internal Server Error: ${message}` }, { status: 500 });
      }
      return NextResponse.json({ error: `Failed to apply suggestion: ${message}` }, { status: 500 });
    } // --- End transformation try...catch ---

    return NextResponse.json({ modifiedCode });

  // --- Catch block for outer errors (request parsing etc.) ---
  } catch (_error) { // Use underscore prefix
    console.error("Error in /api/apply:", _error);
    const errorMessage = _error instanceof Error ? _error.message : 'An unknown error occurred';
    return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  } // --- End outer try...catch ---
}
