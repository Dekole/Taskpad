# k6 load tests

Performance tests against the live Taskpad deployment. Written June 2026, moved into this
repo 2026-09-26 — until then they existed only in `~/projects/task-app-k6test`, on one
laptop, under no version control.

## Running

```
k6 run tests/k6/smoke-test.js
k6 run -e BASE_URL=https://staging.example.com tests/k6/smoke-test.js
k6 run -e TASKPAD_USER_ID=<google-sub> tests/k6/workflow-load-test.js
```

`BASE_URL` defaults to production. `workflow-load-test.js` requires `TASKPAD_USER_ID` and
refuses to start without it.

## The four tests

| Script | Load | What it does |
|---|---|---|
| `smoke-test.js` | 2 VUs, 30s | GET `/`. Is it alive? |
| `load-test.js` | 50 VUs, 5m | GET `/` under sustained normal load |
| `stress-test.js` | ramps to 300 VUs, 13m | GET `/` to find the breaking point |
| `workflow-load-test.js` | 50 VUs, 5m | Full create → complete → delete task cycle |

`testlog.txt` is a captured run from 2026-06-09, kept for comparison.

## Before you run these

**These hit production.** There is no staging environment. `smoke-test.js` is harmless.
`stress-test.js` ramps to 300 virtual users against a 1-vCPU droplet that also serves your
notes to Claude — run it deliberately or not at all.

`workflow-load-test.js` **creates and deletes real tasks** in your account. It cleans up
after itself, but a failed run can leave `load-test-task-*` rows behind.
