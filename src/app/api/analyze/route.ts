// src/app/api/analyze/route.ts

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Define structure for suggestions including type and params
interface StructuredSuggestion {
  suggestion?: string; // Suggestion text made optional
  explanation: string;
  type: string;
  params?: { [key: string]: any };
}

// Define expected request body structure
interface AnalyzeRequestBody {
  code: string;
}

// --- Environment Variable and Client Initialization ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
let anthropic: Anthropic | null = null;
if (ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
} else {
  console.warn("ANTHROPIC_API_KEY not found in .env.local. AI analysis will fail.");
}

// --- Define Primary and Fallback Model IDs ---
const PRIMARY_MODEL = "claude-3-7-sonnet-20250219";
const FALLBACK_MODEL = "claude-3-5-sonnet-20241022"; // Use Sonnet 3.5 v2 as fallback

/**
 * Calls the Anthropic API with a specific model and prompt,
 * attempts to parse and validate the structured suggestion response.
 * @param modelName - The name of the Anthropic model to use.
 * @param prompt - The prompt string to send to the model.
 * @returns A promise that resolves to an array of StructuredSuggestion objects.
 * @throws Will throw an error if the API call fails, or if parsing/validation fails.
 */
async function callAnthropicModel(
    modelName: string,
    prompt: string
): Promise<StructuredSuggestion[]> {
    if (!anthropic) {
        console.error("Anthropic client not initialized within callAnthropicModel.");
        // Throw an error that can be caught by the main handler
        throw new Error("Anthropic client not initialized.");
    }

    console.log(`Sending prompt to AI model (${modelName})...`);
    // Let potential API errors (like 529) propagate to the caller
    const msg = await anthropic.messages.create({
        model: modelName,
        max_tokens: 2048, // Max tokens the model can generate
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5 // Lower temperature for more deterministic/structured output
    });

    // Extract text content safely
    const aiText = (msg.content && msg.content.length > 0 && msg.content[0].type === 'text') ? msg.content[0].text : '';
    console.log(`Raw AI Response Text (${modelName}):`, aiText.substring(0, 200) + "..."); // Log truncated raw response

    const trimmedAiText = aiText.trim();

    // Attempt to find a JSON array within the response
    // Handles cases where the model might add introductory/closing text
    const jsonMatch = trimmedAiText.match(/(\[.*\])/s);
    const jsonString = jsonMatch ? jsonMatch[0] : null;

    if (jsonString) {
        try {
            const parsedData = JSON.parse(jsonString);

            // Validate the structure of the parsed data
            if (Array.isArray(parsedData) && (parsedData.length === 0 || parsedData.every(s =>
                // Check required fields and types
                typeof s.explanation === 'string' &&
                typeof s.type === 'string' &&
                // Suggestion is optional, but if present, must be string
                (s.suggestion === undefined || typeof s.suggestion === 'string') &&
                // Params is optional, but if present, must be object
                (s.params === undefined || typeof s.params === 'object')
            ))) {
                console.log(`Structured Suggestions parsed successfully (${modelName}). Count: ${parsedData.length}`);
                // Type assertion after successful validation
                return parsedData as StructuredSuggestion[];
            } else {
                // Log detailed error if structure is invalid
                console.error(`Parsed JSON is not the expected array of StructuredSuggestions (${modelName}). Parsed data sample:`, JSON.stringify(parsedData).substring(0, 200));
                throw new Error(`AI response format error (${modelName}): Parsed JSON structure mismatch.`);
            }
        } catch (parseError) {
            // Log error if JSON parsing fails
            console.error(`Failed to parse extracted JSON string (${modelName}):`, parseError, "Extracted string was:", jsonString.substring(0, 200) + "...");
            throw new Error(`AI response format error (${modelName}): Failed to parse JSON.`);
        }
    } else if (trimmedAiText.length > 0) {
        // Handle cases where the response is non-empty but not a JSON array
        console.warn(`AI response was not a JSON array or couldn't be extracted (${modelName}). Raw text:`, trimmedAiText);
        // Return empty array, assuming AI couldn't provide suggestions in the correct format
        return [];
    } else {
        // Handle cases where the AI returns an empty response
        console.warn(`AI returned empty response text (${modelName}). Stop reason:`, msg.stop_reason);
        return []; // Return empty array for empty response
    }
}

