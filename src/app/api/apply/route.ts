// src/app/api/apply/route.ts

import { NextResponse } from 'next/server';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse'; // Direct default import
import generate from '@babel/generator'; // Direct default import
import * as t from '@babel/types'; // Import all @babel/types as 't'
import type { NodePath } from '@babel/traverse'; // Import NodePath type

// --- Interfaces ---
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
    // Added null check for params
    return (params && typeof params === 'object' && params !== null && typeof params[key] === 'string') ? params[key] : undefined;
};

// --- Main Handler ---
export async function POST(request: Request) {
  console.log("--- New Request to /api/apply ---");

  try {
    const body: ApplyRequestBody = await request.json();
    const { code, suggestion } = body;

    // Validation
    if (!code || typeof code !== 'string') {
       return NextResponse.json({ error: 'Original code snippet is required.' }, { status: 400 });
     }
    // Added null check for suggestion
    if (!suggestion || typeof suggestion.type !== 'string') {
       return NextResponse.json({ error: 'Structured suggestion object with type is required.' }, { status: 400 });
     }

    console.log("[Apply API] Original Code Snippet:", code.substring(0, 100) + "...");
    console.log("[Apply API] Suggestion to Apply:", suggestion.suggestion);
    console.log("[Apply API] Suggestion Type:", suggestion.type);
    console.log("[Apply API] Suggestion Params:", suggestion.params);

    let modifiedCode = code;
    let transformationApplied = false;

    try {
      const ast = babelParser.parse(code, {
          sourceType: "module",
          plugins: ["jsx", "typescript"],
          errorRecovery: true, // Use with caution
      });
      console.log("[Apply API] AST parsed successfully.");

      // --- Determine correct function reference ---
      const traverseFunc = typeof traverse === 'function' ? traverse : (traverse as any).default;
      const generateFunc = typeof generate === 'function' ? generate : (generate as any).default;
      if (typeof traverseFunc !== 'function') { throw new Error("Babel traverse function could not be resolved."); }
      if (typeof generateFunc !== 'function') { throw new Error("Babel generate function could not be resolved."); }
      // --- End function reference check ---

      console.log("[Apply API] Starting AST traversal...");
      traverseFunc(ast, {
        enter(path: NodePath) {
          // --- Attempt 1: Apply based on suggestion.type ---
          try {
            if (!transformationApplied) { // Only attempt if not already applied
              const currentType = suggestion.type;

              // --- Handle USE_CONST ---
              if (currentType === 'USE_CONST') {
                  const varNameToChange = getParam(suggestion.params, 'variableName');
                  if (varNameToChange && path.isVariableDeclarator() && t.isIdentifier(path.node.id) && path.node.id.name === varNameToChange) {
                      const declarationPath = path.findParent((p) => p.isVariableDeclaration());
                      if (declarationPath?.isVariableDeclaration() && declarationPath.node.kind === 'let') {
                          const binding = path.scope.getBinding(varNameToChange);
                          if (binding?.constant) { // Check if it's safe (not reassigned)
                              console.log(`[Apply API] TYPE: Applying USE_CONST for ${varNameToChange}`);
                              declarationPath.node.kind = 'const';
                              transformationApplied = true;
                              path.stop();
                          } else {
                              console.warn(`[Apply API] TYPE: USE_CONST - Cannot apply, variable '${varNameToChange}' is reassigned or binding unclear.`);
                          }
                      }
                  }
              }
              // --- Handle RENAME_VARIABLE ---
              else if (currentType === 'RENAME_VARIABLE') {
                  const oldName = getParam(suggestion.params, 'oldName');
                  const newName = getParam(suggestion.params, 'newName');
                  if (oldName && newName && path.scope?.hasBinding(oldName)) {
                      const binding = path.scope.getBinding(oldName);
                      if (binding?.path.type !== 'FunctionDeclaration') {
                          console.log(`[Apply API] TYPE: Applying RENAME_VARIABLE for ${oldName} -> ${newName}`);
                          path.scope.rename(oldName, newName);
                          transformationApplied = true;
                          path.stop();
                      } else {
                           console.log(`[Apply API] TYPE: RENAME_VARIABLE - Binding found for ${oldName} but it's a function declaration.`);
                      }
                  }
              }
              // --- Handle RENAME_FUNCTION ---
              else if (currentType === 'RENAME_FUNCTION') {
                  const oldFunctionName = getParam(suggestion.params, 'oldName');
                  const newFunctionName = getParam(suggestion.params, 'newName');
                  if (oldFunctionName && newFunctionName && path.isFunctionDeclaration() && path.node.id?.name === oldFunctionName) {
                      console.log(`[Apply API] TYPE: Applying RENAME_FUNCTION for ${oldFunctionName} -> ${newFunctionName}`);
                      const scopeToRenameIn = path.scope?.parent ?? path.scope;
                      if (scopeToRenameIn?.hasBinding(oldFunctionName)) {
                           scopeToRenameIn.rename(oldFunctionName, newFunctionName);
                           transformationApplied = true;
                           path.stop();
                      } else { console.warn(`[Apply API] TYPE: RENAME_FUNCTION - Binding not found for function ${oldFunctionName}`); }
                  }
              }
              // --- Handle USE_TEMPLATE_LITERAL ---
              else if (currentType === 'USE_TEMPLATE_LITERAL') {
                 if (path.isCallExpression() && t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.object, { name: "console" }) && t.isIdentifier(path.node.callee.property, { name: "log" })) {
                     const firstArg = path.node.arguments[0];
                     if (t.isBinaryExpression(firstArg) && firstArg.operator === '+' && t.isStringLiteral(firstArg.left) && t.isIdentifier(firstArg.right)) {
                         console.log(`[Apply API] TYPE: Applying USE_TEMPLATE_LITERAL - Replacing console.log argument ("string" + id)`);
                         const quasis = [ t.templateElement({ raw: firstArg.left.value, cooked: firstArg.left.value }), t.templateElement({ raw: '', cooked: '' }, true) ];
                         const expressions = [firstArg.right];
                         path.node.arguments[0] = t.templateLiteral(quasis, expressions);
                         transformationApplied = true;
                         path.stop();
                     }
                     else if (t.isBinaryExpression(firstArg) && firstArg.operator === '+' && t.isIdentifier(firstArg.left) && t.isStringLiteral(firstArg.right)) {
                         console.log(`[Apply API] TYPE: Applying USE_TEMPLATE_LITERAL - Replacing console.log argument (id + "string")`);
                         const quasis = [ t.templateElement({ raw: '', cooked: '' }), t.templateElement({ raw: firstArg.right.value, cooked: firstArg.right.value }, true) ];
                         const expressions = [firstArg.left];
                         path.node.arguments[0] = t.templateLiteral(quasis, expressions);
                         transformationApplied = true;
                         path.stop();
                     }
                 }
              }
              // --- Handle USE_OPERATOR_SHORTCUT ---
              else if (currentType === 'USE_OPERATOR_SHORTCUT') {
                const operator = getParam(suggestion.params, 'operator'); // e.g., "+="
                const variable = getParam(suggestion.params, 'variable');
                if (operator && variable && path.isAssignmentExpression({ operator: '=' }) &&
                    t.isIdentifier(path.node.left, { name: variable }) &&
                    t.isBinaryExpression(path.node.right) &&
                    t.isIdentifier(path.node.right.left, { name: variable }) &&
                    ((operator === '+=' && path.node.right.operator === '+') || (operator === '-=' && path.node.right.operator === '-') || (operator === '*=' && path.node.right.operator === '*') || (operator === '/=' && path.node.right.operator === '/'))
                   )
                {
                    console.log(`[Apply API] TYPE: Applying USE_OPERATOR_SHORTCUT for '${variable}' to '${operator}'`);
                    path.node.operator = operator as any; // Cast operator string to expected type
                    path.node.right = path.node.right.right; // Assign the right part
                    transformationApplied = true;
                    path.stop();
                }
              }
              // --- Add other type handlers here ---
            } // end if (!transformationApplied)
          } catch (_typeError) { console.error("[Apply API] Error applying suggestion based on TYPE:", _typeError); }

          // --- Attempt 2: Fallback to Regex on suggestion text ---
          if (!transformationApplied) {
            try {
              // Regex patterns...
              const variableRenameMatch = suggestion.suggestion.match(/^Rename '(\w+)' .* '(\w+)'/i);
              const functionRenameMatch = suggestion.suggestion.match(/function name instead of '(\w+)'.*like '(\w+)'/i);
              const operatorShortcutMatch = suggestion.suggestion.match(/Replace '(\w+)\s*=\s*\1\s*([\+\-\*\/])\s*(.*?)' with '\1\s*([\+\-\*\/]=)\s*.*'/i);

              if (variableRenameMatch && variableRenameMatch[1] && variableRenameMatch[2]) {
                  const oldName = variableRenameMatch[1];
                  const newName = variableRenameMatch[2];
                  console.log(`[Apply API] REGEX: Matched RENAME_VARIABLE for ${oldName} -> ${newName}`);
                  // Applying Rename Variable Logic
                  if (path.scope?.hasBinding(oldName)) {
                      const binding = path.scope.getBinding(oldName);
                      if (binding?.path.type !== 'FunctionDeclaration') {
                          console.log(`[Apply API] REGEX: Applying RENAME_VARIABLE for ${oldName}`);
                          path.scope.rename(oldName, newName);
                          transformationApplied = true;
                          path.stop();
                      }
                  }
              } else if (functionRenameMatch && functionRenameMatch[1] && functionRenameMatch[2]) {
                  const oldFunctionName = functionRenameMatch[1];
                  const newFunctionName = functionRenameMatch[2];
                  console.log(`[Apply API] REGEX: Matched RENAME_FUNCTION for ${oldFunctionName} -> ${newFunctionName}`);
                  // Applying Rename Function Logic
                   if (path.isFunctionDeclaration() && path.node.id?.name === oldFunctionName) {
                       const scopeToRenameIn = path.scope?.parent ?? path.scope;
                       if (scopeToRenameIn?.hasBinding(oldFunctionName)) {
                            console.log(`[Apply API] REGEX: Applying RENAME_FUNCTION for ${oldFunctionName}`);
                            scopeToRenameIn.rename(oldFunctionName, newFunctionName);
                            transformationApplied = true;
                            path.stop();
                       } else { console.warn(`[Apply API] REGEX: Binding not found for function ${oldFunctionName}.`); }
                   }
              }
              // --- Handle Operator Shortcut via Regex ---
              else if (operatorShortcutMatch) {
                  const varName = operatorShortcutMatch[1];
                  const shortcutOperator = operatorShortcutMatch[4]; // e.g., "+="
                  console.log(`[Apply API] REGEX: Matched USE_OPERATOR_SHORTCUT for ${varName} -> ${shortcutOperator}`);
                  // Applying Operator Shortcut Logic
                  if (path.isAssignmentExpression({ operator: '=' }) &&
                      t.isIdentifier(path.node.left, { name: varName }) &&
                      t.isBinaryExpression(path.node.right) &&
                      t.isIdentifier(path.node.right.left, { name: varName }) &&
                      ((shortcutOperator === '+=' && path.node.right.operator === '+') || (shortcutOperator === '-=' && path.node.right.operator === '-') || (shortcutOperator === '*=' && path.node.right.operator === '*') || (shortcutOperator === '/=' && path.node.right.operator === '/'))
                     )
                  {
                      console.log(`[Apply API] REGEX: Applying USE_OPERATOR_SHORTCUT for '${varName}' to '${shortcutOperator}'`);
                      path.node.operator = shortcutOperator as any; // Cast needed
                      path.node.right = path.node.right.right;
                      transformationApplied = true;
                      path.stop();
                  }
              }
              // --- Add other regex fallbacks here ---

            } catch (_regexError) { console.error("[Apply API] Error applying suggestion based on REGEX:", _regexError); }
          } // end REGEX fallback
        } // End enter()
      }); // End traverseFunc


      if (transformationApplied) {
        console.log("[Apply API] AST traversal complete, modifications were applied.");
        const output = generateFunc(ast, { retainLines: false, comments: true }, code);
        modifiedCode = output.code;
        console.log("[Apply API] Code generated from modified AST.");
      } else {
         console.log("[Apply API] AST traversal complete, no modifications applied.");
      }

    // --- Catch block for transformation errors ---
    } catch (_transformError) { // Use underscore prefix
      console.error("[Apply API] Error during code parsing or transformation:", _transformError);
      const message = _transformError instanceof Error ? _transformError.message : "Unknown transformation error";
      // Add specific check for Babel import errors
      if (message.includes("not loaded correctly") || message.includes("is not a function")) {
           return NextResponse.json({ error: `Internal Server Error: Problem loading Babel component (${message})` }, { status: 500 });
      }
      return NextResponse.json({ error: `Failed to apply suggestion: ${message}` }, { status: 500 });
    } // --- End transformation try...catch ---

    return NextResponse.json({ modifiedCode });

  // --- Catch block for outer errors (request parsing etc.) ---
  } catch (_error) { // Use underscore prefix
    console.error("[Apply API] Error in /api/apply:", _error);
    const errorMessage = _error instanceof Error ? _error.message : 'An unknown error occurred';
    return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  } // --- End outer try...catch ---
}