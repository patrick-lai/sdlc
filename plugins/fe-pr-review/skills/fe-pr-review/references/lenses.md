# Review lenses

Select the risks touched by this change. These are prompts for inspection, not mandatory reports for every facet.

## Frontend

- Follow the user action through state, request, rendering and completion. Check loading, empty, error and cancellation states where changed.
- Inspect cache invalidation, stale responses, subscriptions and retained side effects when their lifecycle changes.
- Check keyboard access, names, focus, semantics and responsive behavior affected by changed markup or interaction.
- Trace dynamic values through path, selector, URL, query and serializer boundaries. Confirm client/server and generated-schema compatibility for changed fields.
- For a changed feature gate, compare the actual on/off paths and persisted state. During intentional gate removal, compare with the selected winning branch; retired controls in the losing branch are not missing requirements.
- Inspect build/runtime or pre-merge/post-merge differences only when configuration, dependencies or generated artifacts change.

## Backend

- Follow the request, event or job through validation, authorization, side effects and response. Check absent, null, empty and error meanings when changed.
- For stateful changes, inspect transaction boundaries, partial writes, retries, idempotency and read-check-write races.
- For concurrent work, inspect cancellation, timeouts, shutdown, ownership and resource bounds. Find a concrete schedule before claiming a race.
- For schema, API or migration changes, trace consumers, mixed-version compatibility, deploy order and recovery. Check only rollout obligations required by current policy or a concrete risk.
- Check query bounds, secrets and identifier scope where the diff changes their treatment. Avoid scale fears without a reachable input or measured constraint.

For either area, use tests as evidence for the claimed behavior. A regression test should distinguish the old wrong path from the intended one. Check nearby sibling paths only when they share the changed invariant.
