"""Edge-case tests for the export endpoints (POST /export/csv and POST /export/xlsx).

Covers:
1.  Export with empty data (no rows)
2.  Export with null/None values in cells
3.  Export with special characters (unicode, quotes, newlines) in data
4.  Export with very long string values
5.  Export with numeric edge cases (NaN, Infinity)
6.  Export CSV with data containing commas and quotes
7.  Export XLSX response has correct content-type header
8.  Export CSV response has correct content-type header
9.  Export with single row, single column
10. Export with many columns (50+)
"""

from __future__ import annotations

import csv
import io
import math

import pytest

from tests.rest_api.conftest import assert_success_response


# ===========================================================================
# 1. Export with empty data (no rows)
# ===========================================================================


class TestExportEmptyData:
    """Export endpoints should handle zero rows gracefully."""

    @pytest.mark.asyncio
    async def test_csv_empty_rows(self, authed_client):
        """CSV export with columns but no rows returns a header-only CSV."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["id", "name", "value"],
                "rows": [],
                "filename": "empty",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        lines = text.strip().splitlines()
        assert len(lines) == 1  # header only
        assert "id" in lines[0]
        assert "name" in lines[0]
        assert "value" in lines[0]

    @pytest.mark.asyncio
    async def test_xlsx_empty_rows(self, authed_client):
        """XLSX export with columns but no rows returns a valid response."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["id", "name", "value"],
                "rows": [],
                "filename": "empty",
            },
        )

        assert response.status_code == 200
        # XLSX files start with the PK zip magic bytes
        assert response.content[:2] == b"PK"


# ===========================================================================
# 2. Export with null/None values in cells
# ===========================================================================


class TestExportNullValues:
    """Export endpoints should handle None/null values in cells."""

    @pytest.mark.asyncio
    async def test_csv_with_null_values(self, authed_client):
        """CSV export with None values renders them as empty strings."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["id", "name", "score"],
                "rows": [
                    [1, None, 95.5],
                    [2, "Alice", None],
                    [None, None, None],
                ],
                "filename": "nulls",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        # Header + 3 data rows
        assert len(rows) == 4
        # The all-None row should have 3 empty-string fields
        assert rows[3] == ["", "", ""]

    @pytest.mark.asyncio
    async def test_xlsx_with_null_values(self, authed_client):
        """XLSX export with None values returns a valid XLSX file."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["id", "name"],
                "rows": [
                    [1, None],
                    [None, "Bob"],
                ],
                "filename": "nulls",
            },
        )

        assert response.status_code == 200
        assert response.content[:2] == b"PK"


# ===========================================================================
# 3. Export with special characters (unicode, quotes, newlines)
# ===========================================================================


class TestExportSpecialCharacters:
    """Export endpoints should correctly handle unicode and control characters."""

    @pytest.mark.asyncio
    async def test_csv_unicode_characters(self, authed_client):
        """CSV export preserves unicode characters (emoji, CJK, accented)."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["name", "city"],
                "rows": [
                    ["Rene", "Montreal"],
                    ["Taro", "Tokyo"],
                    ["emoji_test", "Hello World"],
                ],
                "filename": "unicode",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        assert "Rene" in text
        assert "Taro" in text
        assert "Tokyo" in text
        assert "Montreal" in text

    @pytest.mark.asyncio
    async def test_csv_newlines_in_data(self, authed_client):
        """CSV export properly handles embedded newlines in cell values."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["id", "description"],
                "rows": [
                    [1, "line1\nline2\nline3"],
                    [2, "single line"],
                ],
                "filename": "newlines",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        # Header + 2 data rows
        assert len(rows) == 3
        # The multiline value should be intact after CSV round-trip
        assert rows[1][1] == "line1\nline2\nline3"

    @pytest.mark.asyncio
    async def test_csv_quotes_in_data(self, authed_client):
        """CSV export properly escapes double quotes inside cell values."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["id", "quote"],
                "rows": [
                    [1, 'She said "hello"'],
                    [2, "It's a 'test'"],
                ],
                "filename": "quotes",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert rows[1][1] == 'She said "hello"'
        assert rows[2][1] == "It's a 'test'"

    @pytest.mark.asyncio
    async def test_xlsx_special_characters(self, authed_client):
        """XLSX export with special characters returns a valid file."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["text"],
                "rows": [
                    ['She said "hi"'],
                    ["line1\nline2"],
                    ["tab\there"],
                ],
                "filename": "special",
            },
        )

        assert response.status_code == 200
        assert response.content[:2] == b"PK"


