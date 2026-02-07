// Implements: spec/frontend/plan.md#state-management-architecture (["user"] query)
// Implements: spec/frontend/left_panel/account/plan.md#sign-out-flow
//
// Wraps TanStack Query for GET /auth/me with 5min stale time.
// Provides user data, isLoading, isAuthenticated, login(), and logout().

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost, ApiError } from "@/api/client";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";

interface GoogleLoginResponse {
  redirect_url: string;
}

export interface User {
  user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

const USER_STALE_TIME = 5 * 60 * 1000; // 5 minutes

async function fetchCurrentUser(): Promise<User | null> {
  try {
    return await apiGet<User>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: user, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: fetchCurrentUser,
    staleTime: USER_STALE_TIME,
  });

  const isAuthenticated = user != null;

  async function login(referralKey?: string): Promise<void> {
    if (referralKey) {
      // Dev login: bypass OAuth, validate referral key directly
      await apiPost("/auth/dev-login", { referral_key: referralKey });
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      navigate("/");
      return;
    }
    // OAuth flow (requires Google client configured)
    const { redirect_url } = await apiPost<GoogleLoginResponse>(
      "/auth/google",
      {},
    );
    window.location.assign(redirect_url);
  }

  async function logout(): Promise<void> {
    await apiPost("/auth/logout");
    // Clear all query cache
    queryClient.clear();
    // Reset all Zustand stores
    useChatStore.getState().reset();
    useDatasetStore.getState().reset();
    useUiStore.setState({
      leftPanelOpen: true,
      sqlModalOpen: false,
      activeSqlExecutions: [],
      sqlResultModalIndex: null,
      schemaModalDatasetId: null,
    });
    // Navigate to sign-in
    navigate("/sign-in");
  }

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated,
    login,
    logout,
  };
}
