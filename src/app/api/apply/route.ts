// src/app/api/apply/route.ts

import { NextResponse } from 'next/server';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';

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
const getParam = (params: any, key: string): string | undefined => { /* ... */ };

// --- Main Handler ---
export async function POST(request: Request) {
  console.log("--- New Request to /api/apply ---"); // Mark new request

  try {
    const body: ApplyRequestBody = await request.json();
    const { code, suggestion } = body;

    if (!code || typeof code !== 'string') { /* ... validation ... */ }
    if (!suggestion || typeof suggestion.type !== 'string') { /* ... validation ... */ }

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
          errorRecovery: true,
      });
      console.log("[Apply API] AST parsed successfully.");

      const traverseFunc = typeof traverse === 'function' ? traverse : (traverse as any).default;
      const generateFunc = typeof generate === 'function' ? generate : (generate as any).default;
      if (typeof traverseFunc !== 'function') { throw new Error("Babel traverse function could not be resolved."); }
      if (typeof generateFunc !== 'function') { throw new Error("Babel generate function could not be resolved."); }

      console.log("[Apply API] Starting AST traversal...");
      traverseFunc(ast, {
        enter(path: NodePath) {
          // --- Attempt 1: Apply based on suggestion.type ---
          try {
            if (!transformationApplied) {
              const currentType = suggestion.type;
              console.log(`[Apply API] Checking node type: ${path.node.type}, Suggestion type: ${currentType}`); // Log node type

              // --- Handle USE_CONST ---
              if (currentType === 'USE_CONST') {
                  const varNameToChange = getParam(suggestion.params, 'variableName');
                  console.log(`[Apply API] USE_CONST check for var: ${varNameToChange}`);
                  if (varNameToChange && path.isVariableDeclarator() && t.isIdentifier(path.node.id) && path.node.id.name === varNameToChange) {
                      console.log(`[Apply API] USE_CONST: Found declarator for ${varNameToChange}`);
                      const declarationPath = path.findParent((p) => p.isVariableDeclaration());
                      if (declarationPath?.isVariableDeclaration() && declarationPath.node.kind === 'let') {
                          console.log(`[Apply API] USE_CONST: Found parent 'let' declaration`);
                          const binding = path.scope.getBinding(varNameToChange);
                          if (binding?.constant) {
                              console.log(`[Apply API] USE_CONST: Applying change for ${varNameToChange}`);
                              declarationPath.node.kind = 'const';
                              transformationApplied = true;
                              path.stop();
                          } else {
                              console.warn(`[Apply API] USE_CONST: Cannot apply, variable '${varNameToChange}' is reassigned or binding unclear.`);
                          }
                      }
                  }
              }
              // --- Handle RENAME_VARIABLE ---
              else if (currentType === 'RENAME_VARIABLE') {
                  const oldName = getParam(suggestion.params, 'oldName');
                  const newName = getParam(suggestion.params, 'newName');
                  console.log(`[Apply API] RENAME_VARIABLE check for: ${oldName} -> ${newName}`);
                  if (oldName && newName && path.scope?.hasBinding(oldName)) {
                      const binding = path.scope.getBinding(oldName);
                      if (binding?.path.type !== 'FunctionDeclaration') {
                          console.log(`[Apply API] RENAME_VARIABLE: Applying rename for ${oldName}`);
                          path.scope.rename(oldName, newName);
                          transformationApplied = true;
                          path.stop();
                      } else {
                           console.log(`[Apply API] RENAME_VARIABLE: Binding found but it's a function declaration.`);
                      }
                  }
              }
              // --- Handle RENAME_FUNCTION ---
              else if (currentType === 'RENAME_FUNCTION') {
                  const oldFunctionName = getParam(suggestion.params, 'oldName');
                  const newFunctionName = getParam(suggestion.params, 'newName');
                  console.log(`[Apply API] RENAME_FUNCTION check for: ${oldFunctionName} -> ${newFunctionName}`);
                  if (oldFunctionName && newFunctionName && path.isFunctionDeclaration() && path.node.id?.name === oldFunctionName) {
                      console.log(`[Apply API] RENAME_FUNCTION: Found function declaration ${oldFunctionName}`);
                      const scopeToRenameIn = path.scope?.parent ?? path.scope;
                      if (scopeToRenameIn?.hasBinding(oldFunctionName)) {
                           console.log(`[Apply API] RENAME_FUNCTION: Applying rename for ${oldFunctionName}`);
                           scopeToRenameIn.rename(oldFunctionName, newFunctionName);
                           transformationApplied = true;
                           path.stop();
                      } else { console.warn(`[Apply API] RENAME_FUNCTION: Binding not found for function ${oldFunctionName}`); }
                  }
              }
              // --- Handle USE_TEMPLATE_LITERAL ---
              else if (currentType === 'USE_TEMPLATE_LITERAL') {
                 console.log(`[Apply API] USE_TEMPLATE_LITERAL check`);
                 if (path.isCallExpression() && t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.object, { name: "console" }) && t.isIdentifier(path.node.callee.property, { name: "log" })) {
                     const firstArg = path.node.arguments[0];
                     console.log(`[Apply API] USE_TEMPLATE_LITERAL: Found console.log call. Arg type: ${firstArg?.type}`);
                     if (t.isBinaryExpression(firstArg) && firstArg.operator === '+' && t.isStringLiteral(firstArg.left) && t.isIdentifier(firstArg.right)) {
                         console.log(`[Apply API] USE_TEMPLATE_LITERAL: Found "string" + identifier pattern. Applying.`);
                         const quasis = [ t.templateElement({ raw: firstArg.left.value, cooked: firstArg.left.value }), t.templateElement({ raw: '', cooked: '' }, true) ];
                         const expressions = [firstArg.right];
                         path.node.arguments[0] = t.templateLiteral(quasis, expressions);
                         transformationApplied = true;
                         path.stop();
                     }
                 }
              }
              // --- Handle USE_OPERATOR_SHORTCUT ---
              else if (currentType === 'USE_OPERATOR_SHORTCUT') {
                const operator = getParam(suggestion.params, 'operator');
                const variable = getParam(suggestion.params, 'variable');
                console.log(`[Apply API] USE_OPERATOR_SHORTCUT check for var: ${variable}, op: ${operator}`);
                if (operator && variable && path.isAssignmentExpression({ operator: '=' }) &&
                    t.isIdentifier(path.node.left, { name: variable }) &&
                    t.isBinaryExpression(path.node.right) &&
                    t.isIdentifier(path.node.right.left, { name: variable }) &&
                    ((operator === '+=' && path.node.right.operator === '+') || (operator === '-=' && path.node.right.operator === '-') || (operator === '*=' && path.node.right.operator === '*') || (operator === '/=' && path.node.right.operator === '/'))
                   )
                {
                    console.log(`[Apply API] USE_OPERATOR_SHORTCUT: Found pattern for ${variable}. Applying ${operator}.`);
                    path.node.operator = operator;
                    path.node.right = path.node.right.right;
                    transformationApplied = true;
                    path.stop();
                }
              }
            } // end if (!transformationApplied)
          } catch (_typeError) { console.error("[Apply API] Error applying suggestion based on TYPE:", _typeError); }

          // --- Attempt 2: Fallback to Regex on suggestion text ---
          if (!transformationApplied) {
              // Only log if we enter the fallback section
              // console.log("[Apply API] Trying REGEX fallback...");
            try {
              // Regex patterns...
              const variableRenameMatch = suggestion.suggestion.match(/^Rename '(\w+)' .* '(\w+)'/i);
              const functionRenameMatch = suggestion.suggestion.match(/function name instead of '(\w+)'.*like '(\w+)'/i);
              const operatorShortcutMatch = suggestion.suggestion.match(/Replace '(\w+)\s*=\s*\1\s*([\+\-\*\/])\s*(.*?)' with '\1\s*([\+\-\*\/]=)\s*.*'/i);

              if (variableRenameMatch && variableRenameMatch[1] && variableRenameMatch[2]) {
                  const oldName = variableRenameMatch[1];
                  const newName = variableRenameMatch[2];
                   console.log(`[Apply API] REGEX: Matched RENAME_VARIABLE for ${oldName} -> ${newName}`);
                  if (path.scope?.hasBinding(oldName)) { /* ... rename logic ... */ }
              } else if (functionRenameMatch && functionRenameMatch[1] && functionRenameMatch[2]) {
                  const oldFunctionName = functionRenameMatch[1];
                  const newFunctionName = functionRenameMatch[2];
                  console.log(`[Apply API] REGEX: Matched RENAME_FUNCTION for ${oldFunctionName} -> ${newFunctionName}`);
                   if (path.isFunctionDeclaration() && path.node.id?.name === oldFunctionName) { /* ... rename logic ... */ }
              }
              else if (operatorShortcutMatch) {
                  const varName = operatorShortcutMatch[1];
                  const shortcutOperator = operatorShortcutMatch[4];
                  console.log(`[Apply API] REGEX: Matched USE_OPERATOR_SHORTCUT for ${varName} -> ${shortcutOperator}`);
                  if (path.isAssignmentExpression({ operator: '=' }) && /* ... rest of checks ... */) { /* ... apply logic ... */ }
              }
              // --- Add other regex fallbacks here ---

            } catch (_regexError) { console.error("[Apply API] Error applying suggestion based on REGEX:", _regexError); }
          } // end REGEX fallback
        } // End enter()
      }); // End traverseFunc


      if (transformationApplied) { /* ... generate code ... */ }
      else { console.log("[Apply API] AST traversal complete, no modifications applied."); }

    } catch (_transformError) { /* ... handle error ... */ }

    return NextResponse.json({ modifiedCode });

  } catch (_error) { /* ... handle error ... */ }
}
