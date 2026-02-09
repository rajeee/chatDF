"""Shared fixtures for worker tests.

Provides:
- ``parquet_dir``: Path to directory containing test parquet files
- ``parquet_server``: Local HTTP server URL serving test parquet files
- ``simple_parquet_url``: URL to simple.parquet (10 rows, 3 cols)
- ``large_parquet_url``: URL to large.parquet (2000 rows)
- ``empty_parquet_url``: URL to empty.parquet (0 rows)
- ``wide_parquet_url``: URL to wide.parquet (100 cols)
- ``not_parquet_url``: URL to not_parquet.csv (invalid parquet)
- ``sample_datasets``: Dataset dicts for SQL execution tests
- ``worker_pool``: Real multiprocessing pool with 2 workers
"""

from __future__ import annotations

import functools
import http.server
import multiprocessing
import os
import threading
from pathlib import Path

import polars as pl
import pytest


FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _generate_fixtures() -> None:
    """Generate test parquet files if they don't exist."""
    fixtures_dir = FIXTURES_DIR
    fixtures_dir.mkdir(parents=True, exist_ok=True)

    simple_path = fixtures_dir / "simple.parquet"
    if not simple_path.exists():
        pl.DataFrame(
            {
                "id": list(range(10)),
                "name": [f"item_{i}" for i in range(10)],
                "value": [i * 1.5 for i in range(10)],
            }
        ).write_parquet(simple_path)

    empty_path = fixtures_dir / "empty.parquet"
    if not empty_path.exists():
        pl.DataFrame(
            {
                "a": pl.Series([], dtype=pl.Int64),
                "b": pl.Series([], dtype=pl.Utf8),
            }
        ).write_parquet(empty_path)

    wide_path = fixtures_dir / "wide.parquet"
    if not wide_path.exists():
        pl.DataFrame(
            {f"col_{i}": list(range(5)) for i in range(100)}
        ).write_parquet(wide_path)

    large_path = fixtures_dir / "large.parquet"
    if not large_path.exists():
        pl.DataFrame(
            {"id": list(range(2000)), "val": list(range(2000))}
        ).write_parquet(large_path)

    nulls_path = fixtures_dir / "nulls.parquet"
    if not nulls_path.exists():
        pl.DataFrame(
            {
                "id": [1, 2, 3, 4, 5],
                "score": [10.0, None, 30.0, None, 50.0],
                "label": ["a", "bb", None, "dddd", None],
            }
        ).write_parquet(nulls_path)

    not_parquet_path = fixtures_dir / "not_parquet.csv"
    if not not_parquet_path.exists():
        not_parquet_path.write_text("a,b,c\n1,2,3\n4,5,6\n")


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler that doesn't log to stderr."""

    def log_message(self, format, *args):
        pass


@pytest.fixture(scope="session", autouse=True)
def _generate_parquet_files():
    """Ensure test parquet fixture files exist."""
    _generate_fixtures()


@pytest.fixture(scope="session")
def parquet_dir() -> Path:
    """Path to the test parquet fixtures directory."""
    _generate_fixtures()
    return FIXTURES_DIR


@pytest.fixture(scope="session")
def parquet_server(parquet_dir):
    """Start a local HTTP server serving test parquet files. Yields the base URL."""
    handler = functools.partial(_QuietHandler, directory=str(parquet_dir))
    server = http.server.HTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


@pytest.fixture
def simple_parquet_url(parquet_server):
    return f"{parquet_server}/simple.parquet"


@pytest.fixture
def large_parquet_url(parquet_server):
    return f"{parquet_server}/large.parquet"


@pytest.fixture
def empty_parquet_url(parquet_server):
    return f"{parquet_server}/empty.parquet"


@pytest.fixture
def wide_parquet_url(parquet_server):
    return f"{parquet_server}/wide.parquet"


@pytest.fixture
def nulls_parquet_url(parquet_server):
    return f"{parquet_server}/nulls.parquet"


@pytest.fixture
def not_parquet_url(parquet_server):
    return f"{parquet_server}/not_parquet.csv"


@pytest.fixture
def sample_datasets(parquet_server):
    """Dataset dicts for SQL execution tests."""
    return [
        {"url": f"{parquet_server}/simple.parquet", "table_name": "table1"},
    ]


@pytest.fixture
def two_table_datasets(parquet_server):
    """Two-table dataset dicts for multi-table SQL tests."""
    return [
        {"url": f"{parquet_server}/simple.parquet", "table_name": "table1"},
        {"url": f"{parquet_server}/large.parquet", "table_name": "table2"},
    ]


@pytest.fixture
def large_datasets(parquet_server):
    """Dataset dict for the large parquet (2000 rows) table."""
    return [
        {"url": f"{parquet_server}/large.parquet", "table_name": "big_table"},
    ]


@pytest.fixture
def worker_pool():
    """Real multiprocessing pool with 2 workers for integration tests."""
    pool = multiprocessing.Pool(processes=2, maxtasksperchild=50)
    yield pool
    pool.terminate()
    pool.join()
