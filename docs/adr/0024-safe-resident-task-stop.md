# Safe Resident Task Stop

Atlas [3.1.2, 3.2.1 and 3.2.2](../decisions/atlas.md) controls resource
admission, accepted commitments and finish-active-Step cancellation. This ADR
records the bounded implementation of #221, prerequisite to #134.

`cancel_resident_task` identifies an existing Resident and Task. A future Task
is removed without starting it. An active Task retains its current Step,
snapshotted route, start time and completion deadline. Its remaining production
Steps are replaced by physical carried-item deposits and source-correct Tool
returns, derived through the existing inventory projection and route planner.
The existing chronological executor performs this cleanup. No separate
scheduler or task producer is introduced.

A serde-default `stop_requested` flag on the existing Task preserves this
lifecycle across reload. The Resident work view exposes the flag independently
of Walking, Working or Blocked activity. Repeating the request while cleanup is
pending is a no-op; unknown or completed identities reject. This is synchronous
identity behavior, not the final transport protocol in #129.

Admission operates on a scratch Farm. Remaining accepted Tasks are replanned
through the existing resource planner and Tool calendar, preserving their
identities and order. Missing inputs or changes to another Resident's accepted
commitments reject the whole request. The current Step cannot move. Stopped
cleanup cannot be stripped by later manual admission. Idle physical cleanup is
scheduled at actual Step completion, so a large elapsed interval and incremental
advancement produce the same outcome.

Only pending Oven jobs whose future start Steps are removed are discarded.
An active Oven-start Step still consumes its inputs at its original completion
time and leaves the autonomous job intact. Completed output, consumed inputs,
XP and harvest-deposit provenance are retained.

Stopped cleanup verifies its physical target and current storage capacity before
transferring custody. Exceptional saved target or capacity faults leave carried
items and Tools intact and expose a recoverable block. Repair retries the same
Step. Normal accepted production retains its existing storage-reservation
semantics; this change does not redefine capacity for unrelated work.

Legacy client response normalization defaults an omitted resident-entry
`stop_requested` to false while retaining explicit flags and the existing work
state. Only the legacy boundary permits omission; normalized Farm views expose
the current boolean contract.

The independent contracts are
`crates/my_farm_core/tests/resident_task_stop.rs` and
[their acceptance specification](../acceptance/resident-task-stop.md), together
with the protected temporal Tool and harvest-deposit contracts. #134 retains
player-facing controls, pause/resume and protocol work. #171, #172 and #200 retain
complete chain, autonomous-resource and goal admission requirements.
