# API Reference — Taskpad

**Base URL:** `https://taskpad.duckdns.org`  
**Format:** All request/response bodies are JSON.  
**Auth:** All `/api/tasks` and `/api/import/csv` endpoints require `?user_id=` as a query parameter.

---

## Health

### GET /api/health
Returns server status.

**Response**
```json
{ "status": "ok" }
```

---

## Authentication

### GET /api/auth/login
Initiates Google OAuth flow. Redirects the browser to Google's consent screen.

**Response:** `302 Redirect` → Google OAuth URL

---

### GET /api/auth/callback
OAuth callback endpoint. Called by Google after user grants consent. Exchanges the authorization code for tokens, upserts the user record, and redirects to the frontend with identity in query params.

**Query params:** `code` (required), `state` (optional)

**Response:** `302 Redirect` → `{FRONTEND_URL}?user_id=...&email=...&name=...`

**Error:** `400` if the OAuth token exchange fails.

---

### GET /api/auth/logout
Clears server-side session (stateless in current implementation).

**Response**
```json
{ "status": "logged out" }
```

---

## Tasks

All task endpoints require `?user_id={user_id}` in the query string.

---

### GET /api/tasks
Returns all tasks for the authenticated user, grouped by status. Auto-expires stale tasks as a side effect before responding.

**Query params:** `user_id` (required)

**Response**
```json
{
  "active":  [ Task, ... ],
  "done":    [ Task, ... ],
  "backlog":  [ Task, ... ],
  "expired": [ Task, ... ]
}
```

Each array is sorted by `order` ascending.

**Task object:**
```json
{
  "id":            "uuid-string",
  "title":         "Buy groceries",
  "category":      "gray",
  "due_date":      "2026-06-15",
  "status":        "active",
  "order":         0,
  "last_modified": "2026-06-08T10:00:00Z",
  "never_stale":   false,
  "days_stale":    2
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | UUID |
| `title` | string | |
| `category` | string | `gray` \| `green` \| `yellow` \| `red` |
| `due_date` | string | ISO date string or `""` |
| `status` | string | `active` \| `done` \| `backlog` \| `expired` |
| `order` | integer | Position within its status group |
| `last_modified` | string | ISO 8601 UTC timestamp or `""` |
| `never_stale` | boolean | If true, task never auto-expires |
| `days_stale` | integer | Computed: days since `last_modified` |

**Errors:** `401` if user_id not found.

---

### POST /api/tasks
Creates a new task in `active` status.

**Query params:** `user_id` (required)

**Request body:**
```json
{
  "title":    "Buy groceries",
  "category": "gray",
  "due_date": ""
}
```

| Field | Required | Default |
|-------|----------|---------|
| `title` | Yes | — |
| `category` | No | `"gray"` |
| `due_date` | No | `""` |

**Response:** Task object (201 implied, returns 200)

**Errors:** `401` if user_id not found.

---

### PATCH /api/tasks/{task_id}
Updates one or more fields on an existing task. Only fields included in the body are updated. `last_modified` is always updated on any change.

**Query params:** `user_id` (required)

**Path params:** `task_id` (UUID)

**Request body (all fields optional):**
```json
{
  "title":      "Updated title",
  "category":   "red",
  "due_date":   "2026-06-30",
  "status":     "done",
  "never_stale": true
}
```

**Response:** Updated Task object

**Errors:** `401` user not found; `404` task not found or not owned by user.

---

### POST /api/tasks/{task_id}/reset-stale
Resets the stale counter by touching `last_modified` without changing any task content.

**Query params:** `user_id` (required)

**Path params:** `task_id` (UUID)

**Response:** Updated Task object

**Errors:** `401`, `404`

---

### POST /api/tasks/reorder
Persists a new ordering for all tasks within a given status bucket.

**Query params:** `user_id` (required)

**Request body:**
```json
{
  "status":      "active",
  "ordered_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response:**
```json
{ "status": "ok" }
```

**Errors:** `401`

---

### DELETE /api/tasks/{task_id}
Permanently deletes a task.

**Query params:** `user_id` (required)

**Path params:** `task_id` (UUID)

**Response:**
```json
{ "status": "deleted" }
```

**Errors:** `401`, `404`

---

## Import

### POST /api/import/csv
Bulk-imports tasks from an uploaded CSV file. Existing tasks are not affected — all rows are inserted as new tasks.

**Query params:** `user_id` (required)

**Request:** `multipart/form-data` with field `file` (`.csv` file)

**CSV format:**

Required column: `title`

Optional columns:

| Column | Default | Notes |
|--------|---------|-------|
| `category` | `gray` | `gray` \| `green` \| `yellow` \| `red` |
| `status` | `active` | `active` \| `done` \| `backlog` \| `expired` |
| `due_date` | `""` | Any string |
| `order` | `0` | Integer |
| `last_modified` | current time | ISO 8601 UTC |
| `never_stale` | `false` | `true`/`1`/`yes` → true |

- Headers are case-insensitive
- Excel/Google Sheets exports (UTF-8 BOM) are handled automatically
- Unknown columns are silently ignored with a warning

**Response:**
```json
{
  "imported": 12,
  "skipped":  1,
  "warnings": ["Row 3 ('Buy milk'): unknown category 'purple' — defaulted to 'gray'."],
  "errors":   ["Row 7: missing title — skipped."]
}
```

**Errors:** `400` (invalid file format, missing required column, empty file); `401` user not found.
