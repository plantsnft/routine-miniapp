"use client";

import dynamic from "next/dynamic";
import { APP_NAME } from "~/lib/constants";
import { ErrorBoundary } from "~/components/ErrorBoundary";

// note: dynamic import is required for components that use the Frame SDK
const AppComponent = dynamic(() => import("~/components/App"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="spinner h-8 w-8 mx-auto mb-4"></div>
        <p style={{ color: "#c1b400" }}>Loading...</p>
      </div>
    </div>
  ),
});

export default function App(
  { title }: { title?: string } = { title: APP_NAME }
) {
  return (
    <ErrorBoundary>
      <AppComponent title={title} />
    </ErrorBoundary>
  );
}
