'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ReportsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/?view=reports');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-teal-700 font-semibold">
      Loading Reports...
    </div>
  );
}
