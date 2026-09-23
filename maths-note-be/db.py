import json
import logging
import os
import sqlite3
import time
import uuid
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL")
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "shares.db"))


def get_connection():
    if DATABASE_URL and (DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")):
        try:
            import psycopg2

            url = DATABASE_URL
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql://", 1)
            if "sslmode=" not in url and (
                "render.com" in url or "neon.tech" in url or "supabase" in url or "aws" in url or "pooler" in url
            ):
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}sslmode=require"
            return psycopg2.connect(url), "%s"
        except Exception as e:
            logger.warning(f"PostgreSQL connection failed ({e}). Falling back to SQLite.")
            os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
            return sqlite3.connect(DB_PATH), "?"
    else:
        os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
        return sqlite3.connect(DB_PATH), "?"


def init_db():
    conn, _ = get_connection()
    try:
        cursor = conn.cursor()
        is_postgres = not isinstance(conn, sqlite3.Connection)
        if is_postgres:
            # 1. Shares table (Postgres)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS shares (
                    share_id VARCHAR(50) PRIMARY KEY,
                    image TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at BIGINT NOT NULL
                )
            """)
            # 2. Folders table (Postgres)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS folders (
                    id VARCHAR(50) PRIMARY KEY,
                    user_id VARCHAR(50) NOT NULL,
                    name TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL,
                    deleted_at TIMESTAMPTZ
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders (user_id)")

            # 3. Canvases table (Postgres)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS canvases (
                    id VARCHAR(50) PRIMARY KEY,
                    user_id VARCHAR(50) NOT NULL,
                    folder_id VARCHAR(50) REFERENCES folders(id),
                    name TEXT NOT NULL,
                    thumbnail TEXT,
                    elements TEXT,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL,
                    deleted_at TIMESTAMPTZ
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_canvases_user_id ON canvases (user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_canvases_folder_id ON canvases (folder_id)")

            # 4. User history table (Postgres)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS history (
                    id VARCHAR(50) PRIMARY KEY,
                    user_id VARCHAR(50) NOT NULL,
                    timestamp BIGINT NOT NULL,
                    canvas_thumbnail TEXT NOT NULL,
                    canvas_image TEXT NOT NULL,
                    results TEXT NOT NULL,
                    dict_of_vars TEXT NOT NULL,
                    canvas_id VARCHAR(50) REFERENCES canvases(id)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_user_id ON history (user_id)")

            # Migration: Add canvas_id column to history if it was created before
            cursor.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='history' AND column_name='canvas_id'
                    ) THEN
                        ALTER TABLE history ADD COLUMN canvas_id VARCHAR(50) REFERENCES canvases(id);
                    END IF;
                END $$;
            """)
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
            # 2. Folders table (SQLite)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS folders (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders (user_id)")

            # 3. Canvases table (SQLite)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS canvases (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    folder_id TEXT REFERENCES folders(id),
                    name TEXT NOT NULL,
                    thumbnail TEXT,
                    elements TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_canvases_user_id ON canvases (user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_canvases_folder_id ON canvases (folder_id)")

            # 4. User history table (SQLite)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS history (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    canvas_thumbnail TEXT NOT NULL,
                    canvas_image TEXT NOT NULL,
                    results TEXT NOT NULL,
                    dict_of_vars TEXT NOT NULL,
                    canvas_id TEXT REFERENCES canvases(id)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_user_id ON history (user_id)")

            # Migration: Add canvas_id column to history if missing in SQLite
            cursor.execute("PRAGMA table_info(history)")
            cols = [r[1] for r in cursor.fetchall()]
            if "canvas_id" not in cols:
                cursor.execute("ALTER TABLE history ADD COLUMN canvas_id TEXT REFERENCES canvases(id)")

        conn.commit()
    finally:
        conn.close()


def create_share(share_id: str, image: str, data: list) -> None:
    try:
        conn, p = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                f"INSERT INTO shares (share_id, image, data, created_at) VALUES ({p}, {p}, {p}, {p})",
                (share_id, image, json.dumps(data), int(time.time())),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        # Auto-recover if table is missing
        if "no such table" in str(e).lower() or "does not exist" in str(e).lower():
            init_db()
            conn, p = get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    f"INSERT INTO shares (share_id, image, data, created_at) VALUES ({p}, {p}, {p}, {p})",
                    (share_id, image, json.dumps(data), int(time.time())),
                )
                conn.commit()
            finally:
                conn.close()
        else:
            raise e


