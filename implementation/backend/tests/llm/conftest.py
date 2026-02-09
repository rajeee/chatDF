"""Shared fixtures for LLM service tests.

Provides:
- ``mock_gemini_client``: Mocked Google GenAI client (async path)
- ``mock_ws_send``: Captures WebSocket events
- ``sample_datasets``: Datasets for system prompt tests
- ``MockChunk``: Helper to simulate Gemini stream chunks
- ``make_text_stream``: Factory for text-only streaming responses
- ``make_tool_call_stream``: Factory for tool-call streaming responses
"""

from __future__ import annotations

from dataclasses import dataclass, field
from unittest.mock import MagicMock, AsyncMock, patch

import pytest


# ---------------------------------------------------------------------------
# MockChunk — simulates Gemini stream chunks
# ---------------------------------------------------------------------------

@dataclass
class MockPart:
    """Simulates a Gemini response Part with either text or function_call."""
    text: str | None = None
    function_call: object | None = None
    thought: bool = False


@dataclass
class MockFunctionCall:
    """Simulates a Gemini FunctionCall."""
    name: str = ""
    args: dict = field(default_factory=dict)


@dataclass
class MockUsageMetadata:
    """Simulates Gemini usage_metadata."""
    prompt_token_count: int = 0
    candidates_token_count: int = 0


@dataclass
class MockCandidate:
    """Simulates a Gemini response candidate."""
    content: object = None


@dataclass
class MockContent:
    """Simulates a Gemini Content object."""
    parts: list = field(default_factory=list)
    role: str = "model"


@dataclass
class MockChunk:
    """Simulates a single Gemini stream chunk.

    A chunk has either text or a function_call (tool call).
    """
    text: str | None = None
    _function_call: MockFunctionCall | None = None

    @property
    def candidates(self):
        parts = []
        if self.text is not None:
            parts.append(MockPart(text=self.text))
        if self._function_call is not None:
            parts.append(MockPart(function_call=self._function_call))
        content = MockContent(parts=parts, role="model")
        return [MockCandidate(content=content)]

    @property
    def parts(self):
        """Shorthand to get parts from the first candidate."""
        if self.candidates:
            return self.candidates[0].content.parts
        return []

    # usage_metadata defaults to None for intermediate chunks
    usage_metadata: MockUsageMetadata | None = None


class MockStreamResponse:
    """Simulates an async-iterable Gemini streaming response.

    Async-iterating yields MockChunk objects. The last chunk carries
    ``usage_metadata``.
    """

    def __init__(self, chunks: list[MockChunk], usage: MockUsageMetadata | None = None):
        self._chunks = chunks
        self._usage = usage or MockUsageMetadata()
        # Set usage_metadata on the LAST chunk (like real Gemini SDK)
        if self._chunks:
            self._chunks[-1].usage_metadata = self._usage

    def __aiter__(self):
        return _AsyncChunkIter(self._chunks)


class _AsyncChunkIter:
    """Async iterator over a list of MockChunk."""

    def __init__(self, chunks: list[MockChunk]):
        self._chunks = chunks
        self._index = 0

    async def __anext__(self):
        if self._index >= len(self._chunks):
            raise StopAsyncIteration
        chunk = self._chunks[self._index]
        self._index += 1
        return chunk


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_datasets():
    """Two datasets with schema info for system prompt tests."""
    return [
        {
            "name": "table1",
            "url": "https://example.com/table1.parquet",
            "schema_json": '[{"name": "id", "type": "Int64"}, {"name": "city", "type": "Utf8"}]',
            "row_count": 100,
        },
        {
            "name": "table2",
            "url": "https://example.com/table2.parquet",
            "schema_json": '[{"name": "id", "type": "Int64"}, {"name": "sales", "type": "Float64"}]',
            "row_count": 500,
        },
    ]


@pytest.fixture
def mock_ws_send():
    """Async callable that captures WebSocket events sent during streaming.

    stream_chat calls ``await ws_send(message_dict)`` where message_dict has
    a ``type`` field plus data.  We record every dict sent.
    """
    sent: list[dict] = []

    async def send(msg: dict) -> None:
        sent.append(msg)

    send.messages = sent  # type: ignore[attr-defined]
    return send


@pytest.fixture
def mock_gemini_client(monkeypatch):
    """Mocked Google GenAI client (async path: client.aio.models).

    By default returns a simple two-chunk text stream.
    Tests can override ``mock_client.aio.models.generate_content_stream``
    to customize behavior.
    """
    mock_client = MagicMock()

    default_stream = MockStreamResponse(
        chunks=[
            MockChunk(text="Hello "),
            MockChunk(text="world"),
        ],
        usage=MockUsageMetadata(prompt_token_count=50, candidates_token_count=10),
    )
    mock_client.aio.models.generate_content_stream = AsyncMock(return_value=default_stream)

    monkeypatch.setattr("app.services.llm_service.client", mock_client)
    return mock_client


@pytest.fixture
def mock_pool():
    """Mock worker pool passed as the ``pool`` parameter to stream_chat."""
    pool = MagicMock()
    pool.run_query = AsyncMock(return_value={
        "rows": [{"id": 1}],
        "columns": ["id"],
        "total_rows": 1,
    })
    return pool


def make_text_stream(
    texts: list[str],
    prompt_tokens: int = 50,
    candidates_tokens: int = 10,
) -> MockStreamResponse:
    """Factory: creates a MockStreamResponse with text-only chunks."""
    chunks = [MockChunk(text=t) for t in texts]
    return MockStreamResponse(
        chunks=chunks,
        usage=MockUsageMetadata(
            prompt_token_count=prompt_tokens,
            candidates_token_count=candidates_tokens,
        ),
    )


def make_tool_call_stream(
    tool_name: str,
    tool_args: dict,
    prompt_tokens: int = 30,
    candidates_tokens: int = 5,
) -> MockStreamResponse:
    """Factory: creates a MockStreamResponse with a single tool call chunk."""
    fc = MockFunctionCall(name=tool_name, args=tool_args)
    chunks = [MockChunk(_function_call=fc)]
    return MockStreamResponse(
        chunks=chunks,
        usage=MockUsageMetadata(
            prompt_token_count=prompt_tokens,
            candidates_token_count=candidates_tokens,
        ),
    )


def make_mixed_stream(
    pre_text: list[str],
    tool_name: str,
    tool_args: dict,
    prompt_tokens: int = 40,
    candidates_tokens: int = 8,
) -> MockStreamResponse:
    """Factory: text chunks followed by a tool call chunk."""
    chunks = [MockChunk(text=t) for t in pre_text]
    fc = MockFunctionCall(name=tool_name, args=tool_args)
    chunks.append(MockChunk(_function_call=fc))
    return MockStreamResponse(
        chunks=chunks,
        usage=MockUsageMetadata(
            prompt_token_count=prompt_tokens,
            candidates_token_count=candidates_tokens,
        ),
    )
