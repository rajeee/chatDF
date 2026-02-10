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


class TestSchemaDeduplication:
    """Schema deduplication: subsequent datasets abbreviate columns that match the first."""

    def test_single_dataset_full_schema(self):
        """Single dataset outputs full column details with no abbreviation."""
        datasets = [
            {
                "name": "orders",
                "schema_json": json.dumps([
                    {"name": "id", "type": "Int64", "sample_values": [1, 2, 3]},
                    {"name": "amount", "type": "Float64", "sample_values": [9.99, 19.50]},
                ]),
                "row_count": 200,
            },
        ]
        prompt = build_system_prompt(datasets)
        # Full type info should appear for both columns
        assert "id: Int64" in prompt
        assert "amount: Float64" in prompt
        # No "same as" references for a single dataset
        assert "same as" not in prompt

    def test_overlapping_columns_use_same_as(self):
        """Second table abbreviates columns whose name and type match the first."""
        datasets = [
            {
                "name": "orders",
                "schema_json": json.dumps([
                    {"name": "id", "type": "Int64", "sample_values": [1, 2]},
                    {"name": "customer", "type": "Utf8", "sample_values": ["Alice"]},
                    {"name": "amount", "type": "Float64", "sample_values": [9.99]},
                ]),
                "row_count": 100,
            },
            {
                "name": "returns",
                "schema_json": json.dumps([
                    {"name": "id", "type": "Int64", "sample_values": [10, 20]},
                    {"name": "customer", "type": "Utf8", "sample_values": ["Bob"]},
                    {"name": "reason", "type": "Utf8", "sample_values": ["defective"]},
                ]),
                "row_count": 50,
            },
        ]
        prompt = build_system_prompt(datasets)

        # First table: full details for all columns
        # Check the orders section has full "id: Int64"
        orders_section = prompt.split("### Table: returns")[0]
        assert "id: Int64" in orders_section
        assert "customer: Utf8" in orders_section
        assert "amount: Float64" in orders_section

        # Second table: overlapping columns abbreviated
        returns_section = prompt.split("### Table: returns")[1]
        assert "id: same as orders.id" in returns_section
        assert "customer: same as orders.customer" in returns_section

        # Non-overlapping column gets full details
        assert "reason: Utf8" in returns_section

    def test_no_overlap_both_full(self):
        """Two datasets with completely different columns both get full schemas."""
        datasets = [
            {
                "name": "users",
                "schema_json": json.dumps([
                    {"name": "user_id", "type": "Int64"},
                    {"name": "email", "type": "Utf8"},
                ]),
                "row_count": 300,
            },
            {
                "name": "products",
                "schema_json": json.dumps([
                    {"name": "product_id", "type": "Int64"},
                    {"name": "price", "type": "Float64"},
                ]),
                "row_count": 150,
            },
        ]
        prompt = build_system_prompt(datasets)

        # No abbreviation anywhere since no column names overlap
        assert "same as" not in prompt
        # Both tables show full types
        assert "user_id: Int64" in prompt
        assert "email: Utf8" in prompt
        assert "product_id: Int64" in prompt
        assert "price: Float64" in prompt

    def test_same_name_different_type_gets_full_output(self):
        """Column with matching name but different type is NOT abbreviated."""
        datasets = [
            {
                "name": "raw_data",
                "schema_json": json.dumps([
                    {"name": "id", "type": "Int64"},
                    {"name": "value", "type": "Utf8", "sample_values": ["hello"]},
                ]),
                "row_count": 100,
            },
            {
                "name": "processed",
                "schema_json": json.dumps([
                    {"name": "id", "type": "Int64"},
                    {"name": "value", "type": "Float64", "sample_values": [3.14]},
                ]),
                "row_count": 80,
            },
        ]
        prompt = build_system_prompt(datasets)
        processed_section = prompt.split("### Table: processed")[1]

        # "id" matches name and type -> abbreviated
        assert "id: same as raw_data.id" in processed_section

        # "value" matches name but NOT type -> full output
        assert "value: Float64" in processed_section
        assert "same as raw_data.value" not in processed_section
