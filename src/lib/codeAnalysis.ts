// Types for code analysis results
export interface Suggestion {
  type: 'performance' | 'readability' | 'security' | 'best-practice';
  description: string;
  lineNumber: number;
  severity: 'low' | 'medium' | 'high';
  code: string;
}

export interface AnalysisResult {
  suggestions: Suggestion[];
  summary: string;
}

// Helper function to count suggestions by type
export function countSuggestionsByType(suggestions: Suggestion[]): Record<string, number> {
  return suggestions.reduce((counts, suggestion) => {
    counts[suggestion.type] = (counts[suggestion.type] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

// Helper function to generate a summary
export function generateSummary(suggestions: Suggestion[]): string {
  const counts = countSuggestionsByType(suggestions);
  const total = suggestions.length;
  
  if (total === 0) {
    return 'No issues found in your code. Great job!';
  }
  
  const countDetails = Object.entries(counts)
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');
  
  return `Code review found ${total} issue${total > 1 ? 's' : ''}: ${countDetails}.`;
}

// Function to get severity class for UI styling
export function getSeverityClass(severity: Suggestion['severity']): string {
  switch (severity) {
    case 'high':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'low':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}
