// WebSocket mock helper for testing WebSocket interactions.
// Provides a simple class that records sent messages and can push
// messages to the client, without requiring a real WebSocket server.

export interface RecordedMessage {
  data: string;
  timestamp: number;
}

type MessageListener = (event: { data: string }) => void;
type ConnectionListener = () => void;

/**
 * A mock WebSocket that records outgoing messages and allows
 * tests to push incoming messages.
 *
 * Usage in tests:
 *   const ws = new MockWebSocket("ws://localhost/ws");
 *   ws.simulateOpen();
 *   ws.simulateMessage({ type: "chat_token", token: "Hi", message_id: "msg-1" });
 *   expect(ws.sentMessages).toHaveLength(1);
 */
export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  sentMessages: RecordedMessage[] = [];

  private _onopen: ConnectionListener | null = null;
  private _onclose: ConnectionListener | null = null;
  private _onmessage: MessageListener | null = null;
  private _onerror: ((event: unknown) => void) | null = null;

  private messageListeners: MessageListener[] = [];
  private openListeners: ConnectionListener[] = [];
  private closeListeners: ConnectionListener[] = [];
  private errorListeners: ((event: unknown) => void)[] = [];

  constructor(url: string) {
    this.url = url;
  }

  set onopen(fn: ConnectionListener | null) {
    this._onopen = fn;
  }
  get onopen(): ConnectionListener | null {
    return this._onopen;
  }

  set onclose(fn: ConnectionListener | null) {
    this._onclose = fn;
  }
  get onclose(): ConnectionListener | null {
    return this._onclose;
  }

  set onmessage(fn: MessageListener | null) {
    this._onmessage = fn;
  }
  get onmessage(): MessageListener | null {
    return this._onmessage;
  }

  set onerror(fn: ((event: unknown) => void) | null) {
    this._onerror = fn;
  }
  get onerror(): ((event: unknown) => void) | null {
    return this._onerror;
  }

  addEventListener(
    event: string,
    listener: MessageListener | ConnectionListener | ((event: unknown) => void)
  ): void {
    switch (event) {
      case "message":
        this.messageListeners.push(listener as MessageListener);
        break;
      case "open":
        this.openListeners.push(listener as ConnectionListener);
        break;
      case "close":
        this.closeListeners.push(listener as ConnectionListener);
        break;
      case "error":
        this.errorListeners.push(listener as (event: unknown) => void);
        break;
    }
  }

  removeEventListener(
    event: string,
    listener: MessageListener | ConnectionListener | ((event: unknown) => void)
  ): void {
    switch (event) {
      case "message":
        this.messageListeners = this.messageListeners.filter(
          (l) => l !== listener
        );
        break;
      case "open":
        this.openListeners = this.openListeners.filter((l) => l !== listener);
        break;
      case "close":
        this.closeListeners = this.closeListeners.filter((l) => l !== listener);
        break;
      case "error":
        this.errorListeners = this.errorListeners.filter((l) => l !== listener);
        break;
    }
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.sentMessages.push({ data, timestamp: Date.now() });
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this._onclose?.();
    this.closeListeners.forEach((l) => l());
  }

  // --- Test helpers ---

  /** Simulate the WebSocket connection opening */
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this._onopen?.();
    this.openListeners.forEach((l) => l());
  }

  /** Simulate receiving a message from the server */
  simulateMessage(data: Record<string, unknown> | string): void {
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    const event = { data: raw };
    this._onmessage?.(event);
    this.messageListeners.forEach((l) => l(event));
  }

  /** Simulate a WebSocket error */
  simulateError(error?: unknown): void {
    const err = error ?? new Error("WebSocket error");
    this._onerror?.(err);
    this.errorListeners.forEach((l) => l(err));
  }

  /** Simulate server closing the connection */
  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this._onclose?.();
    this.closeListeners.forEach((l) => l());
  }

  /** Get parsed JSON of all sent messages */
  getSentJSON(): unknown[] {
    return this.sentMessages.map((m) => JSON.parse(m.data));
  }

  /** Clear recorded messages */
  clearSent(): void {
    this.sentMessages = [];
  }
}

/**
 * Install the MockWebSocket as the global WebSocket constructor.
 * Returns a cleanup function to restore the original.
 *
 * Usage:
 *   let instances: MockWebSocket[];
 *   let cleanup: () => void;
 *
 *   beforeEach(() => {
 *     const result = installMockWebSocket();
 *     instances = result.instances;
 *     cleanup = result.cleanup;
 *   });
 *   afterEach(() => cleanup());
 */
export function installMockWebSocket(): {
  instances: MockWebSocket[];
  cleanup: () => void;
} {
  const instances: MockWebSocket[] = [];
  const OriginalWebSocket = globalThis.WebSocket;

  const MockWSClass = class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      instances.push(this);
    }
  };

  // Use Object.defineProperty because jsdom makes WebSocket read-only
  Object.defineProperty(globalThis, "WebSocket", {
    value: MockWSClass,
    writable: true,
    configurable: true,
  });

  return {
    instances,
    cleanup: () => {
      Object.defineProperty(globalThis, "WebSocket", {
        value: OriginalWebSocket,
        writable: true,
        configurable: true,
      });
    },
  };
}