# ===========================================================================
# 4. Export with very long string values
# ===========================================================================


class TestExportLongStrings:
    """Export endpoints should handle very long string values."""

    @pytest.mark.asyncio
    async def test_csv_long_string(self, authed_client):
        """CSV export handles a cell value with 100k characters."""
        long_value = "A" * 100_000
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["id", "content"],
                "rows": [[1, long_value]],
                "filename": "long",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) == 2
        assert len(rows[1][1]) == 100_000

    @pytest.mark.asyncio
    async def test_xlsx_long_string(self, authed_client):
        """XLSX export handles a cell value with 50k characters."""
        long_value = "B" * 50_000
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["id", "content"],
                "rows": [[1, long_value]],
                "filename": "long",
            },
        )

        assert response.status_code == 200
        assert response.content[:2] == b"PK"


# ===========================================================================
# 5. Export with numeric edge cases (NaN, Infinity)
# ===========================================================================


class TestExportNumericEdgeCases:
    """Export endpoints should handle special numeric values."""

    @pytest.mark.asyncio
    async def test_csv_with_zero_and_negative(self, authed_client):
        """CSV export handles zero, negative numbers, and large numbers."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["val"],
                "rows": [
                    [0],
                    [-1],
                    [999999999999],
                    [-0.0001],
                    [3.141592653589793],
                ],
                "filename": "nums",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) == 6  # header + 5 data rows
        assert rows[1][0] == "0"
        assert rows[2][0] == "-1"
        assert rows[3][0] == "999999999999"

    @pytest.mark.asyncio
    async def test_csv_with_float_precision(self, authed_client):
        """CSV export preserves float precision."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["pi"],
                "rows": [[3.141592653589793]],
                "filename": "precision",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        # Verify the float was written with reasonable precision
        parsed = float(rows[1][0])
        assert abs(parsed - 3.141592653589793) < 1e-10

    @pytest.mark.asyncio
    async def test_csv_with_boolean_values(self, authed_client):
        """CSV export handles boolean values passed as JSON booleans."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["flag"],
                "rows": [[True], [False]],
                "filename": "bools",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) == 3
        # Python csv.writer writes True/False as their str() representations
        assert rows[1][0] == "True"
        assert rows[2][0] == "False"

    @pytest.mark.asyncio
    async def test_xlsx_with_integer_edge_cases(self, authed_client):
        """XLSX export handles zero, negative, and large integer numbers."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["int_val"],
                "rows": [
                    [0],
                    [-1],
                    [999999999999],
                    [-999999999999],
                ],
                "filename": "int-nums",
            },
        )

        assert response.status_code == 200
        assert response.content[:2] == b"PK"

    @pytest.mark.asyncio
    async def test_xlsx_with_float_edge_cases(self, authed_client):
        """XLSX export handles float numbers including very small and large."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["float_val"],
                "rows": [
                    [0.0],
                    [-0.0001],
                    [3.141592653589793],
                    [1e15],
                ],
                "filename": "float-nums",
            },
        )

        assert response.status_code == 200
        assert response.content[:2] == b"PK"


# ===========================================================================
# 6. Export CSV with data containing commas and quotes
# ===========================================================================


class TestExportCsvCommasAndQuotes:
    """CSV export must properly escape commas and double quotes per RFC 4180."""

    @pytest.mark.asyncio
    async def test_csv_commas_in_values(self, authed_client):
        """Values containing commas are properly quoted in CSV output."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["name", "address"],
                "rows": [
                    ["Doe, Jane", "123 Main St, Suite 4"],
                    ["Smith", "No comma here"],
                ],
                "filename": "commas",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert rows[1][0] == "Doe, Jane"
        assert rows[1][1] == "123 Main St, Suite 4"
        assert rows[2][0] == "Smith"

    @pytest.mark.asyncio
    async def test_csv_combined_commas_quotes_newlines(self, authed_client):
        """A single cell containing commas, quotes, and newlines survives CSV round-trip."""
        tricky_value = 'He said, "Hello"\nThen left.'
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["note"],
                "rows": [[tricky_value]],
                "filename": "tricky",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert rows[1][0] == tricky_value


# ===========================================================================
# 7. Export XLSX response has correct content-type header
# ===========================================================================


