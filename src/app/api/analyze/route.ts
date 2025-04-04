// src/app/api/analyze/route.ts

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Define NEW structure for suggestions including type and params
interface StructuredSuggestion {
  suggestion: string; // Human-readable suggestion
  explanation: string; // Human-readable explanation
  type: string; // Machine-readable type (e.g., "RENAME_VARIABLE", "RENAME_FUNCTION")
  params?: { [key: string]: any }; // Optional parameters needed for applying (e.g., { oldName: "x", newName: "y" })
}

// Define expected request body structure
interface AnalyzeRequestBody {
  code: string;
}

// --- Environment Variable and Client Initialization (Keep as before) ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
let anthropic: Anthropic | null = null;
if (ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
} else {
  console.warn("ANTHROPIC_API_KEY not found. AI calls will fail.");
}
const ANTHROPIC_MODEL_NAME = "claude-3-7-sonnet-20250219";
// --- End Initialization ---

export async function POST(request: Request) {
  console.log(`Received request on /api/analyze (Anthropic - ${ANTHROPIC_MODEL_NAME})`);

  // Added check for anthropic client initialization
  if (!anthropic) {
      console.error("Anthropic client not initialized. Check API Key in .env.local");
      return NextResponse.json({ error: 'AI service not configured.' }, { status: 500 });
  }

  try {
    const body: AnalyzeRequestBody = await request.json();
    const { code } = body;
    // Added validation check for code
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      console.log("Invalid request body: code is missing or empty.");
      return NextResponse.json({ error: 'Code snippet is required.' }, { status: 400 });
    }
    console.log("Code snippet received:", code.substring(0, 100) + "...");

    // --- Prompt asking for structured output ---
    const prompt = `
      Analyze the following JavaScript/React code snippet for potential basic refactoring improvements suitable for a beginner learning clean code principles. Focus on readability, maintainability, and common best practices like variable naming (camelCase), const/let usage, operator choice, string formatting, and potential use of array methods.

      For each suggestion found, provide:
      1.  "suggestion": A short, actionable, human-readable suggestion title.
      2.  "explanation": A simple, human-readable explanation of why the change is beneficial.
      3.  "type": A machine-readable category string for the suggestion type. Use one of the following exact strings: "RENAME_VARIABLE", "RENAME_FUNCTION", "USE_CONST", "USE_TEMPLATE_LITERAL", "USE_OPERATOR_SHORTCUT", "REPLACE_LOOP_WITH_METHOD", "ADD_VALIDATION", "OTHER".
      4.  "params": An optional JSON object containing necessary parameters for applying the fix.
          * For "RENAME_VARIABLE" or "RENAME_FUNCTION", include: { "oldName": "...", "newName": "..." }
          * For "USE_OPERATOR_SHORTCUT", include: { "operator": "+=", "variable": "..." }
          * For "USE_TEMPLATE_LITERAL", include: { "originalString": "...", "targetVariable": "..." }
          * For "USE_CONST", include: { "variableName": "..." }
          * For other types, include relevant parameters if applicable, otherwise omit "params".

      Format the output ONLY as a valid JSON array of objects adhering to this structure. Do not include any introductory text, markdown formatting, or closing remarks outside the JSON array itself.

      Example of expected output format:
      [
        {
          "suggestion": "Rename 'sum_val' to 'sumVal'",
          "explanation": "Use camelCase for variable names.",
          "type": "RENAME_VARIABLE",
          "params": { "oldName": "sum_val", "newName": "sumVal" }
        },
        {
          "suggestion": "Use 'const' instead of 'let' for 'item_val'",
          "explanation": "'const' is preferred for variables not reassigned.",
          "type": "USE_CONST",
          "params": { "variableName": "item_val" }
        }
      ]

      If no specific refactoring suggestions are applicable or the code is already clean, return an empty JSON array: [].

      Code Snippet:
      \`\`\`javascript
      ${code}
      \`\`\`
    `;
    // --- END PROMPT ---

    console.log(`Sending prompt to AI model (${ANTHROPIC_MODEL_NAME})...`);
    let suggestions: StructuredSuggestion[] = [];

    try {
      const msg = await anthropic.messages.create({
        model: ANTHROPIC_MODEL_NAME,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5 // Keep lower temperature
      });

      const aiText = (msg.content && msg.content.length > 0 && msg.content[0].type === 'text') ? msg.content[0].text : '';
      console.log("Raw AI Response Text:", aiText);

      const trimmedAiText = aiText.trim();
      if (trimmedAiText.startsWith('[') && trimmedAiText.endsWith(']')) {
          try {
             const parsedData = JSON.parse(trimmedAiText);
             // --- RESTORED DETAILED VALIDATION ---
             if (Array.isArray(parsedData) && parsedData.every(s =>
                 typeof s.suggestion === 'string' &&
                 typeof s.explanation === 'string' &&
                 typeof s.type === 'string' &&
                 (s.params === undefined || typeof s.params === 'object') // params optional or object
             )) {
                suggestions = parsedData as StructuredSuggestion[];
             } else {
                console.error("Parsed JSON is not the expected array of StructuredSuggestions.");
                suggestions = []; // Keep suggestions empty if validation fails
             }
             // --- END RESTORED VALIDATION ---
          } catch (parseError) {
             console.error("Failed to parse AI response as JSON:", parseError, "Raw text was:", trimmedAiText);
             return NextResponse.json({ error: 'AI response format error. Failed to parse JSON.' }, { status: 500 });
          }
      } else if (trimmedAiText.length > 0) {
          console.error("AI response was not a JSON array. Raw text:", trimmedAiText);
          return NextResponse.json({ error: 'AI returned unexpected data format.' }, { status: 500 });
      } else {
          console.warn("AI returned empty response text. Stop reason:", msg.stop_reason);
          suggestions = [];
      }

    } catch (aiError) {
        // ... (Keep existing AI error handling) ...
        console.error(`Error calling Anthropic API (${ANTHROPIC_MODEL_NAME}):`, aiError);
        const message = aiError instanceof Error ? aiError.message : "Unknown AI error";
        if (message.includes('invalid_parameter_error') || message.includes('model is invalid') || message.includes('Invalid model')) {
            return NextResponse.json({ error: `Failed to use AI model '${ANTHROPIC_MODEL_NAME}'. It might be unavailable or the ID is incorrect. Details: ${message}` }, { status: 500 });
       } else if (message.includes('quota') || message.includes('billing')) {
            return NextResponse.json({ error: `AI service quota or billing issue: ${message}` }, { status: 429 });
       }
       return NextResponse.json({ error: `Failed to communicate with AI service: ${message}` }, { status: 502 });
    }

    console.log("Structured Suggestions parsed:", suggestions);
    return NextResponse.json({ suggestions });

  } catch (error) {
      // Added check for outer error handling
      console.error("Error in /api/analyze:", error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
