"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary } from "~/components/ErrorBoundary";

// Use dynamic import with ssr: false to prevent build-time side effects
// PortalTab uses useMiniApp hook which requires client-side only execution
const PortalTab = dynamic(
  () => import("~/components/ui/tabs/PortalTab").then((mod) => ({ default: mod.PortalTab })),
  {
    ssr: false,
    loading: () => (
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        minHeight: "100vh",
        color: "#ffffff"
      }}>
        <div style={{ textAlign: "center" }}>
          <p>Loading Portal...</p>
        </div>
      </div>
    ),
  }
);

export default function PortalPage() {
  return (
    <ErrorBoundary>
      <PortalTab />
    </ErrorBoundary>
  );
}

