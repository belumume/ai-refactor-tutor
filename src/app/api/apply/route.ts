// src/app/api/apply/route.ts

import { NextResponse } from 'next/server';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
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

    if (!code || typeof code !== 'string') { /* ... */ }
    if (!suggestion || typeof suggestion.type !== 'string') { /* ... */ }

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

      const traverseFunc = typeof traverse === 'function' ? traverse : (traverse as any).default;
      const generateFunc = typeof generate === 'function' ? generate : (generate as any).default;
      if (typeof traverseFunc !== 'function') { throw new Error("Babel traverse function could not be resolved."); }
      if (typeof generateFunc !== 'function') { throw new Error("Babel generate function could not be resolved."); }

      // --- Strategy: Try applying based on TYPE first, then fallback to REGEX on text ---

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
                                  // Do not apply if unsafe
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
                          const scopeToRenameIn = path.scope.parent ?? path.scope; // Prefer parent scope
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
                          // Basic check for "string" + identifier
                          if (t.isBinaryExpression(firstArg) && firstArg.operator === '+' && t.isStringLiteral(firstArg.left) && t.isIdentifier(firstArg.right)) {
                              console.log("Applying TYPE: USE_TEMPLATE_LITERAL - Replacing console.log argument");
                              const quasis = [
                                  t.templateElement({ raw: firstArg.left.value, cooked: firstArg.left.value }),
                                  t.templateElement({ raw: '', cooked: '' }, true) // Tail element
                              ];
                              const expressions = [firstArg.right];
                              path.node.arguments[0] = t.templateLiteral(quasis, expressions);
                              transformationApplied = true;
                              path.stop();
                          }
                          // Add more checks here for identifier + "string" or more complex concatenations if needed
                      }
                  }
                   // --- Add other type handlers here ---

              } // end if (!transformationApplied) for TYPE check
          } catch (typeError) {
              console.error("Error applying suggestion based on TYPE:", typeError);
              // Allow fallback to regex if type-based application failed
          }

          // --- Attempt 2: Fallback to Regex on suggestion text if TYPE didn't work ---
          if (!transformationApplied) {
              try {
                  // Regex for Variable Rename: Rename 'oldName' ... 'newName'
                  const variableRenameMatch = suggestion.suggestion.match(/^Rename '(\w+)' .* '(\w+)'/i);
                  // Regex for Function Rename: ... function name instead of 'oldName'. ... like 'newName'
                  const functionRenameMatch = suggestion.suggestion.match(/function name instead of '(\w+)'.*like '(\w+)'/i);

                  if (variableRenameMatch) {
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
                  } else if (functionRenameMatch) {
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
                   // Add other regex fallbacks here if needed

              } catch (regexError) {
                   console.error("Error applying suggestion based on REGEX:", regexError);
              }
          } // end if (!transformationApplied) for REGEX fallback

        } // End enter()
      }); // End traverseFunc


      if (transformationApplied) {
        console.log("AST traversal complete, modifications were applied.");
        const output = generateFunc(ast, { retainLines: false, comments: true }, code); // Try without retainLines for cleaner output
        modifiedCode = output.code;
        console.log("Code generated from modified AST.");
      } else {
         console.log("AST traversal complete, no modifications applied (suggestion type/regex not handled or target not found).");
      }

    } catch (transformError) { /* ... handle error ... */ }

    return NextResponse.json({ modifiedCode });

  } catch (error) { /* ... handle error ... */ }
}
