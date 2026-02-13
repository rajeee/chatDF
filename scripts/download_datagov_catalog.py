#!/usr/bin/env python3
"""
Download the data.gov CKAN catalog into a SQLite database.

Paginates through the CKAN package_search API and stores datasets,
resources, organizations, and tags in a normalized SQLite schema
with FTS5 full-text search support.

Usage:
    python scripts/download_datagov_catalog.py [OPTIONS]

Options:
    --db PATH          Output SQLite path (default: datagov_catalog.db)
    --batch-size N     Rows per API request (default: 500)
    --delay SECS       Delay between requests (default: 0.5)
    --resume           Resume from last fetched offset
    --csv-only         Only fetch datasets with CSV resources
    --max-datasets N   Stop after N datasets (for testing)
"""

import argparse
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API_BASE = "https://catalog.data.gov/api/3/action/package_search"
USER_AGENT = "ChatDF-CatalogDownloader/1.0"

# --- Extras fields to flatten into dataset columns ---
EXTRAS_FIELDS = {
    "accessLevel": "access_level",
    "identifier": "identifier",
    "issued": "issued",
    "modified": "modified_extra",
    "landingPage": "landing_page",
    "temporal": "temporal",
    "spatial": "spatial",
    "theme": "theme",
    "accrualPeriodicity": "accrual_periodicity",
    "publisher": "publisher_extra",
    "harvest_source_title": "harvest_source_title",
}


