import React from 'react';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'javascript',
  className = '',
}) => {
  return (
    <pre
      className={`bg-gray-100 dark:bg-gray-900 p-3 rounded-md overflow-x-auto text-sm font-mono ${className}`}
      data-language={language}
    >
      <code>{code}</code>
    </pre>
  );
};

export default CodeBlock;
