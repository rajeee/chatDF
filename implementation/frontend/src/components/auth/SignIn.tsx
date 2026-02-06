// Implements: spec/frontend/left_panel/account/plan.md#sign-in-page
//
// Full-screen centered layout with:
// - App logo and title
// - Description text
// - Referral key input
// - "Sign in with Google" button
// - Error display from URL params

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function SignIn() {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [referralKey, setReferralKey] = useState("");

  const errorFromUrl = searchParams.get("error");

  function handleSignIn() {
    login(referralKey || undefined);
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">ChatDF</h1>
          <p className="text-muted-foreground">
            Chat with your data using natural language
          </p>
        </div>

        {errorFromUrl && (
          <div
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded"
            role="alert"
          >
            {errorFromUrl}
          </div>
        )}

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Enter referral key"
            value={referralKey}
            onChange={(e) => setReferralKey(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />

          <button
            type="button"
            onClick={handleSignIn}
            className="w-full px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/90 transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
