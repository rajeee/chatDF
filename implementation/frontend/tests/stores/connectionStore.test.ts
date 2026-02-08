import { describe, it, expect, beforeEach } from "vitest";
import { useConnectionStore } from "@/stores/connectionStore";

describe("connectionStore", () => {
  beforeEach(() => {
    useConnectionStore.setState({ status: "disconnected" });
  });

  it("starts with disconnected status", () => {
    expect(useConnectionStore.getState().status).toBe("disconnected");
  });

  it("setStatus updates to connected", () => {
    useConnectionStore.getState().setStatus("connected");
    expect(useConnectionStore.getState().status).toBe("connected");
  });

  it("setStatus updates to reconnecting", () => {
    useConnectionStore.getState().setStatus("reconnecting");
    expect(useConnectionStore.getState().status).toBe("reconnecting");
  });

  it("transitions through connection lifecycle", () => {
    const { setStatus } = useConnectionStore.getState();

    // Start disconnected
    expect(useConnectionStore.getState().status).toBe("disconnected");

    // Connect
    setStatus("connected");
    expect(useConnectionStore.getState().status).toBe("connected");

    // Unexpected disconnect -> reconnecting
    setStatus("reconnecting");
    expect(useConnectionStore.getState().status).toBe("reconnecting");

    // Reconnected
    setStatus("connected");
    expect(useConnectionStore.getState().status).toBe("connected");

    // Intentional disconnect
    setStatus("disconnected");
    expect(useConnectionStore.getState().status).toBe("disconnected");
  });
});
