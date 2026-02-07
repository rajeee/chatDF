// ChatDFSocket: WebSocket wrapper with reconnect and message parsing.
// Handles connect, reconnect (exponential backoff: 1s, 2s, 4s, max 30s),
// and JSON message parsing + event dispatch to registered callbacks.
//
// Implements: spec/frontend/plan.md#websocket-integration

type MessageCallback = (data: unknown) => void;
type VoidCallback = () => void;
type ErrorCallback = (error: unknown) => void;

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

/**
 * WebSocket client for ChatDF real-time events.
 *
 * Usage:
 *   const socket = new ChatDFSocket();
 *   socket.onMessage((data) => console.log(data));
 *   socket.onOpen(() => console.log("connected"));
 *   socket.connect(token);
 *   // later:
 *   socket.disconnect();
 */
export class ChatDFSocket {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  private messageCallbacks: MessageCallback[] = [];
  private openCallbacks: VoidCallback[] = [];
  private closeCallbacks: VoidCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];

  /**
   * Open a WebSocket connection.
   * Auth is handled via session cookie sent on the upgrade request.
   * An optional token can be passed as a query parameter fallback.
   */
  connect(token?: string): void {
    this.token = token ?? null;
    this.intentionalClose = false;
    this.backoffMs = INITIAL_BACKOFF_MS;
    this.createConnection();
  }

  /**
   * Cleanly close the WebSocket and stop any pending reconnect attempts.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Register a callback for parsed incoming messages.
   * The callback receives the parsed JSON data.
   */
  onMessage(callback: MessageCallback): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * Register a callback fired when the connection opens.
   */
  onOpen(callback: VoidCallback): void {
    this.openCallbacks.push(callback);
  }

  /**
   * Register a callback fired when the connection closes.
   */
  onClose(callback: VoidCallback): void {
    this.closeCallbacks.push(callback);
  }

  /**
   * Register a callback fired on WebSocket errors.
   */
  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  // --- Private ---

  private buildUrl(): string {
    // VITE_WS_URL allows direct WebSocket connection to the backend,
    // bypassing the Vite dev proxy (which doesn't support WS under Bun).
    // In production this is unset, so we fall back to a same-origin
    // relative URL handled by the reverse proxy.
    const wsUrl = import.meta.env.VITE_WS_URL as string | undefined;
    if (wsUrl) {
      return this.token ? `${wsUrl}?token=${this.token}` : wsUrl;
    }
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const base = `${protocol}//${location.host}/ws`;
    return this.token ? `${base}?token=${this.token}` : base;
  }

  private createConnection(): void {
    const url = this.buildUrl();
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.openCallbacks.forEach((cb) => cb());
    };

    this.ws.onclose = () => {
      this.closeCallbacks.forEach((cb) => cb());
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event: unknown) => {
      this.errorCallbacks.forEach((cb) => cb(event));
    };

    this.ws.onmessage = (event: { data: string }) => {
      try {
        const parsed = JSON.parse(event.data);
        this.messageCallbacks.forEach((cb) => cb(parsed));
      } catch {
        // Non-JSON message -- silently ignore (no dispatch, no throw)
      }
    };
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.createConnection();
      // Double the backoff for next time, capped at max
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    }, this.backoffMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
