import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// Test component that uses the focus trap hook
function TestModal({ isActive }: { isActive: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, isActive);

  return (
    <div ref={ref} data-testid="modal">
      <button data-testid="btn-first">First</button>
      <input data-testid="input-middle" />
      <button data-testid="btn-last">Last</button>
    </div>
  );
}

function TestModalWithToggle() {
  const [active, setActive] = useState(false);
  return (
    <div>
      <button data-testid="outside-btn" onClick={() => setActive(!active)}>
        {active ? "Close" : "Open"}
      </button>
      {active && <TestModal isActive={true} />}
    </div>
  );
}

function TestModalWithDisabledButton({ isActive }: { isActive: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, isActive);

  return (
    <div ref={ref} data-testid="modal">
      <button data-testid="btn-first">First</button>
      <button disabled data-testid="btn-disabled">Disabled</button>
      <button data-testid="btn-last">Last</button>
    </div>
  );
}

function dispatchTab(element: HTMLElement, shiftKey = false) {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
}

describe("useFocusTrap", () => {
  beforeEach(() => {
    (document.activeElement as HTMLElement)?.blur();
  });

  it("focuses first focusable element when activated", () => {
    render(<TestModal isActive={true} />);
    expect(document.activeElement).toBe(screen.getByTestId("btn-first"));
  });

  it("does not focus when isActive is false", () => {
    render(<TestModal isActive={false} />);
    expect(document.activeElement).not.toBe(screen.getByTestId("btn-first"));
  });

  it("wraps focus from last to first on Tab", () => {
    render(<TestModal isActive={true} />);
    const lastBtn = screen.getByTestId("btn-last");
    lastBtn.focus();
    expect(document.activeElement).toBe(lastBtn);

    dispatchTab(lastBtn);

    expect(document.activeElement).toBe(screen.getByTestId("btn-first"));
  });

  it("wraps focus from first to last on Shift+Tab", () => {
    render(<TestModal isActive={true} />);
    const firstBtn = screen.getByTestId("btn-first");
    firstBtn.focus();
    expect(document.activeElement).toBe(firstBtn);

    dispatchTab(firstBtn, true);

    expect(document.activeElement).toBe(screen.getByTestId("btn-last"));
  });

  it("does not trap non-Tab keys", () => {
    render(<TestModal isActive={true} />);
    const firstBtn = screen.getByTestId("btn-first");
    firstBtn.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    firstBtn.dispatchEvent(event);

    expect(document.activeElement).toBe(firstBtn);
  });

  it("skips disabled buttons", () => {
    render(<TestModalWithDisabledButton isActive={true} />);
    const lastBtn = screen.getByTestId("btn-last");
    lastBtn.focus();

    dispatchTab(lastBtn);

    expect(document.activeElement).toBe(screen.getByTestId("btn-first"));
  });

  it("restores focus to previously focused element on deactivation", () => {
    render(<TestModalWithToggle />);
    const outsideBtn = screen.getByTestId("outside-btn");
    outsideBtn.focus();
    expect(document.activeElement).toBe(outsideBtn);

    // Click to open modal
    act(() => {
      outsideBtn.click();
    });

    // Modal should now have focus on its first element
    expect(document.activeElement).toBe(screen.getByTestId("btn-first"));

    // Click again to close modal (toggle off)
    act(() => {
      screen.getByTestId("outside-btn").click();
    });

    // Focus should be restored to the outside button
    expect(document.activeElement).toBe(screen.getByTestId("outside-btn"));
  });
});
