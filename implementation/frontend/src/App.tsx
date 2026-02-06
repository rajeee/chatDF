// Implements: spec/frontend/plan.md#routing
//
// React Router v7 with two route entries:
// - /sign-in -> SignIn component (public)
// - / -> ProtectedRoute wrapping AppShell (main three-panel layout)

import { Routes, Route } from "react-router-dom";
import { SignIn } from "@/components/auth/SignIn";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppShell } from "@/components/AppShell";

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
