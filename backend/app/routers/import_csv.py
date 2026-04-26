import csv
import io
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import User, Task

router = APIRouter()

REQUIRED_COLUMNS = {"title"}
VALID_STATUSES = {"active", "done", "backlog", "expired"}
VALID_CATEGORIES = {"gray", "green", "yellow", "red"}
DATETIME_FMT = "%Y-%m-%dT%H:%M:%SZ"
ALL_KNOWN_COLUMNS = {"id", "title", "category", "due_date", "status", "order", "last_modified", "never_stale"}


def _now_str():
    return datetime.now(timezone.utc).strftime(DATETIME_FMT)


@router.post("")
async def import_csv(user_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv file.")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM from Excel/Sheets exports
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded.")

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file appears to be empty.")

    # Normalize headers to lowercase
    headers = [h.strip().lower() for h in reader.fieldnames]

    missing_required = REQUIRED_COLUMNS - set(headers)
    if missing_required:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Missing required column: {', '.join(sorted(missing_required))}. "
                f"Expected columns: {', '.join(sorted(ALL_KNOWN_COLUMNS))}."
            ),
        )

    unknown_cols = set(headers) - ALL_KNOWN_COLUMNS

    errors = []
    warnings = []
    tasks_to_insert = []

    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file has no data rows.")

    for i, raw_row in enumerate(rows, start=2):  # row 1 is header
        row = {k.strip().lower(): (v.strip() if v else "") for k, v in raw_row.items() if k}

        title = row.get("title", "").strip()
        if not title:
            errors.append(f"Row {i}: missing title — skipped.")
            continue

        category = row.get("category", "gray").lower()
        if category not in VALID_CATEGORIES:
            warnings.append(f"Row {i} ({title!r}): unknown category '{category}' — defaulted to 'gray'.")
            category = "gray"

        status = row.get("status", "active").lower()
        if status not in VALID_STATUSES:
            warnings.append(f"Row {i} ({title!r}): unknown status '{status}' — defaulted to 'active'.")
            status = "active"

        try:
            task_order = int(row.get("order", 0))
        except ValueError:
            task_order = 0

        last_modified = row.get("last_modified", "") or _now_str()
        due_date = row.get("due_date", "")
        never_stale = row.get("never_stale", "").lower() in ("true", "1", "yes")

        tasks_to_insert.append(Task(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title=title,
            category=category,
            due_date=due_date,
            status=status,
            task_order=task_order,
            last_modified=last_modified,
            never_stale=never_stale,
        ))

    if tasks_to_insert:
        db.add_all(tasks_to_insert)
        db.commit()

    if unknown_cols:
        warnings.insert(0, f"Unknown column(s) ignored: {', '.join(sorted(unknown_cols))}.")

    return {
        "imported": len(tasks_to_insert),
        "skipped": len(errors),
        "warnings": warnings,
        "errors": errors,
    }
