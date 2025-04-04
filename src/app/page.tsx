// Add this directive at the very top
"use client";

// Import React hooks for state management
import React, { useState } from 'react';
// Import icons from lucide-react
import { Lightbulb, Info, AlertTriangle, LoaderCircle } from 'lucide-react';

// Define the main App component (typically the page component in Next.js)
export default function App() {
  // State to store the user's input code
  const [inputCode, setInputCode] = useState(
    // Default placeholder code
    `// Paste your code here...\nfunction example() {\n  let count = 0;\n  for(let i=0; i<5; i++) {\n    count += i;\n  }\n  console.log("Sum is: " + count);\n  return count;\n}`
  );
  // State to store the suggestions received from the AI
  const [suggestions, setSuggestions] = useState<Array<{ suggestion: string; explanation: string }> | null>(null);
  // State to track loading status while waiting for AI response
  const [isLoading, setIsLoading] = useState(false);
  // State to store any potential errors during the API call
  const [error, setError] = useState<string | null>(null);

  // --- Handler Function for Button Click ---
  const handleAnalyzeClick = async () => {
    if (isLoading || !inputCode.trim()) return;
    setSuggestions(null);
    setError(null);
    setIsLoading(true);
    console.log("Sending code for analysis:", inputCode);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: inputCode }),
      });

      if (!response.ok) {
        let errorMsg = `HTTP error! Status: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMsg = errorData.error || `Server responded with status ${response.status}`; // Use API error or status
        } catch (e) { /* Ignore if response body is not JSON */ }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      // Ensure suggestions is always an array, even if API returns null/undefined
      setSuggestions(data.suggestions || []);

    } catch (err) {
      console.error("Error analyzing code:", err);
      setError(err instanceof Error ? err.message : "Failed to analyze code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render the UI ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-gray-100 font-sans p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-2">
            AI Code Refactor Tutor
          </h1>
          <p className="text-gray-400 text-sm sm:text-base">
            Paste your JavaScript/React code below to get AI-powered refactoring suggestions.
          </p>
        </header>

        {/* Main Content Area */}
        <main className="space-y-6">

          {/* Code Input Section */}
          <div className="bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6">
            <label htmlFor="codeInput" className="block text-lg font-semibold mb-3 text-gray-300">
              Paste Your Code Snippet:
            </label>
            <textarea
              id="codeInput"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="// Paste your code here..."
              className="w-full h-48 sm:h-64 p-3 bg-gray-900 text-gray-200 border border-gray-700 rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none font-mono text-sm resize-none shadow-inner"
              spellCheck="false"
            />

            <button
              onClick={handleAnalyzeClick}
              disabled={isLoading || !inputCode.trim()}
              className={`
                mt-4 w-full sm:w-auto px-6 py-2.5 rounded-md font-semibold transition-all duration-200 ease-in-out
                flex items-center justify-center space-x-2 text-base
                ${isLoading
                  ? 'bg-gray-600 cursor-not-allowed'
                  : !inputCode.trim()
                    ? 'bg-gray-500 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg transform hover:-translate-y-0.5'
                }
              `}
            >
              {isLoading ? (
                <>
                  <LoaderCircle className="animate-spin h-5 w-5 mr-2" />
                  Analyzing...
                </>
              ) : (
                'Analyze Code'
              )}
            </button>
          </div>

          {/* --- Status/Results Area --- */}
          <div className="mt-6">
            {/* Loading State */}
            {isLoading && (
              <div className="flex justify-center items-center space-x-2 text-lg text-cyan-400 py-6">
                  <LoaderCircle className="animate-spin h-6 w-6" />
                  <span>Thinking... Please wait.</span>
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="bg-red-900/50 border border-red-700 text-red-100 px-4 py-3 rounded-lg shadow-lg flex items-start space-x-3" role="alert">
                <AlertTriangle className="h-5 w-5 text-red-300 mt-0.5 flex-shrink-0" />
                <div>
                    <strong className="font-bold block">Error Analyzing Code:</strong>
                    <span>{error}</span>
                </div>
              </div>
            )}

            {/* Suggestions Display Section */}
            {suggestions && !isLoading && !error && (
              <div className="bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-200 border-b border-gray-700 pb-2">
                  Suggestions:
                </h2>
                {suggestions.length > 0 ? (
                  <ul className="space-y-5">
                    {suggestions.map((item, index) => (
                      <li key={index} className="bg-gray-700/60 p-4 rounded-lg border border-gray-600 shadow-md transition hover:border-cyan-500/50">
                        {/* Suggestion Title with Icon */}
                        <div className="flex items-center space-x-2 mb-2">
                           <Lightbulb className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                           <p className="font-semibold text-cyan-300 text-base">{item.suggestion}</p>
                        </div>
                        {/* Explanation with Icon */}
                        <div className="flex items-start space-x-2 pl-1">
                           {/* <Info className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" /> */}
                           <p className="text-gray-300 text-sm leading-relaxed">{item.explanation}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  // Message when AI returns no suggestions
                  <div className="flex items-center space-x-2 text-gray-400 p-3 bg-gray-700/50 rounded-md border border-gray-600">
                     <Info className="h-5 w-5 flex-shrink-0" />
                     <p>No specific refactoring suggestions found for this code snippet. It might already be quite clean!</p>
                  </div>
                )}
              </div>
            )}
           </div> {/* End Status/Results Area */}

        </main>

        {/* Footer */}
        <footer className="text-center mt-12 text-gray-500 text-xs">
          Built for the Next.js Hackathon
        </footer>
      </div>
    </div>
  );
}
