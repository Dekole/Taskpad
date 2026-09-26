from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
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


class Pad(Base):
    __tablename__ = "pad"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    parent_id = Column(String, ForeignKey("pad.id"), nullable=True, index=True)
    type = Column(String, nullable=False)  # "folder" | "note" | "person" | "journal"
    name = Column(String, nullable=False)
    depth = Column(Integer, nullable=False)  # 1-5, server-computed, reject if > 5
    content = Column(Text, default="")
    summary = Column(Text, nullable=True)
    summary_updated_at = Column(String, nullable=True)
    metadata_json = Column(JSONB, default=dict)
    last_modified = Column(String, default="")
