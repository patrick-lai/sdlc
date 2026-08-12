# Task Board (dummy Java app)

Minimal fixture for **qa-demo** skill validation.

## Stack

- **Domain logic:** plain Java (`Task`, `TaskBoardService`)
- **UI surface:** static HTML/JS under `public/` (local app preview)
- **No Storybook / e2e** — falls through to local app preview

## Boot

```bash
# from this directory
python3 -m http.server 8877 --directory public
# → http://localhost:8877
```

Or:

```bash
npm start
```

## What to prove

1. Add a task with title + priority
2. Mark it complete
3. Filter to **Completed** and see it listed
4. Empty-filter proof: **Active** shows no open tasks after completion
