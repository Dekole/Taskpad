import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.db.models import Pad

DATETIME_FMT = "%Y-%m-%dT%H:%M:%SZ"
MAX_DEPTH = 5


def _now_str() -> str:
    return datetime.now(timezone.utc).strftime(DATETIME_FMT)


def _serialize(pad: Pad) -> dict:
    return {
        "id": pad.id,
        "user_id": pad.user_id,
        "parent_id": pad.parent_id,
        "type": pad.type,
        "name": pad.name,
        "depth": pad.depth,
        "content": pad.content or "",
        "summary": pad.summary,
        "summary_updated_at": pad.summary_updated_at,
        "metadata_json": pad.metadata_json or {},
        "last_modified": pad.last_modified or "",
    }


def create_pad(db: Session, user_id: str, parent_id: str | None, type: str, name: str,
                content: str = "", metadata_json: dict | None = None) -> dict | None:
    depth = 1
    if parent_id is not None:
        parent = db.query(Pad).filter(Pad.id == parent_id, Pad.user_id == user_id).first()
        if not parent:
            return None
        depth = parent.depth + 1
        if depth > MAX_DEPTH:
            raise ValueError(f"Depth {depth} exceeds max of {MAX_DEPTH}")

    pad = Pad(
        id=str(uuid.uuid4()),
        user_id=user_id,
        parent_id=parent_id,
        type=type,
        name=name,
        depth=depth,
        content=content,
        metadata_json=metadata_json or {},
        last_modified=_now_str(),
    )
    db.add(pad)
    db.commit()
    db.refresh(pad)
    return _serialize(pad)


def list_pad(db: Session, user_id: str, type: str | None = None, parent_id: str | None = None,
             root_only: bool = False) -> list[dict]:
    query = db.query(Pad).filter(Pad.user_id == user_id)
    if root_only:
        query = query.filter(Pad.parent_id.is_(None))
    elif parent_id is not None:
        query = query.filter(Pad.parent_id == parent_id)
    if type is not None:
        query = query.filter(Pad.type == type)
    return [_serialize(p) for p in query.all()]


def get_pad_with_children(db: Session, user_id: str, pad_id: str) -> dict | None:
    pad = db.query(Pad).filter(Pad.id == pad_id, Pad.user_id == user_id).first()
    if not pad:
        return None
    children = db.query(Pad).filter(Pad.parent_id == pad_id, Pad.user_id == user_id).all()
    result = _serialize(pad)
    result["children"] = [_serialize(c) for c in children]
    return result


def get_pad_tree(db: Session, user_id: str, root_id: str) -> dict | None:
    root = db.query(Pad).filter(Pad.id == root_id, Pad.user_id == user_id).first()
    if not root:
        return None

    def build(node: Pad) -> dict:
        d = _serialize(node)
        kids = db.query(Pad).filter(Pad.parent_id == node.id, Pad.user_id == user_id).all()
        d["children"] = [build(k) for k in kids]
        return d

    return build(root)


def search_pad(db: Session, user_id: str, q: str, parent_id: str | None = None) -> list[dict]:
    query = db.query(Pad).filter(Pad.user_id == user_id)
    if parent_id is not None:
        query = query.filter(Pad.parent_id == parent_id)
    like = f"%{q}%"
    query = query.filter(
        (Pad.name.ilike(like)) | (Pad.content.ilike(like)) | (Pad.summary.ilike(like))
    )
    return [_serialize(p) for p in query.all()]


def update_pad(db: Session, user_id: str, pad_id: str, updates: dict) -> dict | None:
    pad = db.query(Pad).filter(Pad.id == pad_id, Pad.user_id == user_id).first()
    if not pad:
        return None
    if "name" in updates:
        pad.name = updates["name"]
    if "content" in updates:
        pad.content = updates["content"]
    if "metadata_json" in updates:
        pad.metadata_json = updates["metadata_json"]
    pad.last_modified = _now_str()
    db.commit()
    db.refresh(pad)
    return _serialize(pad)


def update_pad_summary(db: Session, user_id: str, pad_id: str, summary: str) -> dict | None:
    pad = db.query(Pad).filter(Pad.id == pad_id, Pad.user_id == user_id).first()
    if not pad:
        return None
    pad.summary = summary
    pad.summary_updated_at = _now_str()
    db.commit()
    db.refresh(pad)
    return _serialize(pad)


def move_pad(db: Session, user_id: str, pad_id: str, new_parent_id: str | None) -> dict | None:
    # Note: does not cascade depth updates to descendants. Not exercised this round
    # (no client calls /move yet) - revisit if move_pad becomes a real MCP tool.
    pad = db.query(Pad).filter(Pad.id == pad_id, Pad.user_id == user_id).first()
    if not pad:
        return None
    depth = 1
    if new_parent_id is not None:
        parent = db.query(Pad).filter(Pad.id == new_parent_id, Pad.user_id == user_id).first()
        if not parent:
            return None
        depth = parent.depth + 1
        if depth > MAX_DEPTH:
            raise ValueError(f"Depth {depth} exceeds max of {MAX_DEPTH}")
    pad.parent_id = new_parent_id
    pad.depth = depth
    pad.last_modified = _now_str()
    db.commit()
    db.refresh(pad)
    return _serialize(pad)
