"""PROMPT tests: system prompt construction.

Tests: spec/backend/llm/test.md#PROMPT-1 through PROMPT-4
"""

from __future__ import annotations

import json

import pytest

from app.services.llm_service import build_system_prompt


class TestSystemPromptWithDatasets:
    """PROMPT-1: System prompt includes dataset schemas."""

    def test_prompt_contains_table_names(self, sample_datasets):
        prompt = build_system_prompt(sample_datasets)
        assert "table1" in prompt
        assert "table2" in prompt

    def test_prompt_contains_column_names_and_types(self, sample_datasets):
        prompt = build_system_prompt(sample_datasets)
        # table1 columns
        assert "id" in prompt
        assert "city" in prompt
        assert "Int64" in prompt
        assert "Utf8" in prompt
        # table2 columns
        assert "sales" in prompt
        assert "Float64" in prompt

    def test_prompt_contains_row_counts(self, sample_datasets):
        prompt = build_system_prompt(sample_datasets)
        assert "100" in prompt
        assert "500" in prompt

    def test_prompt_contains_role_statement(self, sample_datasets):
        prompt = build_system_prompt(sample_datasets)
        assert "data analyst" in prompt.lower()

    def test_prompt_contains_sql_dialect_notes(self, sample_datasets):
        prompt = build_system_prompt(sample_datasets)
        assert "polars" in prompt.lower() or "Polars" in prompt

    def test_prompt_contains_limit_instruction(self, sample_datasets):
        prompt = build_system_prompt(sample_datasets)
        assert "LIMIT 1000" in prompt or "limit 1000" in prompt.lower()


class TestSystemPromptDatasetChanges:
    """PROMPT-2 and PROMPT-3: Prompt updates when datasets change."""

    def test_added_dataset_appears_in_prompt(self, sample_datasets):
        """PROMPT-2: Adding a dataset includes its schema in the next prompt."""
        one_dataset = [sample_datasets[0]]
        prompt_before = build_system_prompt(one_dataset)
        assert "table1" in prompt_before
        assert "table2" not in prompt_before

        prompt_after = build_system_prompt(sample_datasets)
        assert "table1" in prompt_after
        assert "table2" in prompt_after

    def test_removed_dataset_absent_from_prompt(self, sample_datasets):
        """PROMPT-3: Removing a dataset excludes its schema from the next prompt."""
        prompt_both = build_system_prompt(sample_datasets)
        assert "table2" in prompt_both

        prompt_one = build_system_prompt([sample_datasets[0]])
        assert "table1" in prompt_one
        assert "table2" not in prompt_one


class TestSystemPromptNoDatasets:
    """PROMPT-4: No datasets loaded."""

    def test_no_datasets_suggests_adding(self):
        prompt = build_system_prompt([])
        lower = prompt.lower()
        assert "dataset" in lower
        # Should suggest adding a dataset or using load_dataset
        assert "add" in lower or "load" in lower

    def test_no_datasets_mentions_load_dataset_tool(self):
        prompt = build_system_prompt([])
        assert "load_dataset" in prompt

    def test_no_datasets_still_has_role_statement(self):
        prompt = build_system_prompt([])
        assert "data analyst" in prompt.lower()
