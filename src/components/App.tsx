"use client";

import { useEffect } from "react";
import { useMiniApp } from "@neynar/react";
import { Header } from "~/components/ui/Header";
import { TokenTicker } from "~/components/ui/TokenTicker";
import { Footer } from "~/components/ui/Footer";
import { HomeTab, LeaderboardTab, FeedTab, ActionsTab, ContextTab, WalletTab } from "~/components/ui/tabs";
import { useNeynarUser } from "../hooks/useNeynarUser";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { CreatorGreeting } from "~/components/CreatorGreeting";
import { WelcomePopup } from "~/components/WelcomePopup";

// --- Types ---
export enum Tab {
  Home = "home",
  Leaderboard = "leaderboard",
  Feed = "feed",
  Actions = "actions",
  Context = "context",
  Wallet = "wallet",
}

export interface AppProps {
  title?: string;
}

/**
 * App component serves as the main container for the mini app interface.
 * 
 * This component orchestrates the overall mini app experience by:
 * - Managing tab navigation and state
 * - Handling Farcaster mini app initialization
 * - Coordinating wallet and context state
 * - Providing error handling and loading states
 * - Rendering the appropriate tab content based on user selection
 * 
 * The component integrates with the Neynar SDK for Farcaster functionality
 * and Wagmi for wallet management. It provides a complete mini app
 * experience with multiple tabs for different functionality areas.
 * 
 * Features:
 * - Tab-based navigation (Home, Actions, Context, Wallet)
 * - Farcaster mini app integration
 * - Wallet connection management
 * - Error handling and display
 * - Loading states for async operations
 * 
 * @param props - Component props
 * @param props.title - Optional title for the mini app (defaults to "Catwalk")
 * 
 * @example
 * ```tsx
 * <App title="My Mini App" />
 * ```
 */
export default function App(
  { title: _title }: AppProps = { title: "Catwalk" }
) {
  // --- Hooks ---
  const {
    isSDKLoaded,
    context,
    setInitialTab,
    setActiveTab,
    currentTab,
  } = useMiniApp();

  // --- Neynar user hook ---
  const { user: neynarUser } = useNeynarUser(context || undefined);

  // --- Effects ---
  /**
   * Sets the initial tab to "home" when the SDK is loaded.
   * Also calls sdk.actions.ready() to signal the app is ready to display.
   * 
   * This effect ensures that users start on the home tab when they first
   * load the mini app. It only runs when the SDK is fully loaded to
   * prevent errors during initialization.
   */
  useEffect(() => {
    if (isSDKLoaded) {
      setInitialTab(Tab.Home);
      // Call ready() to signal app is ready (required per Farcaster docs)
      import('@farcaster/miniapp-sdk').then(({ sdk }) => {
        sdk.actions.ready().catch((err) => {
          console.error('Error calling sdk.actions.ready():', err);
        });
      });
    }
  }, [isSDKLoaded, setInitialTab]);

  // --- Early Returns ---
  if (!isSDKLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="spinner h-8 w-8 mx-auto mb-4"></div>
          <p>Loading SDK...</p>
        </div>
      </div>
    );
  }

  // --- Render ---
  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      {/* Creator Greeting Popup */}
      <ErrorBoundary>
        <CreatorGreeting />
      </ErrorBoundary>

      {/* Welcome Popup for Non-Creators */}
      <ErrorBoundary>
        <WelcomePopup />
      </ErrorBoundary>

      {/* Token Ticker at the very top - Hide on Feed tab */}
      {currentTab !== Tab.Feed && (
        <ErrorBoundary>
          <TokenTicker />
        </ErrorBoundary>
      )}
      
      {/* Header section - Hide on Feed tab */}
      {currentTab !== Tab.Feed && (
        <ErrorBoundary>
          <Header neynarUser={neynarUser} />
        </ErrorBoundary>
      )}

      {/* Main content and footer should be centered */}
      <div className="container py-2" style={{ paddingBottom: "80px" }}>
        {/* Main title - hidden for cleaner look */}
        {/* <h1 className="text-2xl font-bold text-center mb-4">{title}</h1> */}

        {/* Tab content rendering with error boundaries */}
        <ErrorBoundary>
          {currentTab === Tab.Home && <HomeTab setActiveTab={setActiveTab} />}
          {currentTab === Tab.Leaderboard && <LeaderboardTab />}
          {currentTab === Tab.Feed && <FeedTab />}
          {currentTab === Tab.Actions && <ActionsTab />}
          {currentTab === Tab.Context && <ContextTab />}
          {currentTab === Tab.Wallet && <WalletTab />}
        </ErrorBoundary>

        {/* Footer with navigation */}
        <ErrorBoundary>
          <Footer activeTab={currentTab as Tab} setActiveTab={setActiveTab} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