def create_tables(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS datasets (
            id TEXT PRIMARY KEY,
            name TEXT,
            title TEXT,
            notes TEXT,
            maintainer TEXT,
            license_id TEXT,
            license_title TEXT,
            organization_id TEXT,
            state TEXT,
            num_resources INTEGER,
            num_tags INTEGER,
            metadata_created TEXT,
            metadata_modified TEXT,
            access_level TEXT,
            identifier TEXT,
            issued TEXT,
            modified_extra TEXT,
            landing_page TEXT,
            temporal TEXT,
            spatial TEXT,
            theme TEXT,
            accrual_periodicity TEXT,
            publisher_extra TEXT,
            harvest_source_title TEXT,
            extras_json TEXT,
            fetched_at TEXT
        );

        CREATE TABLE IF NOT EXISTS resources (
            id TEXT PRIMARY KEY,
            dataset_id TEXT NOT NULL,
            name TEXT,
            description TEXT,
            url TEXT,
            format TEXT,
            mimetype TEXT,
            state TEXT,
            position INTEGER,
            created TEXT,
            metadata_modified TEXT,
            tracking_total INTEGER,
            tracking_recent INTEGER,
            FOREIGN KEY (dataset_id) REFERENCES datasets(id)
        );

        CREATE TABLE IF NOT EXISTS organizations (
            id TEXT PRIMARY KEY,
            name TEXT,
            title TEXT,
            description TEXT,
            image_url TEXT,
            state TEXT,
            created TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE
        );

        CREATE TABLE IF NOT EXISTS dataset_tags (
            dataset_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (dataset_id, tag_id),
            FOREIGN KEY (dataset_id) REFERENCES datasets(id),
            FOREIGN KEY (tag_id) REFERENCES tags(id)
        );

        CREATE TABLE IF NOT EXISTS fetch_progress (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            total_count INTEGER,
            last_offset INTEGER,
            started_at TEXT,
            updated_at TEXT,
            completed INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_datasets_name ON datasets(name);
        CREATE INDEX IF NOT EXISTS idx_datasets_org ON datasets(organization_id);
        CREATE INDEX IF NOT EXISTS idx_datasets_modified ON datasets(metadata_modified);
        CREATE INDEX IF NOT EXISTS idx_resources_dataset ON resources(dataset_id);
        CREATE INDEX IF NOT EXISTS idx_resources_format ON resources(format);
        CREATE INDEX IF NOT EXISTS idx_dataset_tags_tag ON dataset_tags(tag_id);
    """)


def build_fts(conn: sqlite3.Connection) -> None:
    """Build or rebuild the FTS5 full-text search index."""
    print("Building FTS5 index...")
    conn.executescript("""
        DROP TABLE IF EXISTS datasets_fts;
        CREATE VIRTUAL TABLE datasets_fts USING fts5(
            title, notes, publisher_extra, theme,
            content=datasets,
            content_rowid=rowid
        );
        INSERT INTO datasets_fts(rowid, title, notes, publisher_extra, theme)
            SELECT rowid, title, notes, publisher_extra, theme FROM datasets;
    """)
    print("FTS5 index built.")


def fetch_page(url: str, retries: int = 3) -> dict:
    """Fetch a single API page with retries and exponential backoff."""
    req = Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if not data.get("success"):
                    raise RuntimeError(f"API returned success=false: {url}")
                return data["result"]
        except HTTPError as e:
            if 400 <= e.code < 500:
                print(f"  WARNING: HTTP {e.code} for {url}, skipping batch")
                return None
            if attempt < retries - 1:
                wait = 2**attempt
                print(f"  HTTP {e.code}, retrying in {wait}s (attempt {attempt + 1}/{retries})")
                time.sleep(wait)
            else:
                raise
        except (URLError, TimeoutError, OSError) as e:
            if attempt < retries - 1:
                wait = 2**attempt
                print(f"  Network error: {e}, retrying in {wait}s (attempt {attempt + 1}/{retries})")
                time.sleep(wait)
            else:
                raise
        except json.JSONDecodeError as e:
            if attempt < retries - 1:
                wait = 2**attempt
                print(f"  JSON decode error: {e}, retrying in {wait}s (attempt {attempt + 1}/{retries})")
                time.sleep(wait)
            else:
                raise
    return None


def extract_extras(extras_list: list) -> dict:
    """Convert CKAN extras list [{key, value}, ...] to a dict."""
    if not extras_list:
        return {}
    return {item["key"]: item["value"] for item in extras_list if "key" in item}


def process_batch(conn: sqlite3.Connection, results: list, fetched_at: str) -> tuple[int, int]:
    """Insert a batch of datasets into the database. Returns (datasets_count, resources_count)."""
    datasets_count = 0
    resources_count = 0

    for pkg in results:
        extras = extract_extras(pkg.get("extras"))

        # Flatten extras into columns
        flat = {}
        for ckan_key, col_name in EXTRAS_FIELDS.items():
            val = extras.get(ckan_key)
            # publisher can be a JSON object with "name" key
            if col_name == "publisher_extra" and val:
                try:
                    parsed = json.loads(val)
                    if isinstance(parsed, dict):
                        val = parsed.get("name", val)
                except (json.JSONDecodeError, TypeError):
                    pass
            # Serialize lists/dicts to JSON strings for SQLite
            if isinstance(val, (list, dict)):
                val = json.dumps(val, default=str)
            flat[col_name] = val

        org = pkg.get("organization") or {}
        org_id = org.get("id")

        # Upsert organization
        if org_id:
            conn.execute(
                """INSERT OR REPLACE INTO organizations
                   (id, name, title, description, image_url, state, created)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    org_id,
                    org.get("name"),
                    org.get("title"),
                    org.get("description"),
                    org.get("image_url"),
                    org.get("state"),
                    org.get("created"),
                ),
            )

        # Insert dataset
        conn.execute(
            """INSERT OR REPLACE INTO datasets
               (id, name, title, notes, maintainer, license_id, license_title,
                organization_id, state, num_resources, num_tags,
                metadata_created, metadata_modified,
                access_level, identifier, issued, modified_extra,
                landing_page, temporal, spatial, theme,
                accrual_periodicity, publisher_extra, harvest_source_title,
                extras_json, fetched_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                pkg["id"],
                pkg.get("name"),
                pkg.get("title"),
                pkg.get("notes"),
                pkg.get("maintainer"),
                pkg.get("license_id"),
                pkg.get("license_title"),
                org_id,
                pkg.get("state"),
                pkg.get("num_resources", 0),
                pkg.get("num_tags", 0),
                pkg.get("metadata_created"),
                pkg.get("metadata_modified"),
                flat.get("access_level"),
                flat.get("identifier"),
                flat.get("issued"),
                flat.get("modified_extra"),
                flat.get("landing_page"),
                flat.get("temporal"),
                flat.get("spatial"),
                flat.get("theme"),
                flat.get("accrual_periodicity"),
                flat.get("publisher_extra"),
                flat.get("harvest_source_title"),
                json.dumps(pkg.get("extras", []), default=str),
                fetched_at,
            ),
        )
        datasets_count += 1

        # Insert resources
        for res in pkg.get("resources", []):
            tracking = res.get("tracking_summary") or {}
            conn.execute(
                """INSERT OR REPLACE INTO resources
                   (id, dataset_id, name, description, url, format, mimetype,
                    state, position, created, metadata_modified,
                    tracking_total, tracking_recent)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    res["id"],
                    pkg["id"],
                    res.get("name"),
                    res.get("description"),
                    res.get("url"),
                    res.get("format"),
                    res.get("mimetype"),
                    res.get("state"),
                    res.get("position"),
                    res.get("created"),
                    res.get("metadata_modified"),
                    tracking.get("total", 0),
                    tracking.get("recent", 0),
                ),
            )
            resources_count += 1

        # Insert tags
        for tag in pkg.get("tags", []):
            tag_id = tag.get("id")
            tag_name = tag.get("name") or tag.get("display_name")
            if tag_id and tag_name:
                conn.execute(
                    "INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)",
                    (tag_id, tag_name),
                )
                conn.execute(
                    "INSERT OR IGNORE INTO dataset_tags (dataset_id, tag_id) VALUES (?, ?)",
                    (pkg["id"], tag_id),
                )

    return datasets_count, resources_count


