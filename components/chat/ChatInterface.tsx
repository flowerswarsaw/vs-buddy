'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

export function ChatInterface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(
      (c) => c.title?.toLowerCase().includes(query) || 'new conversation'.includes(query)
    );
  }, [conversations, searchQuery]);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) throw new Error('Failed to fetch conversations');
      const data = await res.json();
      setConversations(data);
      return data;
    } catch (err) {
      console.error(err);
      setError('Failed to load conversations');
      return [];
    }
  }, []);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/conversations/${conversationId}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create new conversation
  const createConversation = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to create conversation');
      const newConv = await res.json();
      setConversations((prev) => [newConv, ...prev]);
      setSelectedConversationId(newConv.id);
      setMessages([]);
      return newConv;
    } catch (err) {
      console.error(err);
      setError('Failed to create conversation');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Rename conversation
  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error('Failed to rename conversation');
      const updated = await res.json();
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
    } catch (err) {
      console.error(err);
      setError('Failed to rename conversation');
    }
  }, []);

  // Send message with streaming
  const sendMessage = async (content: string) => {
    if (!selectedConversationId || isSending) return;

    setIsSending(true);
    setError(null);

    // Optimistically add user message
    const tempUserMessage: Message = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };

    // Add placeholder for streaming assistant message
    const streamingMessageId = `streaming-${Date.now()}`;
    const tempAssistantMessage: Message = {
      id: streamingMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, tempUserMessage, tempAssistantMessage]);

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConversationId,
          message: content,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message');
      }

      if (!res.body) {
        throw new Error('No response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n').filter((line) => line.startsWith('data: '));

        for (const line of lines) {
          const jsonStr = line.slice(6); // Remove 'data: ' prefix
          try {
            const data = JSON.parse(jsonStr);

            if (data.error) {
              throw new Error(data.error);
            }

            if (data.content) {
              accumulatedContent += data.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingMessageId
                    ? { ...m, content: accumulatedContent }
                    : m
                )
              );
            }

            if (data.messageId) {
              // Finalize the message with real ID
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingMessageId
                    ? { ...m, id: data.messageId, isStreaming: false }
                    : m
                )
              );
            }
          } catch (parseError) {
            // Skip parse errors for incomplete JSON
            if (parseError instanceof Error && parseError.message !== 'Unexpected end of JSON input') {
              console.error('SSE parse error:', parseError);
            }
          }
        }
      }

      // Refresh conversations to update title/timestamp
      fetchConversations();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove optimistic messages on error
      setMessages((prev) =>
        prev.filter((m) => m.id !== tempUserMessage.id && m.id !== streamingMessageId)
      );
    } finally {
      setIsSending(false);
    }
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      const convs = await fetchConversations();
      if (convs.length > 0) {
        setSelectedConversationId(convs[0].id);
        fetchMessages(convs[0].id);
      } else {
        // Create first conversation automatically
        const newConv = await createConversation();
        if (newConv) {
          setSelectedConversationId(newConv.id);
        }
      }
    };
    init();
  }, [fetchConversations, fetchMessages, createConversation]);

  // Close sidebar on mobile after selecting conversation
  const handleSelectConversation = useCallback(
    (id: string) => {
      setSelectedConversationId(id);
      fetchMessages(id);
      // Close sidebar on mobile
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    },
    [fetchMessages]
  );

  return (
    <div className="flex h-screen relative">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
      >
        {sidebarOpen ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed md:relative inset-y-0 left-0 z-40 w-64 flex-shrink-0
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        <ConversationList
          conversations={filteredConversations}
          selectedId={selectedConversationId}
          onSelect={handleSelectConversation}
          onNew={createConversation}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRename={renameConversation}
        />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col md:ml-0">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-2 text-red-700 dark:text-red-300 text-sm">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Messages */}
        <MessageList messages={messages} isLoading={isSending} />

        {/* Input */}
        <MessageInput
          onSend={sendMessage}
          disabled={!selectedConversationId || isSending}
        />
      </div>
    </div>
  );
}
