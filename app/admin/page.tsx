'use client';

import { useState } from 'react';
import { SettingsForm } from '@/components/admin/SettingsForm';
import { IngestForm } from '@/components/admin/IngestForm';
import { DocumentList } from '@/components/admin/DocumentList';
import { UserManagement } from '@/components/admin/UserManagement';

export default function AdminPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleIngestSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">VS Buddy Admin</h1>
          <a
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Back to Chat
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <UserManagement />
        <SettingsForm />
        <IngestForm onSuccess={handleIngestSuccess} />
        <DocumentList refreshTrigger={refreshTrigger} />
      </main>
    </div>
  );
}
