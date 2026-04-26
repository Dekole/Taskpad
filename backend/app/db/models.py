from sqlalchemy import Column, String, Boolean, Integer, ForeignKey
from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)  # Google OAuth sub
    email = Column(String)
    name = Column(String)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    category = Column(String, default="gray")
    due_date = Column(String, default="")
    status = Column(String, default="active")
    task_order = Column(Integer, default=0)
    last_modified = Column(String, default="")
    never_stale = Column(Boolean, default=False)