def get_share(share_id: str) -> dict | None:
    try:
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

            return {"image": image, "data": json.loads(data_str) if isinstance(data_str, str) else data_str}
        finally:
            conn.close()
    except Exception as e:
        if "no such table" in str(e).lower() or "does not exist" in str(e).lower():
            init_db()
            return None
        raise e


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
            (user_id,),
        )
        rows = cursor.fetchall()
        entries = []
        for row in rows:
            entry_id, timestamp, thumbnail, image, results_str, dict_of_vars_str = row
            entries.append(
                {
                    "id": entry_id,
                    "timestamp": timestamp,
                    "canvasThumbnail": thumbnail,
                    "canvasImage": image,
                    "results": json.loads(results_str) if isinstance(results_str, str) else results_str,
                    "dictOfVars": json.loads(dict_of_vars_str)
                    if isinstance(dict_of_vars_str, str)
                    else dict_of_vars_str,
                }
            )
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
                    json.dumps(entry["dictOfVars"]),
                ),
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
                    json.dumps(entry["dictOfVars"]),
                ),
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
        cursor.execute(f"DELETE FROM history WHERE user_id = {p} AND id = {p}", (user_id, entry_id))
        conn.commit()
    finally:
        conn.close()


def purge_user_history(user_id: str) -> None:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(f"DELETE FROM history WHERE user_id = {p}", (user_id,))
        conn.commit()
    finally:
        conn.close()


# --- Helper for formatting datetime objects ---


def _format_datetime(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, (datetime,)):
        return val.isoformat()
    return str(val)


# --- Folders CRUD Functions ---


def create_folder(user_id: str, name: str) -> dict:
    folder_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""INSERT INTO folders (id, user_id, name, created_at, updated_at, deleted_at)
                VALUES ({p}, {p}, {p}, {p}, {p}, NULL)""",
            (folder_id, user_id, name, now, now),
        )
        conn.commit()
        return {
            "id": folder_id,
            "user_id": user_id,
            "name": name,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
    finally:
        conn.close()


def get_user_folders(user_id: str) -> list[dict]:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""SELECT id, user_id, name, created_at, updated_at, deleted_at
                FROM folders
                WHERE user_id = {p} AND deleted_at IS NULL
                ORDER BY created_at ASC""",
            (user_id,),
        )
        rows = cursor.fetchall()
        folders = []
        for row in rows:
            f_id, u_id, name, created_at, updated_at, deleted_at = row
            folders.append(
                {
                    "id": f_id,
                    "user_id": u_id,
                    "name": name,
                    "created_at": _format_datetime(created_at),
                    "updated_at": _format_datetime(updated_at),
                    "deleted_at": _format_datetime(deleted_at),
                }
            )
        return folders
    finally:
        conn.close()


def get_folder(user_id: str, folder_id: str) -> dict | None:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""SELECT id, user_id, name, created_at, updated_at, deleted_at
                FROM folders
                WHERE user_id = {p} AND id = {p} AND deleted_at IS NULL""",
            (user_id, folder_id),
        )
        row = cursor.fetchone()
        if not row:
            return None
        f_id, u_id, name, created_at, updated_at, deleted_at = row
        return {
            "id": f_id,
            "user_id": u_id,
            "name": name,
            "created_at": _format_datetime(created_at),
            "updated_at": _format_datetime(updated_at),
            "deleted_at": _format_datetime(deleted_at),
        }
    finally:
        conn.close()


def update_folder(user_id: str, folder_id: str, name: str) -> dict | None:
    now = datetime.now(UTC).isoformat()
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""UPDATE folders
                SET name = {p}, updated_at = {p}
                WHERE user_id = {p} AND id = {p} AND deleted_at IS NULL""",
            (name, now, user_id, folder_id),
        )
        if cursor.rowcount == 0:
            return None
        conn.commit()
        return get_folder(user_id, folder_id)
    finally:
        conn.close()


def delete_folder(user_id: str, folder_id: str) -> bool:
    now = datetime.now(UTC).isoformat()
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        # 1. Soft delete the folder
        cursor.execute(
            f"""UPDATE folders
                SET deleted_at = {p}, updated_at = {p}
                WHERE user_id = {p} AND id = {p} AND deleted_at IS NULL""",
            (now, now, user_id, folder_id),
        )
        if cursor.rowcount == 0:
            return False

        # 2. Orphan active notebooks in this folder to root (folder_id = NULL)
        cursor.execute(
            f"""UPDATE canvases
                SET folder_id = NULL, updated_at = {p}
                WHERE user_id = {p} AND folder_id = {p} AND deleted_at IS NULL""",
            (now, user_id, folder_id),
        )
        conn.commit()
        return True
    finally:
        conn.close()


# --- Canvases CRUD Functions ---