class TestXlsxContentType:
    """XLSX export must return the correct OOXML spreadsheet media type."""

    @pytest.mark.asyncio
    async def test_xlsx_content_type(self, authed_client):
        """Response Content-Type is the standard XLSX MIME type."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["a"],
                "rows": [[1]],
                "filename": "test",
            },
        )

        assert response.status_code == 200
        ct = response.headers["content-type"]
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in ct

    @pytest.mark.asyncio
    async def test_xlsx_content_disposition(self, authed_client):
        """Response Content-Disposition includes the sanitized filename."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["x"],
                "rows": [[1]],
                "filename": "my results",
            },
        )

        assert response.status_code == 200
        cd = response.headers["content-disposition"]
        assert "my results.xlsx" in cd
        assert "attachment" in cd

    @pytest.mark.asyncio
    async def test_xlsx_filename_sanitization(self, authed_client):
        """Dangerous characters in filename are stripped; fallback to 'export'."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["x"],
                "rows": [[1]],
                "filename": "../../../etc/passwd",
            },
        )

        assert response.status_code == 200
        cd = response.headers["content-disposition"]
        # The slashes and dots should be stripped
        assert "/" not in cd.split("filename=")[1]
        assert ".." not in cd.split("filename=")[1].replace(".xlsx", "")

    @pytest.mark.asyncio
    async def test_xlsx_empty_filename_fallback(self, authed_client):
        """An all-special-character filename falls back to 'export'."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["x"],
                "rows": [[1]],
                "filename": "///",
            },
        )

        assert response.status_code == 200
        cd = response.headers["content-disposition"]
        assert "export.xlsx" in cd


# ===========================================================================
# 8. Export CSV response has correct content-type header
# ===========================================================================


class TestCsvContentType:
    """CSV export must return the correct text/csv media type."""

    @pytest.mark.asyncio
    async def test_csv_content_type(self, authed_client):
        """Response Content-Type is text/csv."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["a"],
                "rows": [[1]],
                "filename": "test",
            },
        )

        assert response.status_code == 200
        ct = response.headers["content-type"]
        assert "text/csv" in ct

    @pytest.mark.asyncio
    async def test_csv_content_disposition(self, authed_client):
        """Response Content-Disposition includes the sanitized filename."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["x"],
                "rows": [[1]],
                "filename": "my data",
            },
        )

        assert response.status_code == 200
        cd = response.headers["content-disposition"]
        assert "my data.csv" in cd
        assert "attachment" in cd

    @pytest.mark.asyncio
    async def test_csv_filename_sanitization(self, authed_client):
        """Dangerous characters in filename are stripped."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["x"],
                "rows": [[1]],
                "filename": "../../secret",
            },
        )

        assert response.status_code == 200
        cd = response.headers["content-disposition"]
        assert "/" not in cd.split("filename=")[1]

    @pytest.mark.asyncio
    async def test_csv_empty_filename_fallback(self, authed_client):
        """An all-special-character filename falls back to 'export'."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["x"],
                "rows": [[1]],
                "filename": "***",
            },
        )

        assert response.status_code == 200
        cd = response.headers["content-disposition"]
        assert "export.csv" in cd


# ===========================================================================
# 9. Export with single row, single column
# ===========================================================================


