'use client';

import { useState, useEffect, useCallback } from 'react';
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
}

export function ChatInterface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Send message
  const sendMessage = async (content: string) => {
    if (!selectedConversationId || isSending) return;

    setIsSending(true);
    setError(null);

    // Optimistically add user message
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const res = await fetch('/api/chat', {
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

      const data = await res.json();

      // Replace temp message with real one and add assistant response
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempUserMessage.id);
        return [
          ...filtered,
          { ...tempUserMessage, id: `user-${Date.now()}` },
          data.message,
        ];
      });

      // Refresh conversations to update title/timestamp
      fetchConversations();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
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

  // Handle conversation selection
  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    fetchMessages(id);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0">
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversationId}
          onSelect={handleSelectConversation}
          onNew={createConversation}
          isLoading={isLoading}
        />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
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
