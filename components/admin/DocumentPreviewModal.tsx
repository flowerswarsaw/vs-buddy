'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Chunk {
  id: string;
  content: string;
  createdAt: string;
}

interface DocumentPreview {
  id: string;
  title: string;
  rawText: string;
  tags: string[];
  createdAt: string;
  chunks: Chunk[];
  chunksCount: number;
}

interface DocumentPreviewModalProps {
  documentId: string | null;
  onClose: () => void;
}

export function DocumentPreviewModal({ documentId, onClose }: DocumentPreviewModalProps) {
  const [document, setDocument] = useState<DocumentPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'raw' | 'chunks'>('raw');

  useEffect(() => {
    if (!documentId) {
      setDocument(null);
      return;
    }

    const fetchDocument = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/documents/${documentId}/preview`);
        if (!res.ok) throw new Error('Failed to fetch document');
        const data = await res.json();
        setDocument(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocument();
  }, [documentId]);

  return (
    <Dialog open={!!documentId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isLoading ? 'Loading...' : document?.title || 'Document Preview'}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-2 rounded">
            {error}
          </div>
        )}

        {document && !isLoading && (
          <>
            {/* Metadata */}
            <div className="flex flex-wrap gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{document.chunksCount} chunks</span>
              <span>|</span>
              <span>Created: {new Date(document.createdAt).toLocaleDateString()}</span>
              {document.tags.length > 0 && (
                <>
                  <span>|</span>
                  <span>Tags: {document.tags.join(', ')}</span>
                </>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('raw')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'raw'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Raw Text
              </button>
              <button
                onClick={() => setActiveTab('chunks')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'chunks'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Chunks ({document.chunksCount})
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'raw' ? (
                <pre className="p-4 text-sm whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 rounded">
                  {document.rawText}
                </pre>
              ) : (
                <div className="space-y-4 p-4">
                  {document.chunks.map((chunk, index) => (
                    <div
                      key={chunk.id}
                      className="p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          Chunk {index + 1}
                        </span>
                        <span className="text-xs text-gray-400">
                          {chunk.content.length} chars
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{chunk.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
