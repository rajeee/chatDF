"""Unit tests for helper functions in app.routers.dataset_search.

Tests cover:
- extract_keywords: stop-word removal, punctuation stripping, dedup, ordering
- match_categories: known categories, unknown queries, mixed, case-insensitive
- _compute_relevance: keyword matching, popularity scoring, edge cases
"""

from __future__ import annotations

import math
import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

import pytest  # noqa: E402

from app.routers.dataset_search import (  # noqa: E402
    CATEGORY_TAGS,
    STOP_WORDS,
    _compute_relevance,
    extract_keywords,
    match_categories,
)


# ---------------------------------------------------------------------------
# TestExtractKeywords
# ---------------------------------------------------------------------------


class TestExtractKeywords:
    """Tests for extract_keywords(query) -> list[str]."""

    # -- basic extraction --

    def test_extracts_meaningful_words(self):
        """Keeps content words that are not stop words."""
        result = extract_keywords("financial stock market prices")
        assert result == ["financial", "stock", "market", "prices"]

    def test_removes_common_stop_words(self):
        """English stop words (the, is, are, ...) are stripped."""
        result = extract_keywords("the weather is very cold")
        for sw in ("the", "is", "very"):
            assert sw not in result
        assert "weather" in result
        assert "cold" in result

    def test_removes_task_stop_words(self):
        """Task-specific stop words (find, show, dataset, ...) are stripped."""
        result = extract_keywords("find me some datasets related to housing")
        for sw in ("find", "me", "some", "datasets", "related"):
            assert sw not in result
        assert "housing" in result

    # -- normalisation --

    def test_lowercases_all_tokens(self):
        """All returned tokens are lowercase."""
        result = extract_keywords("Climate TEMPERATURE Weather")
        for kw in result:
            assert kw == kw.lower()

    def test_strips_punctuation(self):
        """Commas, exclamation marks, question marks are removed."""
        result = extract_keywords("climate, weather! temperature?")
        assert "climate" in result
        assert "weather" in result
        assert "temperature" in result
        # No punctuation remnants
        assert all(c.isalnum() for kw in result for c in kw)

    def test_strips_special_characters(self):
        """Characters like parentheses, colons, dashes are removed."""
        result = extract_keywords("stock (prices): year-over-year")
        assert "stock" in result
        assert "prices" in result
        assert "year" in result

    # -- deduplication and ordering --

    def test_deduplicates_repeated_tokens(self):
        """Duplicate tokens appear only once."""
        result = extract_keywords("weather weather temperature weather")
        assert result.count("weather") == 1
        assert result.count("temperature") == 1

    def test_preserves_first_occurrence_order(self):
        """Keywords are returned in the order of first appearance."""
        result = extract_keywords("stock market financial analysis")
        assert result == ["stock", "market", "financial", "analysis"]

    def test_dedup_is_case_insensitive(self):
        """'Climate' and 'climate' count as the same token."""
        result = extract_keywords("Climate climate CLIMATE")
        assert result == ["climate"]

    # -- edge cases --

    def test_empty_string(self):
        """Empty query returns empty list."""
        assert extract_keywords("") == []

    def test_whitespace_only(self):
        """Whitespace-only query returns empty list."""
        assert extract_keywords("   \t  ") == []

    def test_only_stop_words(self):
        """Query with nothing but stop words returns empty list."""
        assert extract_keywords("show me the data please") == []

    def test_single_character_tokens_removed(self):
        """Tokens of length 1 are filtered out."""
        result = extract_keywords("I want a b c big dataset")
        assert "i" not in result
        assert "a" not in result
        assert "b" not in result
        assert "c" not in result
        assert "big" in result

    def test_single_meaningful_word(self):
        """A single meaningful word is returned as a one-element list."""
        assert extract_keywords("housing") == ["housing"]

    def test_numbers_are_kept(self):
        """Numeric tokens longer than 1 char are kept."""
        result = extract_keywords("top 100 universities 2024")
        assert "100" in result
        assert "2024" in result

    def test_long_query(self):
        """Long natural language queries are handled correctly."""
        query = (
            "I would like to find a dataset about global climate change "
            "including temperature records and carbon emissions from 1900 to 2024"
        )
        result = extract_keywords(query)
        assert "global" in result
        assert "climate" in result
        assert "change" in result
        assert "temperature" in result
        assert "carbon" in result
        assert "emissions" in result
        assert "1900" in result
        assert "2024" in result
        # Stop words should not be present
        for sw in ("i", "would", "like", "to", "find", "a", "about", "and", "from"):
            assert sw not in result

    def test_mixed_punctuation_and_whitespace(self):
        """Handles messy input with tabs, multiple spaces, and punctuation."""
        result = extract_keywords("  climate...  weather,,  \ttemperature  ")
        assert "climate" in result
        assert "weather" in result
        assert "temperature" in result


