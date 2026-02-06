"""CONTEXT tests: context pruning to 50 messages and token budget.

Tests: spec/backend/llm/test.md#CONTEXT-1 through CONTEXT-3
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services.llm_service import prune_context, build_system_prompt


class TestFullHistorySent:
    """CONTEXT-1: Under-limit messages are all kept."""

    def test_ten_messages_all_kept(self):
        """All 10 messages are kept when under the 50-message limit."""
        messages = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"msg {i}"}
            for i in range(10)
        ]
        pruned = prune_context(messages)
        assert len(pruned) == 10

    def test_message_order_preserved(self):
        """Messages are in chronological order after pruning."""
        messages = [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "second"},
            {"role": "user", "content": "third"},
        ]
        pruned = prune_context(messages)
        assert pruned[0]["content"] == "first"
        assert pruned[1]["content"] == "second"
        assert pruned[2]["content"] == "third"


class TestMaxFiftyMessages:
    """CONTEXT-2: Maximum 50 messages retained."""

    def test_fifty_five_messages_pruned_to_fifty(self):
        """55 messages are pruned to the most recent 50."""
        messages = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"msg {i}"}
            for i in range(55)
        ]
        pruned = prune_context(messages, max_messages=50)
        assert len(pruned) == 50

    def test_oldest_messages_removed(self):
        """Oldest messages are the ones removed, newest are kept."""
        messages = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"msg {i}"}
            for i in range(55)
        ]
        pruned = prune_context(messages, max_messages=50)
        # The first message in the pruned list should be msg 5 (oldest 5 removed)
        assert pruned[0]["content"] == "msg 5"
        # The last message should be msg 54
        assert pruned[-1]["content"] == "msg 54"

    def test_exactly_fifty_messages_no_pruning(self):
        """Exactly 50 messages should not be pruned."""
        messages = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"msg {i}"}
            for i in range(50)
        ]
        pruned = prune_context(messages, max_messages=50)
        assert len(pruned) == 50


class TestTokenBudgetPruning:
    """CONTEXT: Token budget pruning (800K tokens)."""

    def test_messages_within_token_budget_kept(self):
        """Messages within the token budget are all kept."""
        messages = [
            {"role": "user", "content": "short message"}
            for _ in range(10)
        ]
        pruned = prune_context(messages, max_messages=50, max_tokens=800_000)
        assert len(pruned) == 10

    def test_large_messages_pruned_by_token_budget(self):
        """When total tokens exceed budget, oldest messages are pruned."""
        # Each message ~1000 chars = ~250 tokens. 40 messages = ~10000 tokens
        # Set a very low token budget to force pruning
        messages = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": "x" * 1000}
            for i in range(40)
        ]
        # 40 messages * 1000 chars / 4 = 10000 tokens
        # Set budget to 5000 tokens -> should keep only ~20 messages
        pruned = prune_context(messages, max_messages=50, max_tokens=5000)
        assert len(pruned) < 40
        # The kept messages should be the most recent ones
        # Last message should be the same as original last
        assert pruned[-1]["content"] == messages[-1]["content"]


class TestSystemPromptFresh:
    """CONTEXT-3: System prompt is always fresh (not affected by pruning)."""

    def test_system_prompt_reflects_current_datasets(self):
        """System prompt reflects current dataset state regardless of message pruning."""
        datasets = [
            {
                "name": "fresh_table",
                "schema_json": '[{"name": "col1", "type": "Int64"}]',
                "row_count": 42,
            }
        ]
        prompt = build_system_prompt(datasets)
        assert "fresh_table" in prompt
        assert "col1" in prompt

    def test_pruning_does_not_affect_system_messages(self):
        """System role messages (if any) are not counted toward the 50-message limit."""
        # prune_context should keep system messages separate
        messages = [
            {"role": "system", "content": "System instruction"},
        ] + [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"msg {i}"}
            for i in range(55)
        ]
        pruned = prune_context(messages, max_messages=50)
        # System message should always be present
        system_msgs = [m for m in pruned if m["role"] == "system"]
        assert len(system_msgs) == 1
        assert system_msgs[0]["content"] == "System instruction"


class TestEmptyContext:
    """Edge case: empty message list."""

    def test_empty_messages(self):
        pruned = prune_context([])
        assert pruned == []

    def test_single_message(self):
        messages = [{"role": "user", "content": "hello"}]
        pruned = prune_context(messages)
        assert len(pruned) == 1
