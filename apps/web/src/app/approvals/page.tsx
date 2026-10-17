'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ApprovalsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/?view=approvals');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-teal-700 font-semibold">
      Loading Approval Center...
    </div>
  );
}
