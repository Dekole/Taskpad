import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routers import auth, tasks
from app.routers import import_csv

load_dotenv()

app = FastAPI(title="Task App API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(import_csv.router, prefix="/api/import/csv", tags=["import"])


@app.on_event("startup")
def startup():
    from app.db.database import init_db
    for attempt in range(10):
        try:
            init_db()
            return
        except Exception as e:
            if attempt == 9:
                raise RuntimeError(f"Could not connect to database after 10 attempts: {e}")
            time.sleep(2)


@app.get("/api/health")
def health():
    return {"status": "ok"}
