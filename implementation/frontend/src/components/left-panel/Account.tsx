// Implements: spec/frontend/left_panel/account/plan.md
//
// Avatar + name + email display from auth query.
// Sign-out button calling useAuth().logout().

import { useAuth } from "@/hooks/useAuth";

export function Account() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading || !user) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 py-3 px-4 border-t border-gray-200 dark:border-gray-700">
      {/* Avatar */}
      {user.avatar_url ? (
        <img
          data-testid="user-avatar"
          src={user.avatar_url}
          alt={user.name}
          className="w-8 h-8 rounded-full"
        />
      ) : (
        <div
          data-testid="user-avatar-fallback"
          className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Name and email */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{user.name}</div>
        <div className="text-xs opacity-50 truncate">{user.email}</div>
      </div>

      {/* Sign out */}
      <button
        data-testid="sign-out-button"
        onClick={() => void logout()}
        className="text-xs opacity-50 hover:opacity-100 transition-opacity"
      >
        Sign out
      </button>
    </div>
  );
}
