# Manual Tool Custody Intervals

Product authority is [Decision Atlas 3.1.2 and 3.2.1](../decisions/atlas.md):
all-or-nothing resource reservation and no preemption of accepted commitments.
[Decision 3.2.2](../decisions/atlas.md) controls future goal cancellation and
required cleanup; this implementation adds no goal cancellation command. This ADR
records how the bounded manual Tool prerequisite implements those Decisions.

Manual crop work uses the existing Resident Task admission and executor. Tool
availability is derived from physical Tool Source stock, carried Tools with their
source identities, and remaining PickupTools/ReturnTools steps. A temporary
calendar reserves each physical copy from checkout completion through physical,
source-correct return completion, including carrying and return travel. It does
not reserve the Tool through autonomous crop growth or transfer inventory.

Per-Resident queue order and accepted task identity remain authoritative. The
calendar uses generated `task-<next_id>` identities to recover admission precedence
numerically; actual held Tools precede future checkouts because physical custody
cannot be preempted. Legacy noncanonical identities have no provable later
admission ordinal, so the calendar treats them conservatively ahead of newly
generated commitments. These are implementation ordering rules for the existing
no-preemption Decision, not additional product policy. New admission
may delay its own start but never rewrites earlier commitments. Same-Resident
cleanup reuse is suppressed when another Resident already has a Tool checkout
commitment, preserving the earlier promised physical return.

Future-task reordering replans on a scratch Farm and reconciles the same Tool
calendar before committing. It can move only the requesting Resident's future
work. Any proposed plan that moves another Resident's accepted queue or the
requesting Resident's active task is rejected atomically with a conflict reason;
successful reorders preserve the requested future order. Checked timing arithmetic
also applies to replan admission. Actual upstream delay remains distinct from a
new reorder request and may slide dependent predictions during execution.

Remaining paths, durations and work terms stay snapshotted. Derived deadlines may
slide after an actual upstream delay. The existing executor processes ready heads
chronologically across Residents, with physical return preceding checkout at the
same instant. A blocked holder cannot guarantee a finite future release; unrelated
Tools can still execute. Arithmetic overflow rejects admission rather than
creating a timing promise.

No calendar, new task producer, secondary inventory, or new save format is
persisted. Existing queues and custody reproduce the calendar after reload.
Residents with physical custody remain in the calendar even when their saved
queue key is absent. Without a queued return, that custody promises no future
supply and cannot back another Resident's admission.
Present saved Tool stock maps preserve absent per-kind keys as zero; serde
whole-field defaults remain for older saves without Tool stock fields.

This implements the bounded #214 prerequisite. #171 retains future-output and
complete chain reservation work; #172 retains autonomous production resource
phases, and #200 retains finite goal admission and output accounting. The
independent contracts are `tests/temporal_tool_admission.rs` and
`docs/acceptance/manual-tool-intervals.md`.
