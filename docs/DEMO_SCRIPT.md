# Demo Script — Taskpad

**Audience:** Product managers, hiring managers, technical interviewers  
**Duration:** ~8–10 minutes  
**URL:** https://taskpad.duckdns.org

---

## Before the Demo

- Open https://taskpad.duckdns.org in a fresh browser tab
- Make sure you are **logged out** (you should see the landing page)
- Optionally, prepare a sample CSV file (see Appendix) for the import demo

---

## Scene 1: Landing Page (1 min)

**What to show:** The logged-out landing page.

**Talking points:**
- "This is Taskpad — a personal task manager built around one core idea: your active list should only show tasks you're actually working on."
- "Three feature cards on the landing page tell the story: tasks expire automatically, done and expired are tracked separately, and there's no app to install."
- "The footer shows the tech stack: React, FastAPI, PostgreSQL, Docker."

---

## Scene 2: Sign In (30 sec)

**What to show:** Click "Sign in with Google." Complete the OAuth flow.

**Talking points:**
- "Authentication is Google OAuth — no passwords, no email verification. Users click once and they're in."
- "The backend exchanges the OAuth code for a token, creates or updates the user record, and redirects back to the app."

---

## Scene 3: The Main View (1 min)

**What to show:** The task list after signing in.

**Talking points:**
- "After login, users land directly in their task list. The header is minimal — just the app name and a user avatar."
- "Active tasks are at the top. Below that are three tabs: Done, Backlog, and Expired."
- "Notice the columns: title, due date, category dot, stale counter, and a move/delete menu."

---

## Scene 4: Creating Tasks (1 min)

**What to show:** Type a few tasks into the Add Task bar and press Enter.

Suggested tasks to create:
- "Review Q3 budget proposal"
- "Follow up with design team"
- "Update project timeline"

**Talking points:**
- "Creating a task is just typing and pressing Enter. No modal, no form."
- "Tasks appear at the bottom of the active list."
- "Each task gets a stale counter that starts at 0. That number tells me how many days ago this task was last touched."

---

## Scene 5: The Stale System (2 min)

**What to show:** Point out the stale counter column on active tasks.

**Talking points:**
- "This is the most important feature: the stale counter."
- "It counts the days since a task was last modified. After 3 days it turns yellow, after 5 days it turns red."
- "After 8 days with no action, the task automatically moves to Expired on the next page load — not Done. Done means you finished it. Expired means it sat untouched for too long."

**Demo the stale menu:**
- Click a stale counter badge
- Show the "Reset" option (touch the task without editing)
- Show the "Never Stale" option (useful for standing items like recurring reminders)

**Talking point:**
- "Never Stale is for tasks that should always stay in your active list — it suppresses both the counter and auto-expiry."

---

## Scene 6: Editing a Task (1 min)

**What to show:** Click on a task title to edit it inline.

**Talking points:**
- "Title is editable by clicking. It saves on blur or Enter."
- "Due date is editable the same way — click it to open a date picker."

**Demo the category dot:**
- Click the color square on a task
- Change it to red
- "Categories are just color labels — gray, green, yellow, red. No predefined meaning; users assign their own semantics."

---

## Scene 7: Status Management (1 min)

**What to show:** Complete a task, then move one to Backlog.

**Talking points:**
- Click the checkbox on a task: "Clicking the checkbox marks it Done and moves it to the Done tab."
- Click the Done tab to show it landed there.
- Back on Active, click the `⌄` menu on another task and move it to Backlog.
- "Backlog is for tasks that are real but not urgent. They still accumulate stale days and will expire if ignored long enough."

---

## Scene 8: Drag-and-Drop Reordering (30 sec)

**What to show:** Drag a task to a new position in the active list.

**Talking points:**
- "Order is fully manual. Drag and drop to prioritize. The order is persisted to the server immediately."

---

## Scene 9: CSV Import (1 min)

**What to show:** Click the user avatar → Import CSV → upload the sample file.

**Talking points:**
- "For users migrating from a spreadsheet, there's a CSV import. Only `title` is required; everything else is optional."
- "The importer handles Excel/Sheets exports natively, validates categories and statuses, and returns a summary of what was imported, skipped, and warned."

---

## Scene 10: Infrastructure Overview (1 min, optional for technical audiences)

**Talking points (verbal, no screen needed):**
- "The app runs as four Docker containers: Caddy for HTTPS, a React static frontend, a FastAPI backend, and Postgres."
- "Caddy handles TLS automatically via Let's Encrypt — no certificate management needed."
- "Stale expiry doesn't require a background job. It runs as a side effect inside the GET /api/tasks handler — every read checks and cleans up."
- "The whole stack deploys with a single `docker compose up -d`."

---

## Closing (30 sec)

**Talking points:**
- "The GitHub repo is linked from the footer. The code is clean: a FastAPI service layer, a thin router layer, and a React app with a single custom hook for task state."
- "Happy to walk through any part of the code, discuss trade-offs, or talk about what I'd build next."

---

## Appendix: Sample CSV for Import Demo

Save as `sample_tasks.csv`:

```csv
title,category,status,due_date
Draft Q3 budget,yellow,active,2026-06-20
Review vendor contracts,red,active,2026-06-15
Clean up Notion workspace,gray,backlog,
Archive old project files,gray,backlog,
Send thank-you emails,green,done,
```
