// Custom code block component for ReactMarkdown
// Adds a copy button to code blocks in assistant messages

import { useToastStore } from "@/stores/toastStore";

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function CodeBlock({ inline, className, children, ...props }: CodeBlockProps) {
  const { success } = useToastStore();

  // Extract language from className (format: "language-python")
  const language = className?.replace(/^language-/, "") || "";

  // Get the text content
  const codeText = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      success("Code copied to clipboard");
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  // Inline code - render as simple <code> tag
  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  // Block code - render with copy button
  return (
    <div className="relative group/code my-2">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs rounded-t" style={{ backgroundColor: "var(--color-surface-hover)" }}>
        <span className="font-mono opacity-60">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="touch-action-btn px-2 py-1 rounded text-xs opacity-0 group-hover/code:opacity-100 transition-all duration-150 flex items-center gap-1.5 hover:bg-white/10 active:scale-95"
          style={{ color: "var(--color-text)" }}
          aria-label="Copy code to clipboard"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy
        </button>
      </div>
      <pre className="m-0 p-3 overflow-x-auto rounded-b" style={{ backgroundColor: "var(--color-surface-hover)" }}>
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}
