import uuid
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth import create_token, get_current_user, hash_password, verify_password
from db import get_db, init_db

app = FastAPI(title="Prompter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=6, max_length=200)


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    created_at: str


class TokenOut(BaseModel):
    token: str
    user: UserOut


@app.post("/api/auth/register", response_model=TokenOut, status_code=201)
def register(data: RegisterIn):
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="El usuario no puede estar vacío")

    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Ese nombre de usuario ya existe")

        # Si es la primera cuenta que se crea y hay guiones huérfanos (de
        # antes de que la app tuviera usuarios), se los asignamos a ella.
        is_first_user = db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0

        user_id = uuid.uuid4().hex
        created_at = now_iso()
        db.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (user_id, username, hash_password(data.password), created_at),
        )

        if is_first_user:
            db.execute(
                "UPDATE scripts SET user_id = ? WHERE user_id IS NULL", (user_id,)
            )

        db.commit()

    token = create_token(user_id)
    return {
        "token": token,
        "user": {"id": user_id, "username": username, "created_at": created_at},
    }


@app.post("/api/auth/login", response_model=TokenOut)
def login(data: LoginIn):
    with get_db() as db:
        row = db.execute(
            "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
            (data.username.strip(),),
        ).fetchone()

    if row is None or not verify_password(data.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    token = create_token(row["id"])
    return {
        "token": token,
        "user": {
            "id": row["id"],
            "username": row["username"],
            "created_at": row["created_at"],
        },
    }


@app.get("/api/auth/me", response_model=UserOut)
def me(user=Depends(get_current_user)):
    return user


# ---------------------------------------------------------------------------
# Guiones (siempre acotados al usuario autenticado)
# ---------------------------------------------------------------------------


class ScriptIn(BaseModel):
    title: str
    text: str


class Script(ScriptIn):
    id: str


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/scripts", response_model=list[Script])
def list_scripts(user=Depends(get_current_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT id, title, text FROM scripts WHERE user_id = ? ORDER BY updated_at",
            (user["id"],),
        ).fetchall()
        return [dict(row) for row in rows]


@app.post("/api/scripts", response_model=Script, status_code=201)
def create_script(script: ScriptIn, user=Depends(get_current_user)):
    new_id = uuid.uuid4().hex
    with get_db() as db:
        db.execute(
            "INSERT INTO scripts (id, user_id, title, text, updated_at) VALUES (?, ?, ?, ?, ?)",
            (new_id, user["id"], script.title, script.text, now_iso()),
        )
        db.commit()
    return {"id": new_id, "title": script.title, "text": script.text}


@app.put("/api/scripts/{script_id}", response_model=Script)
def update_script(script_id: str, script: ScriptIn, user=Depends(get_current_user)):
    with get_db() as db:
        cur = db.execute(
            "UPDATE scripts SET title = ?, text = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (script.title, script.text, now_iso(), script_id, user["id"]),
        )
        db.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Guion no encontrado")
    return {"id": script_id, "title": script.title, "text": script.text}


@app.delete("/api/scripts/{script_id}", status_code=204)
def delete_script(script_id: str, user=Depends(get_current_user)):
    with get_db() as db:
        cur = db.execute(
            "DELETE FROM scripts WHERE id = ? AND user_id = ?",
            (script_id, user["id"]),
        )
        db.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Guion no encontrado")
