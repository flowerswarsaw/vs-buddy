'use client';

import { useState } from 'react';
import { toast } from 'sonner';

interface MessageActionsProps {
  content: string;
  createdAt: string;
}

export function MessageActions({ content, createdAt }: MessageActionsProps) {
  const [showTimestamp, setShowTimestamp] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={handleCopy}
        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
        title="Copy to clipboard"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>
      <button
        onClick={() => setShowTimestamp(!showTimestamp)}
        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
        title="Show timestamp"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      {showTimestamp && (
        <span className="text-xs text-gray-400 ml-1">
          {new Date(createdAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}
