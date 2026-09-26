import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import User
from app.services import pad_service


def require_service_token(x_service_token: str = Header(...)):
    expected = os.getenv("TASKPAD_SERVICE_TOKEN", "")
    if not expected or not secrets.compare_digest(x_service_token, expected):
        raise HTTPException(status_code=401, detail="Invalid service token")


router = APIRouter(dependencies=[Depends(require_service_token)])


def _get_user(user_id: str, db: Session):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")
    return user


class CreatePadRequest(BaseModel):
    parent_id: str | None = None
    type: str
    name: str
    content: str = ""
    metadata_json: dict = {}


class UpdatePadRequest(BaseModel):
    name: str | None = None
    content: str | None = None
    metadata_json: dict | None = None


class UpdateSummaryRequest(BaseModel):
    summary: str


class MoveRequest(BaseModel):
    parent_id: str | None = None


# Static-suffix routes (/tree, /search) must be registered before the dynamic
# /{pad_id} route below, or FastAPI will match "tree"/"search" as a pad_id.

@router.get("/tree")
def get_tree(user_id: str, root_id: str, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    tree = pad_service.get_pad_tree(db, user_id, root_id)
    if not tree:
        raise HTTPException(status_code=404, detail="Pad entry not found")
    return tree


@router.get("/search")
def search(user_id: str, q: str, parent_id: str | None = None, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    return pad_service.search_pad(db, user_id, q, parent_id)


@router.get("")
def list_pad(user_id: str, type: str | None = None, parent_id: str | None = None,
             root_only: bool = False, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    return pad_service.list_pad(db, user_id, type, parent_id, root_only)


@router.post("")
def create_pad(user_id: str, body: CreatePadRequest, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    try:
        pad = pad_service.create_pad(db, user_id, body.parent_id, body.type, body.name,
                                      body.content, body.metadata_json)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not pad:
        raise HTTPException(status_code=404, detail="Parent not found")
    return pad


@router.get("/{pad_id}")
def get_pad(pad_id: str, user_id: str, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    pad = pad_service.get_pad_with_children(db, user_id, pad_id)
    if not pad:
        raise HTTPException(status_code=404, detail="Pad entry not found")
    return pad


@router.patch("/{pad_id}")
def update_pad(pad_id: str, user_id: str, body: UpdatePadRequest, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    updates = body.model_dump(exclude_none=True)
    pad = pad_service.update_pad(db, user_id, pad_id, updates)
    if not pad:
        raise HTTPException(status_code=404, detail="Pad entry not found")
    return pad


@router.patch("/{pad_id}/summary")
def update_summary(pad_id: str, user_id: str, body: UpdateSummaryRequest, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    pad = pad_service.update_pad_summary(db, user_id, pad_id, body.summary)
    if not pad:
        raise HTTPException(status_code=404, detail="Pad entry not found")
    return pad


@router.post("/{pad_id}/move")
def move_pad(pad_id: str, user_id: str, body: MoveRequest, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    try:
        pad = pad_service.move_pad(db, user_id, pad_id, body.parent_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not pad:
        raise HTTPException(status_code=404, detail="Pad entry or new parent not found")
    return pad