# ---------------------------------------------------------------------------
# TestMatchCategories
# ---------------------------------------------------------------------------


class TestMatchCategories:
    """Tests for match_categories(query) -> list[str]."""

    # -- known category names --

    def test_climate_category_by_name(self):
        """Query containing 'climate' triggers climate tags."""
        tags = match_categories("climate data")
        expected = CATEGORY_TAGS["climate"]
        for tag in expected:
            assert tag in tags

    def test_finance_category_by_name(self):
        """Query containing 'finance' triggers finance tags."""
        tags = match_categories("finance datasets")
        expected = CATEGORY_TAGS["finance"]
        for tag in expected:
            assert tag in tags

    def test_health_category_by_name(self):
        """Query containing 'health' triggers health tags."""
        tags = match_categories("health information")
        expected = CATEGORY_TAGS["health"]
        for tag in expected:
            assert tag in tags

    def test_census_category_by_name(self):
        """Query containing 'census' triggers census tags."""
        tags = match_categories("census results")
        expected = CATEGORY_TAGS["census"]
        for tag in expected:
            assert tag in tags

    def test_education_category_by_name(self):
        """Query containing 'education' triggers education tags."""
        tags = match_categories("education statistics")
        expected = CATEGORY_TAGS["education"]
        for tag in expected:
            assert tag in tags

    def test_transportation_category_by_name(self):
        """Query containing 'transportation' triggers transportation tags."""
        tags = match_categories("transportation data")
        expected = CATEGORY_TAGS["transportation"]
        for tag in expected:
            assert tag in tags

    def test_energy_category_by_name(self):
        """Query containing 'energy' triggers energy tags."""
        tags = match_categories("energy consumption")
        expected = CATEGORY_TAGS["energy"]
        for tag in expected:
            assert tag in tags

    def test_agriculture_category_by_name(self):
        """Query containing 'agriculture' triggers agriculture tags."""
        tags = match_categories("agriculture yields")
        expected = CATEGORY_TAGS["agriculture"]
        for tag in expected:
            assert tag in tags

    # -- matching via tag keyword (not category name) --

    def test_match_by_tag_keyword_stock(self):
        """'stock' is a finance tag keyword, triggers finance category."""
        tags = match_categories("stock market prices")
        assert "finance" in tags
        assert "stock" in tags

    def test_match_by_tag_keyword_medical(self):
        """'medical' is a health tag keyword, triggers health category."""
        tags = match_categories("medical records")
        assert "health" in tags
        assert "medical" in tags

    def test_match_by_tag_keyword_solar(self):
        """'solar' is an energy tag keyword, triggers energy category."""
        tags = match_categories("solar panel output")
        assert "energy" in tags
        assert "solar" in tags

    def test_match_by_tag_keyword_population(self):
        """'population' is a census tag keyword, triggers census category."""
        tags = match_categories("population growth")
        assert "census" in tags
        assert "population" in tags

    def test_match_by_tag_keyword_flight(self):
        """'flight' is a transportation tag keyword."""
        tags = match_categories("flight delay data")
        assert "transport" in tags
        assert "flight" in tags

    def test_match_by_tag_keyword_crop(self):
        """'crop' is an agriculture tag keyword."""
        tags = match_categories("crop production")
        assert "agriculture" in tags
        assert "crop" in tags

    # -- no match --

    def test_no_category_match(self):
        """Query with no category-related words returns empty list."""
        assert match_categories("random unrelated foobar text") == []

    def test_empty_string(self):
        """Empty query returns empty list."""
        assert match_categories("") == []

    def test_whitespace_only(self):
        """Whitespace-only query returns empty list."""
        assert match_categories("    ") == []

    # -- multiple categories --

    def test_multiple_categories_matched(self):
        """Query mentioning two categories returns tags from both."""
        tags = match_categories("climate and finance data")
        # Should have tags from both climate and finance
        assert "climate" in tags
        assert "weather" in tags
        assert "finance" in tags
        assert "stock" in tags

    def test_all_categories_possible(self):
        """Query mentioning all category names returns tags from all."""
        query = "climate finance health census education transportation energy agriculture"
        tags = match_categories(query)
        for cat_tags in CATEGORY_TAGS.values():
            for tag in cat_tags:
                assert tag in tags

    # -- case insensitivity --

    def test_case_insensitive_category_name(self):
        """Matching is case-insensitive for category names."""
        tags = match_categories("CLIMATE DATA")
        assert "climate" in tags

    def test_case_insensitive_tag_keyword(self):
        """Matching is case-insensitive for tag keywords."""
        tags = match_categories("STOCK market SOLAR panels")
        assert "finance" in tags
        assert "energy" in tags

    # -- deduplication --

    def test_no_duplicate_tags(self):
        """Returned tags are unique even when multiple triggers match."""
        # "climate weather temperature environment" directly mentions all tags
        tags = match_categories("climate weather temperature environment")
        assert len(tags) == len(set(tags))

    def test_overlapping_category_and_tag(self):
        """When a word is both a category name and a tag, no dups."""
        # "climate" is both the category name and the first tag
        tags = match_categories("climate")
        assert tags.count("climate") == 1

    # -- substring matching behaviour --

    def test_substring_match_within_word(self):
        """Category matching uses 'in' operator, so substrings match.

        For example, 'financial' contains 'finance' as a substring even
        though it is a longer word. This tests the actual behaviour.
        """
        # "financial" contains "finance" as a substring
        tags = match_categories("financial")
        # This should match because "financ" contains "finance" substring
        assert "finance" in tags


