"use client";

import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Check auth and load user's team
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-4 text-3xl font-bold">Dashboard</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-800 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-400">
          Dashboard placeholder - Phase 1 complete
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
          Season state, team info, and game controls will be added in Phase 2-3
        </p>
      </div>
    </div>
  );
}
