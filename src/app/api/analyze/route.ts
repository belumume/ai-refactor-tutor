// src/app/api/analyze/route.ts

import { NextResponse } from 'next/server';
// Make sure you've run: npm install @anthropic-ai/sdk
import Anthropic from '@anthropic-ai/sdk';

interface AnalyzeRequestBody {
  code: string;
}

interface Suggestion {
  suggestion: string;
  explanation: string;
}

// Reads the key from your .env.local file (e.g., ANTHROPIC_API_KEY=sk-ant-...)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

let anthropic: Anthropic | null = null;
if (ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
  });
} else {
  console.warn("ANTHROPIC_API_KEY not found in environment variables. AI calls will fail.");
}

// --- Use Official API ID for Claude 3.7 Sonnet ---
const ANTHROPIC_MODEL_NAME = "claude-3-7-sonnet-20250219";
// ---

export async function POST(request: Request) {
  console.log(`Received request on /api/analyze (Anthropic - ${ANTHROPIC_MODEL_NAME})`);

  if (!anthropic) {
      console.error("Anthropic client not initialized. Check API Key in .env.local");
      return NextResponse.json({ error: 'AI service not configured. Check API Key setup.' }, { status: 500 });
  }

  try {
    const body: AnalyzeRequestBody = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      console.log("Invalid request body: code is missing or empty.");
      return NextResponse.json({ error: 'Code snippet is required.' }, { status: 400 });
    }

    console.log("Code snippet received:", code.substring(0, 100) + "...");

    const prompt = `
      Analyze the following JavaScript/React code snippet for potential basic refactoring improvements suitable for a beginner learning clean code principles. Focus on readability, maintainability, and common best practices. Do not suggest adding comments or fixing typos unless they significantly impact readability.

      For each suggestion, provide:
      1. A short, actionable suggestion title.
      2. A simple explanation of why the change is beneficial.

      Format the output ONLY as a valid JSON array of objects, where each object has a "suggestion" key and an "explanation" key. Do not include any introductory text, markdown formatting (like \`\`\`json), or closing remarks outside the JSON array itself. For example:
      [
        {"suggestion": "Use 'const' instead of 'let' for 'myVariable'.", "explanation": "'const' is preferred for variables that are not reassigned, improving predictability."},
        {"suggestion": "Extract the calculation logic into a separate function.", "explanation": "Separating concerns makes the code easier to read, test, and reuse."}
      ]

      If no specific refactoring suggestions are applicable or the code is already clean, return an empty JSON array: [].

      Code Snippet:
      \`\`\`javascript
      ${code}
      \`\`\`
    `;

    console.log(`Sending prompt to AI model (${ANTHROPIC_MODEL_NAME})...`);

    let suggestions: Suggestion[] = [];
    try {
      const msg = await anthropic.messages.create({
        model: ANTHROPIC_MODEL_NAME,
        max_tokens: 1024, // Adjust as needed for potentially longer/better suggestions
        messages: [{ role: 'user', content: prompt }],
      });

      // Check for content blocks before accessing text
      const aiText = (msg.content && msg.content.length > 0 && msg.content[0].type === 'text') ? msg.content[0].text : '';
      console.log("Raw AI Response Text:", aiText);

      const trimmedAiText = aiText.trim();
      // Attempt to parse only if it looks like a JSON array
      if (trimmedAiText.startsWith('[') && trimmedAiText.endsWith(']')) {
          try {
             suggestions = JSON.parse(trimmedAiText);
             // Validate structure
             if (!Array.isArray(suggestions) || !suggestions.every(s => typeof s.suggestion === 'string' && typeof s.explanation === 'string')) {
                console.error("Parsed JSON is not the expected array of suggestions.");
                return NextResponse.json({ error: 'AI response format error. Unexpected structure.' }, { status: 500 });
             }
          } catch (parseError) {
             console.error("Failed to parse AI response as JSON:", parseError, "Raw text was:", trimmedAiText);
             return NextResponse.json({ error: 'AI response format error. Failed to parse JSON.' }, { status: 500 });
          }
      } else if (trimmedAiText.length > 0) {
          // Handle cases where the AI returned text, but not the expected JSON array
          console.error("AI response was not a JSON array. Raw text:", trimmedAiText);
          return NextResponse.json({ error: 'AI returned unexpected data format.' }, { status: 500 });
      } else {
          // Handle cases where the AI returned empty text (could be blocked content, etc.)
          console.warn("AI returned empty response text. Stop reason:", msg.stop_reason);
          // Check stop reason; if it's max_tokens, maybe the JSON was cut off.
          if (msg.stop_reason === 'max_tokens') {
             console.error("AI response potentially cut off due to max_tokens limit before completing JSON.");
             return NextResponse.json({ error: 'AI response may be incomplete due to token limits.' }, { status: 500 });
          }
          suggestions = []; // Assume empty if response is empty for other reasons
      }

    } catch (aiError) {
       console.error(`Error calling Anthropic API (${ANTHROPIC_MODEL_NAME}):`, aiError); // Log model name with error
       const message = aiError instanceof Error ? aiError.message : "Unknown AI error";
       // Check if the error indicates the model is invalid/unknown, or quota/billing issues
        if (message.includes('invalid_parameter_error') || message.includes('model is invalid') || message.includes('Invalid model')) {
            return NextResponse.json({ error: `Failed to use AI model '${ANTHROPIC_MODEL_NAME}'. It might be unavailable or the ID is incorrect. Details: ${message}` }, { status: 500 });
       } else if (message.includes('quota') || message.includes('billing')) {
            return NextResponse.json({ error: `AI service quota or billing issue: ${message}` }, { status: 429 }); // 429 Too Many Requests might fit quota
       }
       // Fallback for other errors like overload, connection issues etc.
       return NextResponse.json({ error: `Failed to communicate with AI service: ${message}` }, { status: 502 }); // 502 Bad Gateway might be suitable
    }

    console.log("Suggestions parsed:", suggestions);
    // Success: Return the suggestions
    return NextResponse.json({ suggestions });

  } catch (error) {
    // Catch errors during request parsing or other unexpected issues
    console.error("Error in /api/analyze:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
