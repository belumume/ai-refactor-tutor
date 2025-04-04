import React from 'react';
import { Suggestion } from '@/lib/codeAnalysis';
import { getSeverityClass } from '@/lib/codeAnalysis';
import CodeBlock from './CodeBlock';

interface SuggestionItemProps {
  suggestion: Suggestion;
}

const SuggestionItem: React.FC<SuggestionItemProps> = ({ suggestion }) => {
  return (
    <li className="p-3 rounded-md border border-gray-200 dark:border-gray-700">
      <div 
        className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mb-2 ${getSeverityClass(suggestion.severity)}`}
      >
        {suggestion.type.toUpperCase()} - {suggestion.severity.toUpperCase()}
      </div>
      <p className="mb-2">{suggestion.description}</p>
      <div className="mt-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">Line {suggestion.lineNumber}</p>
        <CodeBlock 
          code={suggestion.code}
          language="javascript"
        />
      </div>
    </li>
  );
};

export default SuggestionItem;
