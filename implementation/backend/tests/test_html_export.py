"""Tests for HTML conversation export.

Covers:
- _generate_conversation_html produces valid HTML with conversation content
- HTML content is properly escaped (XSS-safe)
- SQL queries appear in code blocks
- Empty conversations produce valid HTML
- Datasets section renders when datasets exist
"""

import pytest
import pytest_asyncio
import aiosqlite


@pytest_asyncio.fixture
async def db():
    """In-memory SQLite database with minimal schema for testing."""
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await conn.executescript("""
        CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT);
        CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT);
        CREATE TABLE conversations (
            id TEXT, user_id TEXT, title TEXT, is_pinned INTEGER DEFAULT 0,
            share_token TEXT, shared_at TEXT, created_at TEXT, updated_at TEXT
        );
        CREATE TABLE messages (
            id TEXT, conversation_id TEXT, role TEXT, content TEXT,
            sql_query TEXT, token_count INTEGER, reasoning TEXT,
            created_at TEXT, input_tokens INTEGER, output_tokens INTEGER,
            tool_call_trace TEXT
        );
        CREATE TABLE datasets (
            id TEXT, conversation_id TEXT, url TEXT, name TEXT,
            row_count INTEGER, column_count INTEGER, schema_json TEXT,
            status TEXT, error_message TEXT, loaded_at TEXT,
            file_size_bytes INTEGER, column_descriptions TEXT
        );
        INSERT INTO users VALUES ('u1', 'test@test.com', 'Test');
        INSERT INTO sessions VALUES ('s1', 'u1');
        INSERT INTO conversations VALUES (
            'c1', 'u1', 'Test Conv', 0, NULL, NULL,
            '2024-01-01T00:00:00', '2024-01-01T00:00:00'
        );
        INSERT INTO messages VALUES (
            'm1', 'c1', 'user', 'Hello', NULL, NULL, NULL,
            '2024-01-01T00:00:00', NULL, NULL, NULL
        );
        INSERT INTO messages VALUES (
            'm2', 'c1', 'assistant', 'Hi there! How can I help?',
            'SELECT 1', NULL, NULL, '2024-01-01T00:00:01', NULL, NULL, NULL
        );
    """)
    yield conn
    await conn.close()


@pytest.mark.asyncio
async def test_html_export_generates_valid_html(db):
    """Test that HTML export produces valid HTML with conversation content."""
    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(db, "c1", "Test Conv")

    assert "<!DOCTYPE html>" in html
    assert "Test Conv" in html
    assert "Hello" in html
    assert "Hi there! How can I help?" in html
    assert "SELECT 1" in html


@pytest.mark.asyncio
async def test_html_export_escapes_html_content(db):
    """Test that HTML content is properly escaped to prevent XSS."""
    await db.execute(
        "INSERT INTO messages VALUES "
        "('m3', 'c1', 'user', '<script>alert(1)</script>', "
        "NULL, NULL, NULL, '2024-01-01T00:00:02', NULL, NULL, NULL)"
    )
    await db.commit()

    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(db, "c1", "Test Conv")

    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html


@pytest.mark.asyncio
async def test_html_export_escapes_title(db):
    """Test that the conversation title is escaped."""
    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(
        db, "c1", '<img src=x onerror="alert(1)">'
    )

    assert '<img src=x onerror="alert(1)">' not in html
    assert "&lt;img" in html


@pytest.mark.asyncio
async def test_html_export_escapes_sql_queries(db):
    """Test that SQL queries with special characters are escaped."""
    await db.execute(
        "INSERT INTO messages VALUES "
        "('m4', 'c1', 'assistant', 'Result:', "
        "'SELECT * FROM t WHERE x = ''<script>''', "
        "NULL, NULL, '2024-01-01T00:00:03', NULL, NULL, NULL)"
    )
    await db.commit()

    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(db, "c1", "Test Conv")

    # The SQL query should be escaped
    assert "&lt;script&gt;" in html


@pytest.mark.asyncio
async def test_html_export_empty_conversation(db):
    """Test HTML export for a conversation with no messages."""
    await db.execute(
        "INSERT INTO conversations VALUES "
        "('c_empty', 'u1', 'Empty', 0, NULL, NULL, "
        "'2024-01-01T00:00:00', '2024-01-01T00:00:00')"
    )
    await db.commit()

    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(db, "c_empty", "Empty")

    assert "<!DOCTYPE html>" in html
    assert "Empty" in html
    assert '<div class="messages">' in html


@pytest.mark.asyncio
async def test_html_export_includes_datasets(db):
    """Test that datasets section appears when datasets exist."""
    await db.execute(
        "INSERT INTO datasets VALUES "
        "('d1', 'c1', 'https://example.com/data.csv', 'sales_data', "
        "1000, 5, '[]', 'ready', NULL, '2024-01-01T00:00:00', NULL, '{}')"
    )
    await db.commit()

    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(db, "c1", "Test Conv")

    assert "Datasets" in html
    assert "sales_data" in html
    assert "1,000 rows" in html
    assert "5 columns" in html


@pytest.mark.asyncio
async def test_html_export_has_dark_mode(db):
    """Test that the HTML includes dark mode CSS."""
    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(db, "c1", "Test Conv")

    assert "prefers-color-scheme: dark" in html


@pytest.mark.asyncio
async def test_html_export_has_print_styles(db):
    """Test that the HTML includes print-friendly styles."""
    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(db, "c1", "Test Conv")

    assert "@media print" in html


@pytest.mark.asyncio
async def test_html_export_message_roles(db):
    """Test that user and assistant messages have correct role classes."""
    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(db, "c1", "Test Conv")

    assert 'class="message user"' in html
    assert 'class="message assistant"' in html
    assert ">You<" in html
    assert ">Assistant<" in html


@pytest.mark.asyncio
async def test_html_export_no_datasets_section_when_empty(db):
    """Test that the datasets section div is omitted when no datasets exist."""
    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(db, "c1", "Test Conv")

    # The CSS may reference .datasets-section, but the actual <div> should not appear
    assert '<div class="datasets-section">' not in html


@pytest.mark.asyncio
async def test_html_export_multiline_content(db):
    """Test that multiline content is rendered with line breaks."""
    await db.execute(
        "INSERT INTO messages VALUES "
        "('m5', 'c1', 'user', 'Line 1\nLine 2\nLine 3', "
        "NULL, NULL, NULL, '2024-01-01T00:00:04', NULL, NULL, NULL)"
    )
    await db.commit()

    from app.routers.conversations import _generate_conversation_html

    html = await _generate_conversation_html(db, "c1", "Test Conv")

    assert "Line 1<br>Line 2<br>Line 3" in html
