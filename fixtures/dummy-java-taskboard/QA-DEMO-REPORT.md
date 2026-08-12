## QA Demo Report

- **Target:** `fixtures/dummy-java-taskboard` (dummy Java Task Board)
- **What we proved:**
  - Add high-priority task (mirrors `TaskBoardService.addTask`)
  - Mark complete
  - Filter → Completed shows task
  - Active filter empty state after completion
  - Empty-title validation error
- **Boot method:** Local app preview — `python3 -m http.server 8877 --directory public` (why: no Storybook/e2e; static UI mirrors Java domain; port 8765 owned by Lumine)
- **Result:** **PASS**
- **Artifacts:**
  - Video: `testreel-output/demo/recording-2026-08-12_18-57-40-087.mp4`
  - Screenshot: `testreel-output/demo/final-2026-08-12_18-57-39-770.png`
- **Runner:** `scripts/qa-demo-runner.mjs` (TestReel `recordPage` + skill `caption-overlay.mjs`)
- **Theme:** Atlassian blue chrome (`#0052CC` → `#0747A6`) on TestReel frame + app surface.
- **Residual risks:** No JRE on this host — Java sources are domain contract only; UI is the JS mirror. Captions rendered via DOM `#__sdlc_caption`.
