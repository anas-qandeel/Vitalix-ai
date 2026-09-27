'use client';

import { useAdmin } from '../admin-context';
import FeedbackList from '../FeedbackList';

export default function AdminFeedbackPage() {
  const { role } = useAdmin();

  return (
    <div>
      <div className="max-w-4xl mx-auto p-4">
        <h1 className="text-lg font-bold text-slate-900 mb-4">اقتراحات المستخدمين</h1>
        <FeedbackList isOwner={role === 'owner'} />
      </div>
    </div>
  );
}