def create_canvas(
    user_id: str, name: str, folder_id: str | None = None, thumbnail: str | None = None, elements: Any = None
) -> dict:
    if folder_id:
        folder = get_folder(user_id, folder_id)
        if not folder:
            raise ValueError(f"Folder '{folder_id}' not found or not owned by user.")

    canvas_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    elements_json = json.dumps(elements) if elements is not None and not isinstance(elements, str) else elements

    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""INSERT INTO canvases (id, user_id, folder_id, name, thumbnail, elements, created_at, updated_at, deleted_at)
                VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, NULL)""",
            (canvas_id, user_id, folder_id, name, thumbnail, elements_json, now, now),
        )
        conn.commit()
        return {
            "id": canvas_id,
            "user_id": user_id,
            "folder_id": folder_id,
            "name": name,
            "thumbnail": thumbnail,
            "elements": elements,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
    finally:
        conn.close()


def get_user_canvases_metadata(user_id: str, folder_id: str | None = None) -> list[dict]:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        if folder_id is not None:
            cursor.execute(
                f"""SELECT id, user_id, folder_id, name, thumbnail, created_at, updated_at
                    FROM canvases
                    WHERE user_id = {p} AND folder_id = {p} AND deleted_at IS NULL
                    ORDER BY updated_at DESC""",
                (user_id, folder_id),
            )
        else:
            cursor.execute(
                f"""SELECT id, user_id, folder_id, name, thumbnail, created_at, updated_at
                    FROM canvases
                    WHERE user_id = {p} AND deleted_at IS NULL
                    ORDER BY updated_at DESC""",
                (user_id,),
            )
        rows = cursor.fetchall()
        canvases = []
        for row in rows:
            c_id, u_id, f_id, name, thumbnail, created_at, updated_at = row
            canvases.append(
                {
                    "id": c_id,
                    "user_id": u_id,
                    "folder_id": f_id,
                    "name": name,
                    "thumbnail": thumbnail,
                    "created_at": _format_datetime(created_at),
                    "updated_at": _format_datetime(updated_at),
                }
            )
        return canvases
    finally:
        conn.close()


def get_canvas_detail(user_id: str, canvas_id: str) -> dict | None:
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""SELECT id, user_id, folder_id, name, thumbnail, elements, created_at, updated_at, deleted_at
                FROM canvases
                WHERE user_id = {p} AND id = {p} AND deleted_at IS NULL""",
            (user_id, canvas_id),
        )
        row = cursor.fetchone()
        if not row:
            return None
        c_id, u_id, f_id, name, thumbnail, elements_str, created_at, updated_at, deleted_at = row
        elements = None
        if elements_str:
            try:
                elements = json.loads(elements_str) if isinstance(elements_str, str) else elements_str
            except Exception:
                elements = elements_str
        return {
            "id": c_id,
            "user_id": u_id,
            "folder_id": f_id,
            "name": name,
            "thumbnail": thumbnail,
            "elements": elements,
            "created_at": _format_datetime(created_at),
            "updated_at": _format_datetime(updated_at),
            "deleted_at": _format_datetime(deleted_at),
        }
    finally:
        conn.close()


def update_canvas(
    user_id: str,
    canvas_id: str,
    name: str | None = None,
    folder_id: str | None = None,
    thumbnail: str | None = None,
    elements: Any = None,
    update_folder: bool = False,
) -> dict | None:
    existing = get_canvas_detail(user_id, canvas_id)
    if not existing:
        return None

    if update_folder and folder_id is not None:
        folder = get_folder(user_id, folder_id)
        if not folder:
            raise ValueError(f"Folder '{folder_id}' not found or not owned by user.")

    now = datetime.now(UTC).isoformat()
    conn, p = get_connection()
    fields = [f"updated_at = {p}"]
    params = [now]

    if name is not None:
        fields.append(f"name = {p}")
        params.append(name)
    if update_folder:
        fields.append(f"folder_id = {p}")
        params.append(folder_id)
    if thumbnail is not None:
        fields.append(f"thumbnail = {p}")
        params.append(thumbnail)
    if elements is not None:
        elements_json = json.dumps(elements) if not isinstance(elements, str) else elements
        fields.append(f"elements = {p}")
        params.append(elements_json)

    try:
        cursor = conn.cursor()
        set_clause = ", ".join(fields)
        params.extend([user_id, canvas_id])
        cursor.execute(
            f"""UPDATE canvases
                SET {set_clause}
                WHERE user_id = {p} AND id = {p} AND deleted_at IS NULL""",
            tuple(params),
        )
        conn.commit()
        return get_canvas_detail(user_id, canvas_id)
    finally:
        conn.close()


def delete_canvas(user_id: str, canvas_id: str) -> bool:
    now = datetime.now(UTC).isoformat()
    conn, p = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""UPDATE canvases
                SET deleted_at = {p}, updated_at = {p}
                WHERE user_id = {p} AND id = {p} AND deleted_at IS NULL""",
            (now, now, user_id, canvas_id),
        )
        if cursor.rowcount == 0:
            return False
        conn.commit()
        return True
    finally:
        conn.close()
