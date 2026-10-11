# Manual Tool Custody Intervals

Manual crop work uses the existing Resident Task admission and executor. Tool
availability is derived from physical Tool Source stock, carried Tools with their
source identities, and remaining PickupTools/ReturnTools steps. A temporary
calendar reserves each physical copy from checkout completion through physical,
source-correct return completion, including carrying and return travel. It does
not reserve the Tool through autonomous crop growth or transfer inventory.

Per-Resident queue order and accepted task identity remain authoritative. Generated
`task-<next_id>` identities preserve admission precedence numerically; currently
held Tools take precedence over future checkouts. Legacy noncanonical identities
are treated conservatively ahead of newly generated commitments. New admission
may delay its own start but never rewrites earlier commitments. Same-Resident
cleanup reuse is suppressed when another Resident already has a Tool checkout
commitment, preserving the earlier promised physical return.

Remaining paths, durations and work terms stay snapshotted. Derived deadlines may
slide after an actual upstream delay. The existing executor processes ready heads
chronologically across Residents, with physical return preceding checkout at the
same instant. A blocked holder cannot guarantee a finite future release; unrelated
Tools can still execute. Arithmetic overflow rejects admission rather than
creating a timing promise.

No calendar, new task producer, secondary inventory, or new save format is
persisted. Existing queues and custody reproduce the calendar after reload.
Present saved Tool stock maps preserve absent per-kind keys as zero; serde
whole-field defaults remain for older saves without Tool stock fields.

This implements the bounded #214 prerequisite. #171 retains future-output and
complete chain reservation work; #172 retains autonomous production resource
phases, and #200 retains finite goal admission and output accounting. The
independent contracts are `tests/temporal_tool_admission.rs` and
`docs/acceptance/manual-tool-intervals.md`.
