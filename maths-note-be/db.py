import sqlite3
import json
import time
import os

DATABASE_URL = os.environ.get("DATABASE_URL")
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "shares.db"))

def get_connection():
    if DATABASE_URL:
        import psycopg2
        url = DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return psycopg2.connect(url), "%s"
    else:
        return sqlite3.connect(DB_PATH), "?"

def init_db():
    conn, _ = get_connection()
    try:
        cursor = conn.cursor()
        if DATABASE_URL:
            # 1. Shares table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS shares (
                    share_id VARCHAR(50) PRIMARY KEY,
                    image TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)
            # 2. User history table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS history (
                    id VARCHAR(50) PRIMARY KEY,
                    user_id VARCHAR(50) NOT NULL,
                    timestamp BIGINT NOT NULL,
                    canvas_thumbnail TEXT NOT NULL,
                    canvas_image TEXT NOT NULL,
                    results TEXT NOT NULL,
                    dict_of_vars TEXT NOT NULL
                )
            """)
            # 3. Index on user_id
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_user_id ON history (user_id)")
        else:
            # 1. Shares table (SQLite)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS shares (
                    share_id TEXT PRIMARY KEY,
                    image TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)
            # 2. User history table (SQLite)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS history (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    canvas_thumbnail TEXT NOT NULL,
                    canvas_image TEXT NOT NULL,
                    results TEXT NOT NULL,
                    dict_of_vars TEXT NOT NULL
                )
            """)
            # 3. Index on user_id
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_user_id ON history (user_id)")
        conn.commit()
    finally:
        conn.close()

def create_share(share_id: str, image: str, data: list) -> None:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"INSERT INTO shares (share_id, image, data, created_at) VALUES ({p}, {p}, {p}, {p})",
            (share_id, image, json.dumps(data), int(time.time()))
        )
        conn.commit()
    finally:
        conn.close()

def get_share(share_id: str) -> dict | None:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT image, data, created_at FROM shares WHERE share_id = {p}", (share_id,))
        row = cursor.fetchone()
        if not row:
            return None
        
        image, data_str, created_at = row
        if int(time.time()) - created_at > 30 * 24 * 3600:
            cursor.execute(f"DELETE FROM shares WHERE share_id = {p}", (share_id,))
            conn.commit()
            return None
            
        return {
            "image": image,
            "data": json.loads(data_str) if isinstance(data_str, str) else data_str
        }
    finally:
        conn.close()

def cleanup_expired_shares(max_age_days: int = 30) -> int:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cutoff = int(time.time()) - max_age_days * 24 * 3600
        cursor.execute(f"DELETE FROM shares WHERE created_at < {p}", (cutoff,))
        deleted = cursor.rowcount
        conn.commit()
        return deleted
    finally:
        conn.close()

# --- User Calculation History CRUD Sync Functions ---

def get_user_history(user_id: str) -> list:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT id, timestamp, canvas_thumbnail, canvas_image, results, dict_of_vars FROM history WHERE user_id = {p} ORDER BY timestamp DESC",
            (user_id,)
        )
        rows = cursor.fetchall()
        entries = []
        for row in rows:
            entry_id, timestamp, thumbnail, image, results_str, dict_of_vars_str = row
            entries.append({
                "id": entry_id,
                "timestamp": timestamp,
                "canvasThumbnail": thumbnail,
                "canvasImage": image,
                "results": json.loads(results_str) if isinstance(results_str, str) else results_str,
                "dictOfVars": json.loads(dict_of_vars_str) if isinstance(dict_of_vars_str, str) else dict_of_vars_str
            })
        return entries
    finally:
        conn.close()

def save_history_entry(user_id: str, entry: dict) -> None:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        if DATABASE_URL:
            # PostgreSQL ON CONFLICT DO UPDATE
            cursor.execute(
                f"""INSERT INTO history (id, user_id, timestamp, canvas_thumbnail, canvas_image, results, dict_of_vars)
                    VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p})
                    ON CONFLICT (id) DO UPDATE SET
                    timestamp = EXCLUDED.timestamp,
                    canvas_thumbnail = EXCLUDED.canvas_thumbnail,
                    canvas_image = EXCLUDED.canvas_image,
                    results = EXCLUDED.results,
                    dict_of_vars = EXCLUDED.dict_of_vars
                    WHERE history.user_id = EXCLUDED.user_id""",
                (
                    entry["id"],
                    user_id,
                    entry["timestamp"],
                    entry["canvasThumbnail"],
                    entry["canvasImage"],
                    json.dumps(entry["results"]),
                    json.dumps(entry["dictOfVars"])
                )
            )
        else:
            # SQLite ON CONFLICT DO UPDATE
            cursor.execute(
                f"""INSERT INTO history (id, user_id, timestamp, canvas_thumbnail, canvas_image, results, dict_of_vars)
                    VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p})
                    ON CONFLICT (id) DO UPDATE SET
                    timestamp = excluded.timestamp,
                    canvas_thumbnail = excluded.canvas_thumbnail,
                    canvas_image = excluded.canvas_image,
                    results = excluded.results,
                    dict_of_vars = excluded.dict_of_vars
                    WHERE history.user_id = excluded.user_id""",
                (
                    entry["id"],
                    user_id,
                    entry["timestamp"],
                    entry["canvasThumbnail"],
                    entry["canvasImage"],
                    json.dumps(entry["results"]),
                    json.dumps(entry["dictOfVars"])
                )
            )
        conn.commit()
    finally:
        conn.close()

def sync_history_entries(user_id: str, entries: list) -> list:
    for entry in entries:
        save_history_entry(user_id, entry)
    return get_user_history(user_id)

def delete_history_entry(user_id: str, entry_id: str) -> None:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"DELETE FROM history WHERE user_id = {p} AND id = {p}",
            (user_id, entry_id)
        )
        conn.commit()
    finally:
        conn.close()

def purge_user_history(user_id: str) -> None:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"DELETE FROM history WHERE user_id = {p}",
            (user_id,)
        )
        conn.commit()
    finally:
        conn.close()
