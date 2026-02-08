"""Tests for database connection pool.

Tests the DatabasePool class for concurrent read operations.
"""
import asyncio
import tempfile

import pytest

from app.database import DatabasePool


@pytest.mark.asyncio
async def test_pool_initialization():
    """Test that the pool initializes with correct number of connections."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    pool = DatabasePool(db_path, pool_size=3)
    await pool.initialize()

    try:
        # Verify write connection exists
        write_conn = pool.get_write_connection()
        assert write_conn is not None

        # Verify we can acquire all connections from the pool
        connections = []
        for _ in range(3):
            conn = await pool.acquire_read()
            connections.append(conn)

        # Pool should be empty now - next acquire should block
        # (we don't test blocking behavior, just verify we got 3 connections)
        assert len(connections) == 3

        # Release all connections
        for conn in connections:
            await pool.release_read(conn)

    finally:
        await pool.close()


@pytest.mark.asyncio
async def test_concurrent_reads():
    """Test that multiple read operations can run concurrently."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    pool = DatabasePool(db_path, pool_size=3)
    await pool.initialize()

    try:
        # Create a simple table for testing
        write_conn = pool.get_write_connection()
        await write_conn.execute(
            "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)"
        )
        await write_conn.execute("INSERT INTO test (value) VALUES ('test')")
        await write_conn.commit()

        # Run multiple concurrent read queries
        async def read_query():
            conn = await pool.acquire_read()
            try:
                cursor = await conn.execute("SELECT * FROM test")
                result = await cursor.fetchall()
                return result
            finally:
                await pool.release_read(conn)

        # Run 5 concurrent reads (more than pool size)
        results = await asyncio.gather(*[read_query() for _ in range(5)])

        # All reads should succeed and return the same data
        assert len(results) == 5
        for result in results:
            assert len(result) == 1
            assert result[0][1] == "test"

    finally:
        await pool.close()


@pytest.mark.asyncio
async def test_write_connection_isolation():
    """Test that write connection is separate from read pool."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    pool = DatabasePool(db_path, pool_size=2)
    await pool.initialize()

    try:
        # Get write connection
        write_conn = pool.get_write_connection()

        # Create table and insert data
        await write_conn.execute(
            "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)"
        )
        await write_conn.execute("INSERT INTO test (value) VALUES ('write')")
        await write_conn.commit()

        # Read connection should see the committed data
        read_conn = await pool.acquire_read()
        try:
            cursor = await read_conn.execute("SELECT * FROM test")
            result = await cursor.fetchall()
            assert len(result) == 1
            assert result[0][1] == "write"
        finally:
            await pool.release_read(read_conn)

    finally:
        await pool.close()


@pytest.mark.asyncio
async def test_pool_close():
    """Test that closing the pool releases all resources."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    pool = DatabasePool(db_path, pool_size=2)
    await pool.initialize()

    # Close the pool
    await pool.close()

    # After closing, get_write_connection should raise error
    with pytest.raises(RuntimeError, match="Pool not initialized"):
        pool.get_write_connection()
