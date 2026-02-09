import { useQuery } from "@tanstack/react-query";
import { fetchTokenUsage } from "@/api/client";
import { useChatStore } from "@/stores/chatStore";

function formatTokenCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

export function TokenUsage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  const { data } = useQuery({
    queryKey: ["token-usage", activeConversationId],
    queryFn: () => fetchTokenUsage(activeConversationId!),
    enabled: !!activeConversationId,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  if (!data || !data.total_tokens) return null;

  return (
    <div
      data-testid="token-usage"
      className="flex items-center gap-1.5 text-[10px] opacity-50 hover:opacity-100 transition-opacity"
      title={`Input: ${(data.total_input_tokens ?? 0).toLocaleString()} | Output: ${(data.total_output_tokens ?? 0).toLocaleString()} | Requests: ${data.request_count ?? 0}`}
    >
      <svg
        className="w-3 h-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      <span>{formatTokenCount(data.total_tokens)} tokens</span>
    </div>
  );
}