def get_resume_offset(conn: sqlite3.Connection) -> int | None:
    """Get the last offset from fetch_progress, or None if no progress."""
    row = conn.execute(
        "SELECT last_offset, completed FROM fetch_progress WHERE id = 1"
    ).fetchone()
    if row is None:
        return None
    if row[1]:  # completed
        return None
    return row[0]


def update_progress(conn: sqlite3.Connection, total_count: int, offset: int, completed: bool = False) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO fetch_progress (id, total_count, last_offset, started_at, updated_at, completed)
           VALUES (1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
               total_count = excluded.total_count,
               last_offset = excluded.last_offset,
               updated_at = excluded.updated_at,
               completed = excluded.completed""",
        (total_count, offset, now, now, int(completed)),
    )


def print_stats(conn: sqlite3.Connection, db_path: str) -> None:
    datasets = conn.execute("SELECT COUNT(*) FROM datasets").fetchone()[0]
    resources = conn.execute("SELECT COUNT(*) FROM resources").fetchone()[0]
    orgs = conn.execute("SELECT COUNT(*) FROM organizations").fetchone()[0]
    tags = conn.execute("SELECT COUNT(*) FROM tags").fetchone()[0]
    db_size = os.path.getsize(db_path)

    print("\n--- Final Stats ---")
    print(f"  Datasets:      {datasets:,}")
    print(f"  Resources:     {resources:,}")
    print(f"  Organizations: {orgs:,}")
    print(f"  Tags:          {tags:,}")
    print(f"  DB size:       {db_size / 1024 / 1024:.1f} MB")


def main():
    parser = argparse.ArgumentParser(description="Download data.gov CKAN catalog into SQLite")
    parser.add_argument("--db", default="datagov_catalog.db", help="Output SQLite path (default: datagov_catalog.db)")
    parser.add_argument("--batch-size", type=int, default=500, help="Rows per API request (default: 500)")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between requests in seconds (default: 0.5)")
    parser.add_argument("--resume", action="store_true", help="Resume from last fetched offset")
    parser.add_argument("--csv-only", action="store_true", help="Only fetch datasets with CSV resources")
    parser.add_argument("--max-datasets", type=int, default=0, help="Stop after N datasets (0 = unlimited)")
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    create_tables(conn)
    conn.commit()

    # Determine starting offset
    start_offset = 0
    if args.resume:
        resumed = get_resume_offset(conn)
        if resumed is not None:
            start_offset = resumed + args.batch_size
            print(f"Resuming from offset {start_offset}")
        else:
            print("No incomplete progress found, starting from 0")

    # Build URL
    fq = "&fq=res_format:CSV" if args.csv_only else ""
    base_url = f"{API_BASE}?sort=name+asc&rows={args.batch_size}{fq}"

    # First request to get total count
    print(f"Fetching catalog from {API_BASE}")
    if args.csv_only:
        print("  Filter: CSV resources only")

    url = f"{base_url}&start={start_offset}"
    result = fetch_page(url)
    if result is None:
        print("ERROR: Failed to fetch first page, aborting.")
        conn.close()
        sys.exit(1)

    total_count = result["count"]
    effective_total = min(total_count, args.max_datasets) if args.max_datasets > 0 else total_count
    total_batches = (effective_total + args.batch_size - 1) // args.batch_size

    print(f"  Total available: {total_count:,} datasets")
    if args.max_datasets > 0:
        print(f"  Limiting to: {effective_total:,} datasets")
    print()

    # Process first batch
    fetched_at = datetime.now(timezone.utc).isoformat()
    total_datasets = 0
    total_resources = 0

    batch_results = result["results"]
    if args.max_datasets > 0:
        remaining = args.max_datasets - total_datasets
        batch_results = batch_results[:remaining]

    d, r = process_batch(conn, batch_results, fetched_at)
    total_datasets += d
    total_resources += r
    update_progress(conn, total_count, start_offset)
    conn.commit()

    batch_num = (start_offset // args.batch_size) + 1
    print(f"  [{batch_num}/{total_batches}] Fetched {total_datasets:,} / {effective_total:,} datasets")

    # Paginate through remaining
    offset = start_offset + args.batch_size
    try:
        while offset < total_count:
            if args.max_datasets > 0 and total_datasets >= args.max_datasets:
                print(f"\nReached --max-datasets limit ({args.max_datasets})")
                break

            time.sleep(args.delay)

            url = f"{base_url}&start={offset}"
            result = fetch_page(url)
            if result is None:
                print(f"  Skipping batch at offset {offset}")
                offset += args.batch_size
                continue

            if not result["results"]:
                print("  No more results, done.")
                break

            fetched_at = datetime.now(timezone.utc).isoformat()
            batch_results = result["results"]
            if args.max_datasets > 0:
                remaining = args.max_datasets - total_datasets
                batch_results = batch_results[:remaining]

            d, r = process_batch(conn, batch_results, fetched_at)
            total_datasets += d
            total_resources += r
            update_progress(conn, total_count, offset)
            conn.commit()

            batch_num = (offset // args.batch_size) + 1
            print(f"  [{batch_num}/{total_batches}] Fetched {total_datasets:,} / {effective_total:,} datasets")

            offset += args.batch_size

    except KeyboardInterrupt:
        print("\n\nInterrupted! Progress saved — use --resume to continue.")
        conn.commit()
        print_stats(conn, args.db)
        conn.close()
        sys.exit(0)

    # Mark complete and build FTS
    update_progress(conn, total_count, offset, completed=True)
    conn.commit()

    build_fts(conn)
    conn.commit()

    print_stats(conn, args.db)
    conn.close()
    print(f"\nDone! Database saved to: {args.db}")


if __name__ == "__main__":
    main()
