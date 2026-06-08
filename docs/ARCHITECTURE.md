# Architecture Document — Taskpad

**Version:** 1.0  
**Author:** Peter Chen  
**Last Updated:** June 2026

---

## 1. System Overview

Taskpad is a full-stack web application deployed as a set of Docker containers behind a Caddy reverse proxy. The system is composed of four services:

```
Browser
  │
  ▼
┌─────────────────────────────┐
│         Caddy (TLS)         │  :443 / :80
│   taskpad.duckdns.org       │
└───────┬────────────┬────────┘
        │ /api/*     │ /*
        ▼            ▼
  ┌──────────┐  ┌──────────┐
  │ FastAPI  │  │  React   │
  │ Backend  │  │ Frontend │
  │ :8080    │  │ :80      │
  └────┬─────┘  └──────────┘
       │
       ▼
  ┌──────────┐
  │ Postgres │
  │  :5432   │
  └──────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React + Vite | React 18 |
| UI Styling | Tailwind CSS | v3 |
| Drag & Drop | dnd-kit | latest |
| Icons | Lucide React | latest |
| Backend | FastAPI (Python) | FastAPI 0.x |
| ORM | SQLAlchemy | 2.x |
| Database | PostgreSQL | 16 (Alpine) |
| Auth | Google OAuth 2.0 | via `google-auth-oauthlib` |
| Reverse Proxy | Caddy | Alpine |
| Containerization | Docker Compose | v2 |
| DNS | DuckDNS | dynamic DNS |

---

## 3. Service Descriptions

### 3.1 Caddy (Reverse Proxy)
- Handles HTTPS termination with automatic TLS certificates (Let's Encrypt via ACME)
- Routes all `/api/*` requests to the FastAPI backend on port 8080
- Routes all other requests to the React frontend static file server on port 80
- Uses Google DNS (8.8.8.8 / 8.8.4.4) to ensure reliable ACME DNS-01 challenges

**Caddyfile:**
```
taskpad.duckdns.org {
    reverse_proxy /api/* backend:8080
    reverse_proxy * frontend:80
}
```

### 3.2 Frontend (React + Vite)
- Single-page application built with Vite, served as static files in the final Docker image
- `VITE_API_URL` is baked in at build time and points to `https://taskpad.duckdns.org`
- No server-side rendering — all routing and state management is client-side

**Key components:**
| Component | Role |
|-----------|------|
| `App.jsx` | Root component, handles auth state and user session |
| `LandingPage.jsx` | Shown to logged-out users; displays feature cards and sign-in button |
| `AddTaskBar.jsx` | Input bar for creating new tasks |
| `TaskSection.jsx` | Wraps a list of tasks in a given status bucket with dnd-kit context |
| `TaskRow.jsx` | Single task row — checkbox, title, due date, category, stale counter, move/delete menu |
| `CsvImportModal.jsx` | File upload modal for bulk CSV import |
| `UserAvatar.jsx` | Avatar with dropdown for logout and import |

**Auth flow (client-side):**
1. On load, check URL params for `user_id`, `email`, `name` (posted by backend after OAuth)
2. If present, store in `localStorage` and strip from URL
3. Otherwise, load from `localStorage` on subsequent visits
4. All API calls pass `?user_id=` as a query parameter

### 3.3 Backend (FastAPI)
- REST API serving JSON, running on port 8080 via uvicorn
- CORS is open (`allow_origins=["*"]`) — acceptable for a single-user personal project
- On startup, retries database connection up to 10 times (2-second intervals) to handle container ordering

**Router structure:**
```
main.py
├── /api/auth        → routers/auth.py
├── /api/tasks       → routers/tasks.py
└── /api/import/csv  → routers/import_csv.py
```

**Service layer:**
Business logic lives in `app/services/task_service.py`. Routers are thin — they validate inputs and delegate to the service.

**Stale expiry:**
Auto-expiry is triggered inside `task_service.get_all_tasks()`. Every time tasks are fetched, any `active` or `backlog` task with `days_stale >= 8` (and `never_stale == False`) is updated to `expired` in the same transaction before the response is returned. This is a read-triggered side effect rather than a background job.

### 3.4 Database (PostgreSQL 16)
- Persistent volume (`postgres_data`) ensures data survives container restarts
- Two tables: `users` and `tasks`

**Schema:**

```sql
CREATE TABLE users (
    id      VARCHAR PRIMARY KEY,  -- Google OAuth "sub" claim
    email   VARCHAR,
    name    VARCHAR
);

CREATE TABLE tasks (
    id            VARCHAR PRIMARY KEY,
    user_id       VARCHAR REFERENCES users(id) NOT NULL,
    title         VARCHAR NOT NULL,
    category      VARCHAR DEFAULT 'gray',
    due_date      VARCHAR DEFAULT '',
    status        VARCHAR DEFAULT 'active',
    task_order    INTEGER DEFAULT 0,
    last_modified VARCHAR DEFAULT '',
    never_stale   BOOLEAN DEFAULT FALSE
);
CREATE INDEX ON tasks (user_id);
```

---

## 4. Authentication Flow

```
1. User clicks "Sign in with Google"
   └─ Frontend → GET /api/auth/login

2. Backend generates OAuth URL and redirects to Google
   └─ Google consent screen

3. Google redirects to /api/auth/callback?code=...

4. Backend exchanges code for tokens, verifies ID token
   └─ Extracts: user_id (sub), email, name
   └─ Upserts User record in DB

5. Backend redirects to frontend:
   └─ https://taskpad.duckdns.org?user_id=...&email=...&name=...

6. Frontend reads params, stores in localStorage, strips from URL
```

**Security note:** The user identity (user_id) is passed as a URL parameter and stored in localStorage. This approach is simple and suitable for a personal single-user app. For a multi-user production system, a proper session cookie or JWT with expiry would be preferred.

---

## 5. Deployment

**Docker Compose services:**

| Service | Image | Port |
|---------|-------|------|
| `db` | postgres:16-alpine | 5432 (internal) |
| `backend` | Custom (./backend/Dockerfile) | 8080 (internal) |
| `frontend` | Custom (./frontend/Dockerfile) | 80 (internal) |
| `caddy` | caddy:alpine | 80, 443 (public) |

**Environment variables (`.env`):**
- `GOOGLE_CLIENT_SECRETS_FILE` — path to OAuth client secret JSON
- `GOOGLE_REDIRECT_URI` — must match the registered OAuth callback URL
- `FRONTEND_URL` — used by the backend to build the post-auth redirect
- `DATABASE_URL` — PostgreSQL connection string

**DNS:**
- Domain `taskpad.duckdns.org` is managed via DuckDNS (free dynamic DNS)
- The server's public IP is registered to this hostname

---

## 6. Data Flow: Task CRUD

```
User action (browser)
  │
  ▼
React component calls API helper (src/lib/api.js)
  │  fetch(`${API_BASE}/api/tasks?user_id=${userId}`, ...)
  ▼
Caddy routes /api/* → FastAPI backend
  │
  ▼
Router validates user exists in DB
  │
  ▼
task_service performs DB operation
  │
  ▼
Response JSON → React state update → UI re-render
```

---

## 7. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| User ID as query param (not session cookie) | Simpler implementation for a personal app; avoids server-side session management |
| Stale expiry on read | No need for a background job scheduler (cron/Celery); sufficient for the use case |
| Caddy over nginx | Automatic HTTPS with zero config; DuckDNS subdomain works out of the box |
| PostgreSQL over SQLite | Supports concurrent connections, durable volumes, future scalability |
| Single Docker Compose file | Simple deployment with one `docker compose up -d`; no Kubernetes overhead for a personal project |
| No Redux / external state | React useState + a custom `useTasks` hook is sufficient; avoids over-engineering |
