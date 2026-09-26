# Product Requirements Document — Taskpad

**Version:** 1.0  
**Author:** Peter Chen  
**Last Updated:** June 2026  
**Live URL:** https://taskpad.duckdns.org

---

## 1. Problem Statement

Most task management tools accumulate clutter indefinitely. Tasks added months ago sit in an active list alongside genuinely urgent work, eroding trust in the list and the habit of using it. Users either spend effort on manual triage, or stop using the tool entirely.

There is also a subtle but important distinction that most tools collapse: a task you *completed* is categorically different from a task you *abandoned*. Blending them into a single "done" bucket gives users a falsely positive view of their productivity.

---

## 2. Product Vision

**Taskpad is a lightweight, self-cleaning task manager that keeps your active list honest.**

Tasks that go untouched long enough move to Expired automatically. Completed tasks and abandoned tasks are tracked separately. The result is an active list that reflects what actually matters today — with no manual cleanup required.

---

## 3. Target Users

| User | Context |
|------|---------|
| Individual contributors | Professionals who maintain personal task lists and want a focused, low-noise workspace |
| Freelancers / solo builders | People who manage varied workstreams and value an honest view of what they're actually following through on |
| Portfolio / demo audience | Technically-minded reviewers evaluating the project's design and engineering quality |

---

## 4. Goals & Non-Goals

**Goals**
- Maintain a focused active task list without manual cleanup
- Distinguish completed tasks from abandoned/stale tasks
- Be accessible from any device with a browser — no install required
- Support bulk task import for users migrating from spreadsheets or other tools

**Non-Goals**
- Team collaboration or shared task lists
- Push notifications or reminders
- Mobile native app
- Complex project hierarchies (sub-tasks, epics, etc.)
- Recurring tasks

---

## 5. Features

### 5.1 Authentication
Users sign in with their Google account via OAuth 2.0. No passwords to manage. Session is persisted in `localStorage` so users stay logged in across tabs and refreshes.

### 5.2 Task Lifecycle

Tasks exist in one of four statuses:

| Status | Meaning |
|--------|---------|
| **Active** | Task is in progress or needs attention |
| **Done** | Task was intentionally completed |
| **Backlog** | Task is parked for later consideration |
| **Expired** | Task was not acted on and auto-expired |

Tasks move between statuses manually via a dropdown on each task row, or automatically (see Auto-Expiry below).

### 5.3 Auto-Expiry
Any `active` or `backlog` task that has not been modified in **8 or more days** is automatically moved to `Expired` on the next page load. This behavior can be suppressed per-task with the "Never Stale" flag.

### 5.4 Stale Tracking
Each task displays how many days have passed since it was last modified:
- **0–2 days:** neutral (gray)
- **3–4 days:** caution (yellow)
- **5–7 days:** warning (red)
- **Never Stale:** suppressed, displays `—`

Users can reset the stale counter (touching the task without changing content) or mark a task as Never Stale from the stale badge menu.

### 5.5 Categories
Each task has a color category for personal organization:

| Color | Use |
|-------|-----|
| Gray | Default / uncategorized |
| Green | Low priority or informational |
| Yellow | Medium priority |
| Red | High priority or urgent |

Category is set via a color picker dot on each task row.

### 5.6 Due Dates
Each task optionally holds a due date, editable inline. Displayed as a plain date; no automated sorting or alerting is applied to it.

### 5.7 Drag-and-Drop Reordering
Within each section (Active, Done, Backlog, Expired), tasks can be dragged and dropped to set a custom order. Order is persisted to the backend immediately.

### 5.8 Inline Editing
Task titles are editable by clicking on them. Changes are saved on blur or Enter key.

### 5.9 CSV Import
Users can bulk-import tasks from a `.csv` file via the avatar menu. The importer:
- Requires a `title` column
- Accepts optional columns: `category`, `status`, `due_date`, `order`, `last_modified`, `never_stale`
- Handles Excel/Google Sheets exports (UTF-8 BOM)
- Returns a summary of imported rows, skipped rows, and warnings

---

## 6. User Flows

### Sign In
```
Landing page → "Sign in with Google" → Google OAuth consent → Redirect back → Task view
```

### Create a Task
```
Type title in the Add Task bar → (optionally set category/due date) → Press Enter → Task appears at bottom of Active list
```

### Complete a Task
```
Click the checkbox on any Active task → Task moves to Done tab
```

### Task Goes Stale
```
Active task not modified for 8 days → On next page load → Task auto-moves to Expired tab
```

### Bulk Import
```
Click avatar → Import CSV → Select file → Review import summary → Tasks added to list
```

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Active list accuracy | Users report their active list reflects real priorities |
| Return visits | User opens the app more than 3 times per week |
| Task completion rate | Expired tasks < 40% of total (goal: Done tasks dominate) |

---

## 8. Constraints & Assumptions

- Single-user data model — all tasks are scoped to one authenticated Google account
- No offline support — requires network for all read/write operations
- All data persisted in a PostgreSQL database; no client-side storage beyond session identity
- Stale expiry runs on page load (next GET /api/tasks), not on a scheduled background job
