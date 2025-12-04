'use client';

import { useSession, signOut } from 'next-auth/react';

interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  isLoading: boolean;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNew,
  isLoading,
}: ConversationListProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={onNew}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          + New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
            No conversations yet
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <button
                  onClick={() => onSelect(conv.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                    selectedId === conv.id
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-600'
                      : ''
                  }`}
                >
                  <p className="font-medium text-sm truncate">
                    {conv.title || 'New conversation'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700">
        {isAdmin && (
          <div className="px-4 pt-3">
            <a
              href="/admin"
              className="block text-center text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
            >
              Admin Settings
            </a>
          </div>
        )}

        <div className="p-4 space-y-2">
          {session?.user && (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {session.user.name || session.user.email}
              {isAdmin && (
                <span className="ml-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded text-[10px]">
                  Admin
                </span>
              )}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
