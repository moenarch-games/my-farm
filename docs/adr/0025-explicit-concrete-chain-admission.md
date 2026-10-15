# Explicit Concrete Chain Admission

Atlas [3.1.2, 3.1.3, 3.2.1, 3.2.2 and 3.3.2](../decisions/atlas.md)
controls complete resource admission, backed future work, accepted commitments,
cleanup and physical output. This ADR records the implementation boundary of
#225, a prerequisite of #171/#172/#200.

`admit_concrete_chain` accepts caller-chosen local job identities, Resident
assignments, concrete work targets, dependency edges and ingredient bindings.
The core validates the graph, quantities, current storage, producer origins and
numeric bounds. Admission lowers the fixed assignments through the existing
resource-step, route and Tool interval planners into the existing Resident queues
and Oven jobs. A scratch Farm commits only after every job is feasible. Earlier
accepted queues retain their identity, ordering and resource meaning.

The existing chronological task executor forecasts physical delivery in a
disposable snapshot at each dependency deadline. Only derived executable tasks,
Oven commitments and immutable bindings cross back to the authoritative Farm.
Simulated inventory, XP, events and timestamps are discarded. This projection
executes admitted steps and physical idle cleanup; it does not advance unrelated
periodic domains or search for assignments. Growth and baking use the existing
crop/Oven deadlines. Resident loading and later collection remain separate from
autonomous baking.

Serde-default `concrete_chains` stores the minimal commitment mapping: local job
to actual task/Oven identities, dependency/input bindings, accepted work terms
and whether cancellation released unused input claims. Actual task identities
canonicalize producer claims across caller aliases. New future-output bindings
require a pending producer; completed output is available through actual stored
stock. The read model exposes identities, assignments, dependencies and bindings.
Legacy responses normalize an omitted mapping to an empty map.

Storage availability remains computed from physical stock and remaining pickup
steps. For concrete consumers, unproduced supply discounts those reservations
once per actual producer, bounded by its remaining Harvest work and task-tagged
carried harvest cargo. Actual Silo deposit ends that discount, protecting the
promised ingredients against unrelated admission, sale or discard. Unclaimed
stock remains available. There is no duplicated inventory or output ledger.

The executor revises waiting dependency times when real upstream work is delayed.
Before executing another physical step, it propagates deadlines to convergence
within a bound derived from the pending task count. Missing or mismatched actual
crops never satisfy Harvest readiness; captured output cannot replace planting.
Harvest dependencies retain captured Plant growth and actual crop readiness; an
already-started Harvest waits with its physical custody intact until maturity.
Reordering rejects a physical queue that places a concrete consumer ahead of its
same-Resident producer, including implicit same-plot planting, collection and
quantity bindings. Individual producer stop preserves those same physical crop
dependencies even when callers omit a redundant `after` edge. The actual pending
Plant steps identify these prerequisites for ordinary manual producers as well
as concrete jobs; a parallel provenance ledger is not required.
Started collection also checks the actual Oven readiness deadline, preserving
its physical Tool custody and the Oven job while waiting. The actual collection
boundary checks readiness and recipe availability before removing the job.
The existing stop command rejects a necessary producer, retains active consuming
steps and cleanup, and releases only bindings whose consuming work was removed.
Completed goods and consumed inputs retain their meaning.

Accepted crop definitions, effective growth durations and recipe definitions
(including input/output/XP terms and effective baking duration) are immutable
job terms. Execution resolves those terms through the existing physical work
boundary; new admission reads the current catalog. Manual commands retain their
existing catalog and separate-collection behavior.

The protected contract is
[explicit Wheat-to-Bread acceptance](../acceptance/explicit-wheat-bread-chain.md),
with existing Tool custody, harvest-deposit and safe-stop contracts. This core
capability does not close automatic goal admission, goal credit/history/bonus XP,
player controls or the integrated Bread journey in the parent issues.
