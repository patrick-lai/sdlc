# Requested batches

Freeze the eligible set and source heads once. Use the requested limit, or admit at most four PRs by default and defer the rest. Give each PR its own coverage map and result, with independent specialist scopes from the shared workflow.

Allocate one concurrency budget across the entire batch, including coordinators and specialists. Do not occupy every slot with PR coordinators that are waiting for children. The batch coordinator can dispatch tagged specialist scopes directly, or start fewer PR coordinators to leave capacity for their panels. Keep available slots busy, share immutable evidence only within the matching PR, and avoid duplicate review graphs.

Follow the host's deadline. Otherwise report progress and continue until every admitted PR is covered or has named unresolved gaps. A timeout cannot produce a clean verdict. Return each admitted PR's revision, status, findings and limitations; label deferred targets. Reassign failed scopes or inspect them locally instead of cycling external providers.

Scheduling alone does not request publication. If the existing schedule explicitly requests reports or Statlas publication, honor that output contract and recheck each head before publishing. Reuse installed reporting tools when they accept the result format. Do not fabricate graph-node evidence to satisfy a renderer or run an unrequested legacy graph just to produce HTML. If the requested publisher cannot accept the native result, return the local result and that publication limitation. PR comments, approvals and notifications need their own authorization.