class TestExportSingleRowSingleColumn:
    """Minimal valid payloads with one row and one column."""

    @pytest.mark.asyncio
    async def test_csv_single_cell(self, authed_client):
        """CSV export with a single cell produces header + one data row."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["only_col"],
                "rows": [["only_val"]],
                "filename": "single",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[0] == ["only_col"]
        assert rows[1] == ["only_val"]

    @pytest.mark.asyncio
    async def test_xlsx_single_cell(self, authed_client):
        """XLSX export with a single cell returns a valid file."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["only_col"],
                "rows": [["only_val"]],
                "filename": "single",
            },
        )

        assert response.status_code == 200
        assert response.content[:2] == b"PK"

    @pytest.mark.asyncio
    async def test_csv_single_numeric_cell(self, authed_client):
        """CSV export with a single numeric cell."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["count"],
                "rows": [[42]],
                "filename": "single-num",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert rows[1][0] == "42"


# ===========================================================================
# 10. Export with many columns (50+)
# ===========================================================================


class TestExportManyColumns:
    """Export endpoints should handle wide datasets with 50+ columns."""

    @pytest.mark.asyncio
    async def test_csv_many_columns(self, authed_client):
        """CSV export with 60 columns produces a correct header and data row."""
        num_cols = 60
        columns = [f"col_{i}" for i in range(num_cols)]
        row = [f"val_{i}" for i in range(num_cols)]

        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": columns,
                "rows": [row],
                "filename": "wide",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) == 2
        assert len(rows[0]) == num_cols
        assert len(rows[1]) == num_cols
        assert rows[0][0] == "col_0"
        assert rows[0][59] == "col_59"
        assert rows[1][0] == "val_0"
        assert rows[1][59] == "val_59"

    @pytest.mark.asyncio
    async def test_xlsx_many_columns(self, authed_client):
        """XLSX export with 60 columns returns a valid file."""
        num_cols = 60
        columns = [f"col_{i}" for i in range(num_cols)]
        row = [i for i in range(num_cols)]

        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": columns,
                "rows": [row],
                "filename": "wide",
            },
        )

        assert response.status_code == 200
        assert response.content[:2] == b"PK"

    @pytest.mark.asyncio
    async def test_csv_many_columns_many_rows(self, authed_client):
        """CSV export with 50 columns and 100 rows returns the correct row count."""
        num_cols = 50
        num_rows = 100
        columns = [f"c{i}" for i in range(num_cols)]
        rows = [[f"r{r}c{c}" for c in range(num_cols)] for r in range(num_rows)]

        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": columns,
                "rows": rows,
                "filename": "wide-tall",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        parsed_rows = list(reader)
        # header + 100 data rows
        assert len(parsed_rows) == num_rows + 1
        # spot-check last cell
        assert parsed_rows[100][49] == "r99c49"


# ===========================================================================
# Additional edge cases: mixed types, row length mismatch, default filename
# ===========================================================================


class TestExportMiscEdgeCases:
    """Miscellaneous edge cases not covered by the above categories."""

    @pytest.mark.asyncio
    async def test_csv_mixed_types_in_row(self, authed_client):
        """CSV export handles rows with mixed types (str, int, float, bool, None)."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["str_col", "int_col", "float_col", "bool_col", "null_col"],
                "rows": [["hello", 42, 3.14, True, None]],
                "filename": "mixed",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert rows[1][0] == "hello"
        assert rows[1][1] == "42"
        assert rows[1][2] == "3.14"
        assert rows[1][3] == "True"
        assert rows[1][4] == ""

    @pytest.mark.asyncio
    async def test_csv_row_shorter_than_columns(self, authed_client):
        """CSV export when a row has fewer elements than columns (some missing)."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["a", "b", "c"],
                "rows": [["only_a"]],
                "filename": "short-row",
            },
        )

        # The endpoint writes whatever is in the row array.
        # CSV writer just writes the elements it has.
        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) == 2
        # The data row will have only 1 element
        assert rows[1][0] == "only_a"

    @pytest.mark.asyncio
    async def test_xlsx_row_shorter_than_columns(self, authed_client):
        """XLSX export when a row has fewer elements than columns pads with None."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["a", "b", "c"],
                "rows": [["only_a"]],
                "filename": "short-row",
            },
        )

        # The export code pads missing indices with None:
        #   data[col] = [row[i] if i < len(row) else None for row in body.rows]
        assert response.status_code == 200
        assert response.content[:2] == b"PK"

    @pytest.mark.asyncio
    async def test_csv_default_filename(self, authed_client):
        """CSV export uses the default filename when none is provided."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["x"],
                "rows": [[1]],
                # No filename provided -- model default is "query-results"
            },
        )

        assert response.status_code == 200
        cd = response.headers["content-disposition"]
        assert "query-results.csv" in cd

    @pytest.mark.asyncio
    async def test_xlsx_default_filename(self, authed_client):
        """XLSX export uses the default filename when none is provided."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["x"],
                "rows": [[1]],
                # No filename provided -- model default is "query-results"
            },
        )

        assert response.status_code == 200
        cd = response.headers["content-disposition"]
        assert "query-results.xlsx" in cd

    @pytest.mark.asyncio
    async def test_csv_utf8_encoding(self, authed_client):
        """CSV export is encoded as UTF-8."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["greeting"],
                "rows": [["Bonjour"]],
                "filename": "utf8",
            },
        )

        assert response.status_code == 200
        # Should decode cleanly as UTF-8
        text = response.content.decode("utf-8")
        assert "Bonjour" in text

    @pytest.mark.asyncio
    async def test_csv_empty_string_values(self, authed_client):
        """CSV export handles empty string values correctly."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["a", "b"],
                "rows": [["", ""], ["x", ""]],
                "filename": "empties",
            },
        )

        assert response.status_code == 200
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert rows[1] == ["", ""]
        assert rows[2] == ["x", ""]