# ---------------------------------------------------------------------------
# TestComputeRelevance
# ---------------------------------------------------------------------------


class TestComputeRelevance:
    """Tests for _compute_relevance(item, keywords) -> float."""

    # -- keyword matching --

    def test_all_keywords_match(self):
        """Score includes full keyword component when all keywords match."""
        item = {
            "id": "climate-dataset",
            "description": "temperature records",
            "tags": ["environment"],
            "downloads": 0,
            "likes": 0,
        }
        score = _compute_relevance(item, ["climate", "temperature", "environment"])
        # All 3 keywords match, so keyword_score = (3/3) * 50 = 50
        # downloads=0, likes=0 => popularity = log10(1)*5 + log10(1)*2 = 0
        assert score == 50.0

    def test_partial_keyword_match(self):
        """Score reflects proportion of keywords matched."""
        item = {
            "id": "climate-dataset",
            "description": "temperature records",
            "tags": [],
            "downloads": 0,
            "likes": 0,
        }
        score = _compute_relevance(item, ["climate", "temperature", "nonexistent", "missing"])
        # 2 out of 4 match => keyword_score = (2/4) * 50 = 25
        assert score == 25.0

    def test_no_keywords_match(self):
        """Score has zero keyword component when nothing matches."""
        item = {
            "id": "unrelated",
            "description": "something else entirely",
            "tags": [],
            "downloads": 0,
            "likes": 0,
        }
        score = _compute_relevance(item, ["xyz", "abc"])
        # 0 matches => keyword_score = 0, popularity = 0
        assert score == 0.0

    def test_keyword_match_in_id(self):
        """Keywords can match against the item id field."""
        item = {"id": "climate-data", "description": "", "tags": [], "downloads": 0, "likes": 0}
        score = _compute_relevance(item, ["climate"])
        assert score == 50.0  # 1/1 * 50

    def test_keyword_match_in_description(self):
        """Keywords can match against the description field."""
        item = {"id": "xyz", "description": "temperature records", "tags": [], "downloads": 0, "likes": 0}
        score = _compute_relevance(item, ["temperature"])
        assert score == 50.0

    def test_keyword_match_in_tags(self):
        """Keywords can match against the tags field."""
        item = {"id": "xyz", "description": "", "tags": ["finance", "stock"], "downloads": 0, "likes": 0}
        score = _compute_relevance(item, ["finance"])
        assert score == 50.0

    def test_more_keywords_matched_higher_score(self):
        """Items matching more keywords score higher than those matching fewer."""
        item = {
            "id": "test",
            "description": "climate temperature weather",
            "tags": [],
            "downloads": 100,
            "likes": 10,
        }
        score_3 = _compute_relevance(item, ["climate", "temperature", "weather"])
        score_1 = _compute_relevance(item, ["climate", "nonexistent1", "nonexistent2"])
        assert score_3 > score_1

    # -- popularity scoring --

    def test_downloads_contribute_to_score(self):
        """Higher download counts increase the score."""
        base = {"id": "test", "description": "", "tags": [], "likes": 0}
        score_high = _compute_relevance({**base, "downloads": 1_000_000}, [])
        score_low = _compute_relevance({**base, "downloads": 10}, [])
        assert score_high > score_low

    def test_likes_contribute_to_score(self):
        """Higher like counts increase the score."""
        base = {"id": "test", "description": "", "tags": [], "downloads": 0}
        score_high = _compute_relevance({**base, "likes": 10_000}, [])
        score_low = _compute_relevance({**base, "likes": 1}, [])
        assert score_high > score_low

    def test_popularity_formula_exact(self):
        """Verify the exact popularity formula: log10(downloads+1)*5 + log10(likes+1)*2."""
        item = {"id": "test", "description": "", "tags": [], "downloads": 999, "likes": 99}
        score = _compute_relevance(item, [])
        expected = round(math.log10(1000) * 5 + math.log10(100) * 2, 2)
        assert score == expected

    def test_combined_keyword_and_popularity(self):
        """Score correctly combines keyword match ratio and popularity."""
        item = {
            "id": "climate-data",
            "description": "temperature records",
            "tags": [],
            "downloads": 999,
            "likes": 99,
        }
        score = _compute_relevance(item, ["climate", "temperature"])
        # keyword: 2/2 * 50 = 50
        # popularity: log10(1000)*5 + log10(100)*2 = 15 + 4 = 19
        expected = round(50.0 + math.log10(1000) * 5 + math.log10(100) * 2, 2)
        assert score == expected

    # -- zero and missing values --

    def test_zero_downloads_and_likes(self):
        """Zero downloads and likes give zero popularity component."""
        item = {"id": "test", "description": "", "tags": [], "downloads": 0, "likes": 0}
        score = _compute_relevance(item, [])
        assert score == 0.0

    def test_empty_item_no_keywords(self):
        """Completely empty item with no keywords scores 0."""
        item = {"id": "", "description": "", "tags": [], "downloads": 0, "likes": 0}
        assert _compute_relevance(item, []) == 0.0

    def test_empty_keywords_list(self):
        """Empty keyword list means keyword_score = 0; only popularity matters."""
        item = {"id": "test", "description": "something", "tags": [], "downloads": 999, "likes": 99}
        score = _compute_relevance(item, [])
        expected = round(math.log10(1000) * 5 + math.log10(100) * 2, 2)
        assert score == expected

    def test_missing_fields_use_defaults(self):
        """Missing dict keys fall back to defaults (empty string, 0)."""
        item = {}  # no id, no description, no tags, no downloads, no likes
        score = _compute_relevance(item, ["anything"])
        # keyword match: "anything" not in "" => 0/1 * 50 = 0
        # popularity: log10(0+1)*5 + log10(0+1)*2 = 0
        assert score == 0.0

    def test_none_description(self):
        """None description is handled gracefully (replaced with '')."""
        item = {"id": "test", "description": None, "tags": None, "downloads": 0, "likes": 0}
        # Should not raise; description None -> "" via `or ""`, tags None -> [] via `or []`
        score = _compute_relevance(item, ["test"])
        assert score == 50.0  # "test" matches id

    # -- large values --

    def test_very_high_downloads(self):
        """Very large download count produces a reasonable score."""
        item = {"id": "popular", "description": "", "tags": [], "downloads": 100_000_000, "likes": 0}
        score = _compute_relevance(item, [])
        expected = round(math.log10(100_000_001) * 5, 2)
        assert score == expected
        assert score > 0

    def test_very_high_likes(self):
        """Very large like count produces a reasonable score."""
        item = {"id": "loved", "description": "", "tags": [], "downloads": 0, "likes": 1_000_000}
        score = _compute_relevance(item, [])
        expected = round(math.log10(1_000_001) * 2, 2)
        assert score == expected
        assert score > 0

    # -- negative values guarded by max() --

    def test_negative_downloads_clamped(self):
        """Negative download values are clamped to 0 via max()."""
        item = {"id": "test", "description": "", "tags": [], "downloads": -100, "likes": 0}
        score = _compute_relevance(item, [])
        # max(-100, 0) + 1 = 1 => log10(1) = 0
        assert score == 0.0

    def test_negative_likes_clamped(self):
        """Negative like values are clamped to 0 via max()."""
        item = {"id": "test", "description": "", "tags": [], "downloads": 0, "likes": -50}
        score = _compute_relevance(item, [])
        assert score == 0.0

    # -- result is rounded --

    def test_score_is_rounded_to_two_decimals(self):
        """The returned score is rounded to 2 decimal places."""
        item = {"id": "test", "description": "", "tags": [], "downloads": 123, "likes": 45}
        score = _compute_relevance(item, [])
        # Verify it matches round(..., 2)
        raw = math.log10(124) * 5 + math.log10(46) * 2
        assert score == round(raw, 2)

    # -- keyword matching is case-insensitive --

    def test_keyword_match_is_case_insensitive(self):
        """Keyword matching lowercases the item text, so case does not matter."""
        item = {
            "id": "CLIMATE-Data",
            "description": "TEMPERATURE Records",
            "tags": ["ENVIRONMENT"],
            "downloads": 0,
            "likes": 0,
        }
        score = _compute_relevance(item, ["climate", "temperature", "environment"])
        assert score == 50.0  # All 3 match
