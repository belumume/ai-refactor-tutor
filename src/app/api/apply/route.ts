// src/app/api/apply/route.ts

import { NextResponse } from 'next/server';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse'; // Direct default import
import generate from '@babel/generator'; // Direct default import
import * as t from '@babel/types'; // Import all @babel/types as 't'
import type { NodePath } from '@babel/traverse'; // Import NodePath type

// --- Interfaces ---
interface StructuredSuggestion {
  suggestion?: string; // Optional: user-facing text (used for Regex fallback)
  explanation: string;
  type: string; // e.g., "RENAME_VARIABLE", "USE_CONST"
  params?: { [key: string]: any }; // Parameters needed for the transformation
}
interface ApplyRequestBody {
  code: string;
  suggestion: StructuredSuggestion;
}

// Helper function to safely get string properties from suggestion params
const getParam = (params: any, key: string): string | undefined => {
    // Ensure params is an object and the key exists and is a string
    return (params && typeof params === 'object' && params !== null && typeof params[key] === 'string') ? params[key] : undefined;
};

// --- Main API Route Handler ---
export async function POST(request: Request) {
  console.log("--- New Request to /api/apply ---");

  try {
    // Parse the request body
    const body: ApplyRequestBody = await request.json();
    const { code, suggestion } = body;

    // --- Input Validation ---
    if (!code || typeof code !== 'string') {
       console.error("[Apply API] Error: Original code snippet is missing or invalid.");
       return NextResponse.json({ error: 'Original code snippet is required.' }, { status: 400 });
     }
    // Suggestion object validation
    if (!suggestion || typeof suggestion !== 'object' || typeof suggestion.type !== 'string') {
       console.error("[Apply API] Error: Structured suggestion object is missing or invalid.");
       return NextResponse.json({ error: 'Structured suggestion object with type is required.' }, { status: 400 });
     }
    // --- End Validation ---

    console.log("[Apply API] Original Code Snippet:", code.substring(0, 100) + "...");
    console.log("[Apply API] Suggestion Text:", suggestion.suggestion); // Log suggestion text
    console.log("[Apply API] Suggestion Type:", suggestion.type);
    console.log("[Apply API] Suggestion Params:", suggestion.params);

    let modifiedCode = code; // Default to original code
    // Flag to track if any primary transformation was successful (Definition rename, simple rename, etc.)
    // This helps prevent lower-priority logic (like regex fallback) from running if a higher-priority one succeeded.
    let transformationApplied = false;

    try {
      // --- Parse Code to AST ---
      const ast = babelParser.parse(code, {
          sourceType: "module", // Assume ES modules
          plugins: ["jsx", "typescript"], // Enable necessary Babel plugins
          errorRecovery: true, // Attempt to parse even with minor errors (use cautiously)
      });
      console.log("[Apply API] AST parsed successfully.");

      // --- Resolve Babel Helper Functions ---
      const traverseFunc = typeof traverse === 'function' ? traverse : (traverse as any).default;
      const generateFunc = typeof generate === 'function' ? generate : (generate as any).default;
      if (typeof traverseFunc !== 'function') { throw new Error("Babel traverse function could not be resolved."); }
      if (typeof generateFunc !== 'function') { throw new Error("Babel generate function could not be resolved."); }
      // --- End Babel Helper Check ---

      console.log("[Apply API] Starting AST traversal...");
      // --- Traverse the AST to find nodes and apply transformations ---
      traverseFunc(ast, {
        // --- Visitor for Member Expressions (Handles Object Property Renames - Usages) ---
        // Targets nodes like `object.property` (the usage of a property)
        MemberExpression(path: NodePath<t.MemberExpression>) {
            // FIX: Removed !transformationApplied check here to allow independent execution
            if (suggestion.type === 'RENAME_VARIABLE') {
                const oldName = getParam(suggestion.params, 'oldName');
                const newName = getParam(suggestion.params, 'newName');
                const variableName = getParam(suggestion.params, 'variableName');

                // Check if property is an identifier matching oldName
                if (oldName && newName && t.isIdentifier(path.node.property) && path.node.property.name === oldName) {
                    // Check if object name matches if variableName was provided
                    const objectMatches = !variableName || (t.isIdentifier(path.node.object) && path.node.object.name === variableName);

                    if (objectMatches) {
                        const targetName = variableName ? `${variableName}.${oldName}` : `*.${oldName}`;
                        console.log(`[Apply API] TYPE (MemberExpr): Found property usage ${targetName} to rename to ${newName}.`);
                        try {
                            path.node.property.name = newName; // Modify the property identifier's name
                            // FIX: Set flag on successful usage rename
                            // Note: This might cause the 'enter' visitor to skip other unrelated fixes if this runs first.
                            // Consider if this flag should only be set by definition renames or other primary actions.
                            // For now, setting it here ensures 'enter' and 'regex' don't run after *any* part of property rename succeeds.
                            transformationApplied = true;
                            console.log(`[Apply API] TYPE (MemberExpr): Renamed property usage ${targetName} to ${newName}.`);
                            // No path.skip() here, allow traversal to continue (e.g., nested member expressions)
                        } catch (renameError) {
                             console.error(`[Apply API] TYPE (MemberExpr): Error renaming property usage ${oldName} to ${newName}:`, renameError);
                        }
                    } else {
                         const actualObjectName = t.isIdentifier(path.node.object) ? path.node.object.name : '[Non-Identifier Object]';
                         console.log(`[Apply API] TYPE (MemberExpr): Found property usage ${oldName} on object '${actualObjectName}', but object name does not match expected '${variableName}'. Skipping.`);
                    }
                }
            }
        },
        // --- End MemberExpression Visitor ---

        // --- Visitor for Object Properties (Handles Object Property Renames - Definitions) ---
        // Targets nodes like `key: value` within an object literal `{}`
        ObjectProperty(path: NodePath<t.ObjectProperty>) {
             // FIX: Removed !transformationApplied check here to allow independent execution
             if (suggestion.type === 'RENAME_VARIABLE') {
                const oldName = getParam(suggestion.params, 'oldName'); // Property key name
                const newName = getParam(suggestion.params, 'newName'); // New property key name
                const variableName = getParam(suggestion.params, 'variableName'); // Optional object name

                // Check if key is an Identifier matching oldName
                if (oldName && newName && t.isIdentifier(path.node.key) && path.node.key.name === oldName) {
                    console.log(`[Apply API] TYPE (ObjProp): Found potential property definition key '${oldName}' to rename.`);
                    // --- Parent Object Check ---
                    let parentObjectMatches = !variableName; // Assume match if variableName not provided
                    if (variableName) {
                        console.log(`[Apply API] TYPE (ObjProp): Checking if parent object is '${variableName}'.`);
                        const declaratorPath = path.findParent((p) => p.isVariableDeclarator());
                        if (declaratorPath?.isVariableDeclarator() && t.isIdentifier(declaratorPath.node.id) && declaratorPath.node.id.name === variableName) {
                            console.log(`[Apply API] TYPE (ObjProp): Parent VariableDeclarator '${variableName}' matched.`);
                            parentObjectMatches = true;
                        } else {
                            const foundParentId = (declaratorPath?.isVariableDeclarator() && t.isIdentifier(declaratorPath.node.id)) ? declaratorPath.node.id.name : 'N/A';
                            console.log(`[Apply API] TYPE (ObjProp): Parent VariableDeclarator check failed (Expected: '${variableName}', Found ID: '${foundParentId}').`);
                            parentObjectMatches = false;
                        }
                    }
                    // --- End Parent Object Check ---

                    if (parentObjectMatches) {
                         console.log(`[Apply API] TYPE (ObjProp): Parent object check passed. Ready to rename key '${oldName}' to '${newName}'.`);
                         // --- Perform Rename ---
                         try {
                             if (t.isIdentifier(path.node.key) && path.node.key.name === oldName) {
                                 path.node.key.name = newName; // Modify the key identifier's name
                                 // FIX: Set flag on successful definition rename
                                 transformationApplied = true;
                                 console.log(`[Apply API] TYPE (ObjProp): Renamed definition key ${oldName} to ${newName}.`);
                                 path.skip(); // Prevent traversing into children (value) after key rename
                             } else {
                                 console.warn(`[Apply API] TYPE (ObjProp): Key name changed unexpectedly before rename. Aborting rename for this node.`);
                             }
                         } catch (renameError) {
                             console.error(`[Apply API] TYPE (ObjProp): Error renaming definition key ${oldName} to ${newName}:`, renameError);
                         }
                         // --- End Perform Rename ---
                    } else {
                         console.log(`[Apply API] TYPE (ObjProp): Parent object check failed for key '${oldName}'. Skipping definition rename.`);
                    }
                }
             }
        },
        // --- End ObjectProperty Visitor ---

        // --- General Enter Visitor (Handles other types and simple variable renames) ---
        // Runs for every node unless skipped/stopped by a specific visitor above
        enter(path: NodePath) {
          // Keep !transformationApplied check here to prevent conflicts with other types
          // if a property rename (usage or definition) already happened.
          if (!transformationApplied) {
            try {
              const currentType = suggestion.type;

              // --- Handle USE_CONST ---
              if (currentType === 'USE_CONST') {
                   const varNameToChange = getParam(suggestion.params, 'variableName');
                   if (varNameToChange && path.isVariableDeclarator() && t.isIdentifier(path.node.id) && path.node.id.name === varNameToChange) {
                       const declarationPath = path.findParent((p) => p.isVariableDeclaration());
                       if (declarationPath?.isVariableDeclaration() && declarationPath.node.kind === 'let') {
                           const binding = path.scope.getBinding(varNameToChange);
                           if (binding?.constant) {
                               console.log(`[Apply API] TYPE (Enter): Applying USE_CONST for ${varNameToChange}`);
                               declarationPath.node.kind = 'const';
                               transformationApplied = true; // Set flag
                               path.stop(); // Stop all traversal
                           } else {
                               console.warn(`[Apply API] TYPE (Enter): USE_CONST - Cannot apply, variable '${varNameToChange}' is reassigned.`);
                           }
                       }
                   }
              }
              // --- Handle RENAME_VARIABLE (Simple Variables/Bindings ONLY) ---
              // This uses scope.rename for simple variables. Should only run if property visitors didn't apply.
              else if (currentType === 'RENAME_VARIABLE') {
                  // Explicitly check it's NOT a property key or member expression property
                  if (!path.isObjectProperty() && !path.isMemberExpression() &&
                      !(path.parentPath?.isMemberExpression() && path.key === 'property') &&
                      !(path.parentPath?.isObjectProperty() && path.key === 'key'))
                  {
                      const oldName = getParam(suggestion.params, 'oldName');
                      const newName = getParam(suggestion.params, 'newName');
                      if (oldName && newName && path.scope?.hasBinding(oldName)) {
                           const binding = path.scope.getBinding(oldName);
                           if (binding?.path.type !== 'FunctionDeclaration') {
                               if (path.scope.hasBinding(oldName) && !path.scope.hasBinding(newName)) {
                                   console.log(`[Apply API] TYPE (Enter/Var): Applying scope RENAME_VARIABLE for ${oldName} -> ${newName}`);
                                   try {
                                       path.scope.rename(oldName, newName);
                                       transformationApplied = true; // Set flag
                                       path.stop(); // Stop all traversal
                                   } catch (renameError) {
                                       console.error(`[Apply API] TYPE (Enter/Var): Error renaming ${oldName} to ${newName}:`, renameError);
                                   }
                               } else {
                                   console.warn(`[Apply API] TYPE (Enter/Var): Cannot rename ${oldName}. Binding conflict or oldName not found.`);
                               }
                           } else {
                               console.log(`[Apply API] TYPE (Enter/Var): RENAME_VARIABLE - Binding for ${oldName} is function.`);
                           }
                      }
                  }
              }
              // --- Handle RENAME_FUNCTION ---
              else if (currentType === 'RENAME_FUNCTION') {
                   const oldFunctionName = getParam(suggestion.params, 'oldName');
                   const newFunctionName = getParam(suggestion.params, 'newName');
                   if (oldFunctionName && newFunctionName && path.isFunctionDeclaration() && path.node.id?.name === oldFunctionName) {
                       const scopeToRenameIn = path.scope?.parent ?? path.scope;
                       if (scopeToRenameIn?.hasBinding(oldFunctionName) && !scopeToRenameIn.hasBinding(newFunctionName)) {
                            console.log(`[Apply API] TYPE (Enter): Applying RENAME_FUNCTION for ${oldFunctionName}`);
                            try {
                                scopeToRenameIn.rename(oldFunctionName, newFunctionName);
                                transformationApplied = true; // Set flag
                                path.stop(); // Stop all traversal
                            } catch (renameError) {
                                 console.error(`[Apply API] TYPE (Enter): Error renaming function ${oldFunctionName}:`, renameError);
                            }
                       } else { console.warn(`[Apply API] TYPE (Enter): RENAME_FUNCTION - Binding conflict/not found for ${oldFunctionName}`); }
                   }
              }
              // --- Handle USE_TEMPLATE_LITERAL ---
              else if (currentType === 'USE_TEMPLATE_LITERAL') {
                  if (path.isCallExpression() && t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.object, { name: "console" }) && t.isIdentifier(path.node.callee.property, { name: "log" })) {
                      // ... (template literal logic remains the same) ...
                      const firstArg = path.node.arguments[0];
                      let templateLiteralMade = false;
                      if (t.isBinaryExpression(firstArg, { operator: '+' }) && t.isStringLiteral(firstArg.left) && t.isIdentifier(firstArg.right)) {
                          console.log(`[Apply API] TYPE (Enter): Applying USE_TEMPLATE_LITERAL ("string" + id)`);
                          const quasis = [ t.templateElement({ raw: firstArg.left.value, cooked: firstArg.left.value }), t.templateElement({ raw: '', cooked: '' }, true) ];
                          path.node.arguments[0] = t.templateLiteral(quasis, [firstArg.right]);
                          templateLiteralMade = true;
                      }
                      else if (t.isBinaryExpression(firstArg, { operator: '+' }) && t.isIdentifier(firstArg.left) && t.isStringLiteral(firstArg.right)) {
                          console.log(`[Apply API] TYPE (Enter): Applying USE_TEMPLATE_LITERAL (id + "string")`);
                          const quasis = [ t.templateElement({ raw: '', cooked: '' }), t.templateElement({ raw: firstArg.right.value, cooked: firstArg.right.value }, true) ];
                          path.node.arguments[0] = t.templateLiteral(quasis, [firstArg.left]);
                          templateLiteralMade = true;
                      }
                      if (templateLiteralMade) {
                          transformationApplied = true; // Set flag
                          path.stop(); // Stop all traversal
                      }
                  }
              }
              // --- Handle USE_OPERATOR_SHORTCUT ---
              else if (currentType === 'USE_OPERATOR_SHORTCUT') {
                 const operator = getParam(suggestion.params, 'operator');
                 const variable = getParam(suggestion.params, 'variable');
                 if (operator && variable && path.isAssignmentExpression({ operator: '=' }) &&
                     t.isIdentifier(path.node.left, { name: variable }) &&
                     t.isBinaryExpression(path.node.right) &&
                     t.isIdentifier(path.node.right.left, { name: variable }) &&
                     ((operator === '+=' && path.node.right.operator === '+') || /* ... other ops ... */ (operator === '/=' && path.node.right.operator === '/'))
                    )
                 {
                     console.log(`[Apply API] TYPE (Enter): Applying USE_OPERATOR_SHORTCUT for '${variable}'`);
                     path.node.operator = operator as any;
                     path.node.right = path.node.right.right;
                     transformationApplied = true; // Set flag
                     path.stop(); // Stop all traversal
                 }
              }
              // --- Add other type handlers here ---

            } catch (_typeError) { console.error("[Apply API] Error applying suggestion based on TYPE in 'enter':", _typeError); }
          } // end if (!transformationApplied) within 'enter'

          // --- Attempt 2: Fallback to Regex ---
          // Keep !transformationApplied check here
          if (!transformationApplied) {
            // Check if suggestion text exists before trying to match
            if (typeof suggestion.suggestion === 'string' && suggestion.suggestion.length > 0) {
                try {
                  // ...(Regex logic remains the same)...
                   const variableRenameMatch = suggestion.suggestion.match(/^Rename '(\w+)' .* '(\w+)'/i);
                   // ... other regex matches ...
                   if (variableRenameMatch && variableRenameMatch[1] && variableRenameMatch[2]) {
                       // ... (regex variable rename logic) ...
                       // Make sure to set transformationApplied = true and path.stop() on success here too
                   } // ... other regex handlers ...

                } catch (_regexError) {
                    console.error("[Apply API] Error applying suggestion based on REGEX:", _regexError);
                }
            } else {
                 console.log("[Apply API] REGEX: Skipping fallback because suggestion.suggestion text is missing.");
            }
          } // end REGEX fallback
        } // End enter()
      }); // End traverseFunc
      // --- End AST Traversal ---

      // --- Generate Code from Modified AST ---
      if (transformationApplied) {
          console.log("[Apply API] AST traversal complete, modification(s) WERE applied.");
      } else {
           console.log("[Apply API] AST traversal complete, NO modifications were applied.");
      }
      // Generate code regardless, reflecting any AST changes made by visitors
      const output = generateFunc(ast, { /* options */ }, code);
      modifiedCode = output.code;
      console.log("[Apply API] Code generated from potentially modified AST.");
      // --- End Code Generation ---

    // --- Catch block for AST parsing or transformation errors ---
    } catch (_transformError) {
       console.error("[Apply API] Error during code parsing or transformation:", _transformError);
       const message = _transformError instanceof Error ? _transformError.message : "Unknown transformation error";
       if (message.includes("not loaded correctly") || message.includes("is not a function")) {
            return NextResponse.json({ error: `Internal Server Error: Problem loading Babel component (${message})` }, { status: 500 });
       }
       return NextResponse.json({ error: `Failed to apply suggestion due to transformation error: ${message}` }, { status: 500 });
    } // --- End transformation try...catch ---

    // --- Return Success Response ---
    return NextResponse.json({ modifiedCode });

  // --- Catch block for outer errors ---
  } catch (_error) {
     console.error("[Apply API] Unexpected error in /api/apply:", _error);
     const errorMessage = _error instanceof Error ? _error.message : 'An unknown error occurred';
     return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  } // --- End outer try...catch ---
}
