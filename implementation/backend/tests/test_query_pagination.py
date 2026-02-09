"""Tests for server-side query result pagination."""
import math
import pytest
from app.models import RunQueryRequest, RunQueryResponse


def test_run_query_request_defaults():
    req = RunQueryRequest(sql="SELECT 1")
    assert req.page == 1
    assert req.page_size == 100


def test_run_query_request_custom_page():
    req = RunQueryRequest(sql="SELECT 1", page=3, page_size=50)
    assert req.page == 3
    assert req.page_size == 50


def test_run_query_request_page_validation():
    with pytest.raises(Exception):
        RunQueryRequest(sql="SELECT 1", page=0)
    with pytest.raises(Exception):
        RunQueryRequest(sql="SELECT 1", page_size=0)
    with pytest.raises(Exception):
        RunQueryRequest(sql="SELECT 1", page_size=1001)


def test_run_query_response_pagination_fields():
    resp = RunQueryResponse(
        columns=["a"], rows=[[1]], total_rows=100,
        execution_time_ms=1.0, page=2, page_size=10, total_pages=10
    )
    assert resp.page == 2
    assert resp.page_size == 10
    assert resp.total_pages == 10


def test_run_query_response_defaults():
    resp = RunQueryResponse(
        columns=["a"], rows=[[1]], total_rows=1, execution_time_ms=1.0
    )
    assert resp.page == 1
    assert resp.page_size == 100
    assert resp.total_pages == 1
