import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = Path(__file__).parent / "scripts.db"


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scripts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ScriptIn(BaseModel):
    title: str
    text: str


class Script(ScriptIn):
    id: str


app = FastAPI(title="Prompter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/scripts", response_model=list[Script])
def list_scripts():
    with get_db() as db:
        rows = db.execute(
            "SELECT id, title, text FROM scripts ORDER BY updated_at"
        ).fetchall()
        return [dict(row) for row in rows]


@app.post("/api/scripts", response_model=Script, status_code=201)
def create_script(script: ScriptIn):
    new_id = uuid.uuid4().hex
    with get_db() as db:
        db.execute(
            "INSERT INTO scripts (id, title, text, updated_at) VALUES (?, ?, ?, ?)",
            (new_id, script.title, script.text, now_iso()),
        )
        db.commit()
    return {"id": new_id, "title": script.title, "text": script.text}


@app.put("/api/scripts/{script_id}", response_model=Script)
def update_script(script_id: str, script: ScriptIn):
    with get_db() as db:
        cur = db.execute(
            "UPDATE scripts SET title = ?, text = ?, updated_at = ? WHERE id = ?",
            (script.title, script.text, now_iso(), script_id),
        )
        db.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Guion no encontrado")
    return {"id": script_id, "title": script.title, "text": script.text}


@app.delete("/api/scripts/{script_id}", status_code=204)
def delete_script(script_id: str):
    with get_db() as db:
        cur = db.execute("DELETE FROM scripts WHERE id = ?", (script_id,))
        db.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Guion no encontrado")
