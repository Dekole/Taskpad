import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.db.models import Task

DATETIME_FMT = "%Y-%m-%dT%H:%M:%SZ"
VALID_STATUSES = {"active", "done", "backlog", "expired"}
VALID_CATEGORIES = {"gray", "green", "yellow", "red"}


def _now_str() -> str:
    return datetime.now(timezone.utc).strftime(DATETIME_FMT)


def _days_stale(last_modified: str) -> int:
    if not last_modified:
        return 0
    try:
        dt = datetime.strptime(last_modified, DATETIME_FMT).replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).days
    except ValueError:
        return 0


def _serialize(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "category": task.category,
        "due_date": task.due_date or "",
        "status": task.status,
        "order": task.task_order,
        "last_modified": task.last_modified or "",
        "never_stale": task.never_stale,
        "days_stale": _days_stale(task.last_modified),
    }


def get_all_tasks(db: Session, user_id: str) -> dict:
    tasks = db.query(Task).filter(Task.user_id == user_id).all()

    # Auto-expire tasks stale for 8+ days
    dirty = False
    for t in tasks:
        if _days_stale(t.last_modified) >= 8 and t.status in ("active", "backlog") and not t.never_stale:
            t.status = "expired"
            dirty = True
    if dirty:
        db.commit()

    serialized = [_serialize(t) for t in tasks]
    return {
        "active": sorted([t for t in serialized if t["status"] == "active"], key=lambda x: x["order"]),
        "done": sorted([t for t in serialized if t["status"] == "done"], key=lambda x: x["order"]),
        "backlog": sorted([t for t in serialized if t["status"] == "backlog"], key=lambda x: x["order"]),
        "expired": sorted([t for t in serialized if t["status"] == "expired"], key=lambda x: x["order"]),
    }


def create_task(db: Session, user_id: str, title: str, category: str = "gray", due_date: str = "") -> dict:
    active_tasks = db.query(Task).filter(Task.user_id == user_id, Task.status == "active").all()
    new_order = max((t.task_order for t in active_tasks), default=-1) + 1

    task = Task(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        category=category if category in VALID_CATEGORIES else "gray",
        due_date=due_date,
        status="active",
        task_order=new_order,
        last_modified=_now_str(),
        never_stale=False,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _serialize(task)


def update_task(db: Session, user_id: str, task_id: str, updates: dict) -> dict | None:
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()
    if not task:
        return None

    if "title" in updates:
        task.title = updates["title"]
    if "category" in updates and updates["category"] in VALID_CATEGORIES:
        task.category = updates["category"]
    if "due_date" in updates:
        task.due_date = updates["due_date"]
    if "status" in updates and updates["status"] in VALID_STATUSES:
        task.status = updates["status"]
    if "never_stale" in updates:
        task.never_stale = updates["never_stale"]
    task.last_modified = _now_str()

    db.commit()
    db.refresh(task)
    return _serialize(task)


def reset_stale(db: Session, user_id: str, task_id: str) -> dict | None:
    return update_task(db, user_id, task_id, {})


def reorder_tasks(db: Session, user_id: str, status: str, ordered_ids: list[str]) -> None:
    tasks = db.query(Task).filter(Task.user_id == user_id, Task.status == status).all()
    id_to_order = {task_id: idx for idx, task_id in enumerate(ordered_ids)}
    for task in tasks:
        if task.id in id_to_order:
            task.task_order = id_to_order[task.id]
    db.commit()


def delete_task(db: Session, user_id: str, task_id: str) -> bool:
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()
    if not task:
        return False
    db.delete(task)
    db.commit()
    return True
