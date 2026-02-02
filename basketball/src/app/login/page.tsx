"use client";

import { useState } from "react";
import { signInWithFarcaster } from "~/lib/auth";
import { signInWithEmail } from "~/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFarcasterLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithFarcaster();
      if (result.ok && result.fid) {
        // Redirect to dashboard after successful login
        // FID is stored in localStorage by signInWithFarcaster
        window.location.href = "/dashboard";
      } else {
        setError(result.error || "Farcaster login failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithEmail(email);
      if (result.ok) {
        // Email sent - show success message
        setError(null);
        alert("Check your email for the magic link!");
      } else {
        setError(result.error || "Email login failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 rounded-lg border border-gray-200 bg-white p-8 shadow-lg dark:border-gray-800 dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Basketball Sim</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Sign in to manage your team
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Farcaster Login */}
          <button
            onClick={handleFarcasterLogin}
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in with Farcaster"}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                Or
              </span>
            </div>
          </div>

          {/* Email Login */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="your@email.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full rounded-md bg-gray-600 px-4 py-3 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Sign in with Email"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
