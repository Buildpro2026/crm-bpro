"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the current server page on an interval, so request statuses
// stay live while Lee has the company page open.
export function AutoRefresh({ intervalSeconds = 20 }: { intervalSeconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [router, intervalSeconds]);
  return (
    <p className="text-xs text-slate-500">
      Status updates automatically every {intervalSeconds} seconds while this page is open.
    </p>
  );
}
