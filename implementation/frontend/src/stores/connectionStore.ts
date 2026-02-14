import { create } from "zustand";

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

interface ConnectionState {
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
  /** Callback to trigger WebSocket reconnect, set by useWebSocket hook. */
  reconnect: (() => void) | null;
  setReconnect: (fn: (() => void) | null) => void;
}

export const useConnectionStore = create<ConnectionState>()((set) => ({
  status: "disconnected",
  setStatus: (status) => set({ status }),
  reconnect: null,
  setReconnect: (fn) => set({ reconnect: fn }),
}));
