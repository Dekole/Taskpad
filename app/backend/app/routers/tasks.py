from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import User
from app.services import task_service

router = APIRouter()


def _get_user(user_id: str, db: Session):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")
    return user


class CreateTaskRequest(BaseModel):
    title: str
    category: str = "gray"
    due_date: str = ""


class UpdateTaskRequest(BaseModel):
    title: str | None = None
    category: str | None = None
    due_date: str | None = None
    status: str | None = None
    never_stale: bool | None = None


class ReorderRequest(BaseModel):
    status: str
    ordered_ids: list[str]


@router.get("")
def get_tasks(user_id: str, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    return task_service.get_all_tasks(db, user_id)


@router.post("")
def create_task(user_id: str, body: CreateTaskRequest, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    return task_service.create_task(db, user_id, body.title, body.category, body.due_date)


@router.patch("/{task_id}")
def update_task(task_id: str, user_id: str, body: UpdateTaskRequest, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    updates = body.model_dump(exclude_none=True)
    task = task_service.update_task(db, user_id, task_id, updates)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/reset-stale")
def reset_stale(task_id: str, user_id: str, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    task = task_service.reset_stale(db, user_id, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/reorder")
def reorder(user_id: str, body: ReorderRequest, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    task_service.reorder_tasks(db, user_id, body.status, body.ordered_ids)
    return {"status": "ok"}


@router.delete("/{task_id}")
def delete_task(task_id: str, user_id: str, db: Session = Depends(get_db)):
    _get_user(user_id, db)
    deleted = task_service.delete_task(db, user_id, task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "deleted"}