// --- Main API Route Handler ---
export async function POST(request: Request) {
  console.log(`Received request on /api/analyze (Primary: ${PRIMARY_MODEL}, Fallback: ${FALLBACK_MODEL})`);

  // Check if Anthropic client is initialized
  if (!anthropic) {
      console.error("Anthropic client not initialized. Check API Key in .env.local");
      return NextResponse.json({ error: 'AI service not configured.' }, { status: 500 });
  }

  try {
    // Parse request body and validate code snippet
    const body: AnalyzeRequestBody = await request.json();
    const { code } = body;
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
        console.log("Invalid request body: code is missing or empty.");
        return NextResponse.json({ error: 'Code snippet is required.' }, { status: 400 });
    }
    console.log("Code snippet received:", code.substring(0, 100) + "...");

    // --- Define the AI Prompt ---
    // Added clarification for RENAME_VARIABLE params based on previous work
    const prompt = `
      Analyze the following JavaScript/React code snippet for potential basic refactoring improvements suitable for a beginner learning clean code principles. Focus on readability, maintainability, and common best practices like variable naming (camelCase), const/let usage, operator choice, string formatting, and potential use of array methods.

      For each suggestion found, provide:
      1.  "suggestion": A short, actionable, human-readable suggestion title. (Optional, can omit if not applicable)
      2.  "explanation": A simple, human-readable explanation of why the change is beneficial. (Required)
      3.  "type": A machine-readable category string for the suggestion type. Use one of the following exact strings: "RENAME_VARIABLE", "RENAME_FUNCTION", "USE_CONST", "USE_TEMPLATE_LITERAL", "USE_OPERATOR_SHORTCUT", "REPLACE_LOOP_WITH_METHOD", "ADD_VALIDATION", "OTHER". (Required)
      4.  "params": An optional JSON object containing necessary parameters for applying the fix.
          * For "RENAME_VARIABLE" (including object properties): include { "oldName": "variableOrPropertyName", "newName": "...", "variableName": "objectVariableName" (optional, required for property rename precision) }
          * For "RENAME_FUNCTION": include { "oldName": "...", "newName": "..." }
          * For "USE_OPERATOR_SHORTCUT": include { "operator": "+=", "variable": "..." }
          * For "USE_TEMPLATE_LITERAL": include { "originalString": "...", "targetVariable": "..." }
          * For "USE_CONST": include { "variableName": "..." }
          * For "REPLACE_LOOP_WITH_METHOD": include { "loopType": "ForStatement|ForOfStatement|etc", "loopNodeId": "unique_identifier_or_location_info", "arrayVariable": "...", "newFunctionName": "...", "newMethod": "forEach|map|reduce|etc" } (Provide as much detail as possible)
          * For other types, include relevant parameters if applicable, otherwise omit "params".

      Format the output ONLY as a valid JSON array of objects adhering to this structure. Do not include any introductory text, markdown formatting, or closing remarks outside the JSON array itself.

      Example of expected output format:
      [
        {
          "suggestion": "Rename 'sum_val' to 'sumVal'",
          "explanation": "Use camelCase for variable names.",
          "type": "RENAME_VARIABLE",
          "params": { "oldName": "sum_val", "newName": "sumVal" }
        }
      ]

      If no specific refactoring suggestions are applicable or the code is already clean, return an empty JSON array: [].

      Code Snippet:
      \`\`\`javascript
      ${code}
      \`\`\`
    `;
    // --- END PROMPT ---

    let suggestions: StructuredSuggestion[] = [];

    // --- Try Primary Model, Catch for Fallback ---
    try {
        // Attempt primary model first
        suggestions = await callAnthropicModel(PRIMARY_MODEL, prompt);

    } catch (primaryError) {
        console.error(`Error during primary API call (${PRIMARY_MODEL}):`, primaryError);

        // Check if it's likely an overload error (529)
        // NOTE: Relying on message string is fragile. A more robust check would use error.status if available from the SDK error object.
        const isOverloaded = primaryError instanceof Error && primaryError.message.includes('529');

        if (isOverloaded) {
            // --- Fallback Logic ---
            console.warn(`Primary model (${PRIMARY_MODEL}) overloaded (529). Attempting fallback (${FALLBACK_MODEL})...`);
            try {
                // Attempt fallback model (Sonnet 3.5 v2)
                suggestions = await callAnthropicModel(FALLBACK_MODEL, prompt);
                console.log(`Fallback model (${FALLBACK_MODEL}) succeeded.`);
            } catch (fallbackError) {
                // Handle errors specifically from the fallback call
                console.error(`Error during fallback API call (${FALLBACK_MODEL}):`, fallbackError);
                const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Unknown AI error during fallback";
                // Return 502 Bad Gateway if fallback also fails
                return NextResponse.json({ error: `AI service failed on primary (overload) and fallback: ${fallbackMessage}` }, { status: 502 });
            }
            // --- End Fallback Logic ---
        } else {
            // Handle non-overload errors from the primary call
            const message = primaryError instanceof Error ? primaryError.message : "Unknown AI error";
            // Check for other specific error types (e.g., invalid model, quota, connection)
            if (message.includes('invalid_parameter_error') || message.includes('model is invalid') || message.includes('Invalid model')) {
                 return NextResponse.json({ error: `Failed to use primary AI model '${PRIMARY_MODEL}'. Details: ${message}` }, { status: 500 });
            } else if (message.includes('quota') || message.includes('billing')) {
                 return NextResponse.json({ error: `AI service quota or billing issue: ${message}` }, { status: 429 });
            } else if (message.includes('ENOTFOUND') || message.includes('Connection error')) {
                 return NextResponse.json({ error: `Network error connecting to AI service. Please try again later. (Model: ${PRIMARY_MODEL})` }, { status: 504 });
            } else if (message.includes('AI response format error')) {
                 // Handle parsing/validation errors thrown by callAnthropicModel
                 return NextResponse.json({ error: message }, { status: 502 }); // Use 502 Bad Gateway for format errors too
            }
            // Return 502 for other communication errors from primary call
            return NextResponse.json({ error: `Failed to communicate with primary AI service (${PRIMARY_MODEL}): ${message}` }, { status: 502 });
        }
    }
    // --- End Primary Call try...catch ---

    // Return suggestions if either primary or fallback call was successful
    console.log("Final Structured Suggestions returned:", suggestions);
    return NextResponse.json({ suggestions });

  } catch (error) {
      // Catch any unexpected errors in the POST handler itself
      console.error("Unexpected error in /api/analyze:", error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
