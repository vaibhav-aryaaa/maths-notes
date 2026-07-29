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
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS shares (
                    share_id VARCHAR(50) PRIMARY KEY,
                    image TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)
        else:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS shares (
                    share_id TEXT PRIMARY KEY,
                    image TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)
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
        # 30 days expiry check
        if int(time.time()) - created_at > 30 * 24 * 3600:
            # Lazy cleanup
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
