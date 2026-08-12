# Repair-agent brief

1. Re-read the full PR and confirm the repairable condition is current.
2. Work only on the PR source branch, preferably in an isolated worktree.
3. Change only trusted paths and the smallest code needed for the failure or current review feedback.
4. Run the repository's narrow checks.
5. Re-read PR state before pushing; never merge, approve, dismiss reviews, or mark ready.
6. Push only the source branch, increment the attempt ledger, and record the new fingerprint.
7. After three failed attempts, stop and hand off.

The brief authorizes a bounded repair push only when the user asked PR Warden to keep the PR healthy. Explanation, readiness, audit, and proof requests remain read-only.
