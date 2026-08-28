import sqlite3
import os

class DatabaseManager:
    def __init__(self, db_path="cognito.db"):
        self.db_path = db_path
        self._init_db()
        
    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        conn = self._get_connection()
        try:
            with conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS documents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT NOT NULL DEFAULT '',
                        filepath TEXT,
                        filename TEXT,
                        filetype TEXT,
                        filesize INTEGER,
                        content_text TEXT,
                        cluster_id INTEGER DEFAULT NULL,
                        cluster_name TEXT DEFAULT NULL,
                        x_coord REAL DEFAULT NULL,
                        y_coord REAL DEFAULT NULL,
                        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(filepath, user_id)
                    )
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS metadata (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    )
                """)
                # Migration: add user_id column if table exists without it
                self._migrate_add_user_id(conn)
        finally:
            conn.close()

    def _migrate_add_user_id(self, conn):
        """Add user_id column and ensure proper composite UNIQUE(filepath, user_id) constraint."""
        cursor = conn.execute("PRAGMA table_info(documents)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'user_id' not in columns:
            try:
                conn.execute("ALTER TABLE documents ADD COLUMN user_id TEXT NOT NULL DEFAULT ''")
                print("[DB Migration] Added 'user_id' column to documents table.")
            except sqlite3.OperationalError:
                pass  # Column already exists

        # If table was created with old 'filepath TEXT UNIQUE', rebuild with composite UNIQUE(filepath, user_id)
        schema_row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'").fetchone()
        if schema_row and 'filepath TEXT UNIQUE' in schema_row[0]:
            try:
                conn.execute("""
                    CREATE TABLE documents_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT NOT NULL DEFAULT '',
                        filepath TEXT,
                        filename TEXT,
                        filetype TEXT,
                        filesize INTEGER,
                        content_text TEXT,
                        cluster_id INTEGER DEFAULT NULL,
                        cluster_name TEXT DEFAULT NULL,
                        x_coord REAL DEFAULT NULL,
                        y_coord REAL DEFAULT NULL,
                        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(filepath, user_id)
                    )
                """)
                conn.execute("""
                    INSERT OR IGNORE INTO documents_new (id, user_id, filepath, filename, filetype, filesize, content_text, cluster_id, cluster_name, x_coord, y_coord, indexed_at)
                    SELECT id, COALESCE(user_id, ''), filepath, filename, filetype, filesize, content_text, cluster_id, cluster_name, x_coord, y_coord, indexed_at FROM documents
                """)
                conn.execute("DROP TABLE documents")
                conn.execute("ALTER TABLE documents_new RENAME TO documents")
                print("[DB Migration] Rebuilt documents table with composite UNIQUE(filepath, user_id).")
            except Exception as mig_err:
                print(f"[DB Migration] Table rebuild note: {mig_err}")

        try:
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_user_filepath ON documents(filepath, user_id)")
        except Exception:
            pass

    def clear_all(self, user_id=None):
        conn = self._get_connection()
        try:
            with conn:
                if user_id:
                    conn.execute("DELETE FROM documents WHERE user_id = ?", (user_id,))
                    # Clear user-scoped metadata
                    conn.execute("DELETE FROM metadata WHERE key LIKE ?", (f"{user_id}::%",))
                else:
                    conn.execute("DELETE FROM documents")
                    conn.execute("DELETE FROM metadata")
        finally:
            conn.close()

    def upsert_document(self, user_id, filepath, filename, filetype, filesize, content_text):
        conn = self._get_connection()
        try:
            with conn:
                conn.execute("""
                    INSERT INTO documents (user_id, filepath, filename, filetype, filesize, content_text)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(filepath, user_id) DO UPDATE SET
                        filename=excluded.filename,
                        filetype=excluded.filetype,
                        filesize=excluded.filesize,
                        content_text=excluded.content_text,
                        cluster_id=NULL,
                        cluster_name=NULL,
                        x_coord=NULL,
                        y_coord=NULL
                """, (user_id, filepath, filename, filetype, filesize, content_text))
        except sqlite3.Error as e:
            print(f"Database error on upsert: {e}")
        finally:
            conn.close()

    def update_document_coords_and_cluster(self, doc_id, cluster_id, cluster_name, x, y):
        conn = self._get_connection()
        try:
            with conn:
                conn.execute("""
                    UPDATE documents 
                    SET cluster_id = ?, cluster_name = ?, x_coord = ?, y_coord = ?
                    WHERE id = ?
                """, (cluster_id, cluster_name, x, y, doc_id))
        finally:
            conn.close()

    def get_all_documents(self, user_id=None):
        conn = self._get_connection()
        try:
            if user_id:
                cursor = conn.execute("SELECT * FROM documents WHERE user_id = ? ORDER BY id ASC", (user_id,))
            else:
                cursor = conn.execute("SELECT * FROM documents ORDER BY id ASC")
            return [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()

    def get_document_by_id(self, doc_id, user_id=None):
        conn = self._get_connection()
        try:
            if user_id:
                cursor = conn.execute("SELECT * FROM documents WHERE id = ? AND user_id = ?", (doc_id, user_id))
            else:
                cursor = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def _scoped_key(self, user_id, key):
        """Create a user-scoped metadata key."""
        if user_id:
            return f"{user_id}::{key}"
        return key

    def set_metadata(self, key, value, user_id=None):
        scoped_key = self._scoped_key(user_id, key)
        conn = self._get_connection()
        try:
            with conn:
                conn.execute("""
                    INSERT INTO metadata (key, value)
                    VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value
                """, (scoped_key, str(value)))
        finally:
            conn.close()

    def get_metadata(self, key, default=None, user_id=None):
        scoped_key = self._scoped_key(user_id, key)
        conn = self._get_connection()
        try:
            cursor = conn.execute("SELECT value FROM metadata WHERE key = ?", (scoped_key,))
            row = cursor.fetchone()
            return row[0] if row else default
        finally:
            conn.close()
            
    def get_stats(self, user_id=None):
        conn = self._get_connection()
        try:
            if user_id:
                cursor_docs = conn.execute("SELECT COUNT(*), SUM(filesize) FROM documents WHERE user_id = ?", (user_id,))
            else:
                cursor_docs = conn.execute("SELECT COUNT(*), SUM(filesize) FROM documents")
            count, total_size = cursor_docs.fetchone()
            
            if user_id:
                cursor_types = conn.execute("SELECT filetype, COUNT(*) FROM documents WHERE user_id = ? GROUP BY filetype", (user_id,))
            else:
                cursor_types = conn.execute("SELECT filetype, COUNT(*) FROM documents GROUP BY filetype")
            types = {row[0]: row[1] for row in cursor_types.fetchall()}
            
            if user_id:
                cursor_clusters = conn.execute("SELECT COUNT(DISTINCT cluster_id) FROM documents WHERE user_id = ? AND cluster_id IS NOT NULL", (user_id,))
            else:
                cursor_clusters = conn.execute("SELECT COUNT(DISTINCT cluster_id) FROM documents WHERE cluster_id IS NOT NULL")
            num_clusters = cursor_clusters.fetchone()[0] or 0
            
            return {
                "total_documents": count or 0,
                "total_size_bytes": total_size or 0,
                "file_types": types,
                "num_clusters": num_clusters
            }
        finally:
            conn.close()
