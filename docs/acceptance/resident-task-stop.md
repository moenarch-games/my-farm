# Safe Resident Task stop: independent acceptance for #221

This is the bounded Rust-core prerequisite of [#134](https://github.com/moritzbrantner/my-farm/issues/134), upstream of #171/#172/#200. It does not close those PRDs. Authoritative intent is current Atlas **3.1.2, 3.2.2**, #134's chosen **B** finish-active-step/physical-cleanup policy, and ADRs0011–0018/0022/0023. The separate acceptance context inspected baseline `90c7dafc2c9c3634a9f287fbe5785d200357101a` before production. Local AGENTS/domain/CONTEXT apply; live conventions resolved successfully with no diagnostics, all29 listed files read, sourceRevision `46d8793bb3034326561f876dcc67dbaa5aa1e432`.

## Immutable outcomes and routine seams

Use the existing Rust command/application, elapsed executor, Catalog, FarmState, FarmView and serde save authority. The test proposes the typed public command wire `cancel_resident_task` with `resident_id` and `task_id`. It proposes a readmodel `resident_work[resident_id].stop_requested` boolean separately from truthful walking/working/blocked activity. Names/signatures/storage shape may be independently translated before production; these do not authorize weakening the outcomes below or inventing another executor.

- Cancel only the selected stable Task identity. A not-started selected Task never performs its work. A currently active Step, including its walking and working portions, finishes once at its existing deadline. Thereafter only necessary physical carried-item storage and original-source Tool return continue; no future canceled production starts.
- Preserve actual consumed input, completed crop/output and ordinary earned XP. Do not synthesize storage before the physical deposit, remotely return Tools, refund consumed ingredients or award a goal-completion bonus.
- Preserve independently accepted Tasks on the same or another Resident, their identities and commitments. Do not cancel/reorder/preempt unrelated work. If canceling unperformed output would break a separately accepted downstream task's inputs, reject with a useful dependency reason and whole-Farm equality at the settled command timestamp.
- Repeated pending same-target stop is a state-idempotent no-op (accepted or a useful already-pending rejection). It must not add cleanup or retime the active step. Once the Task finishes, a stale target rejects and leaves newly queued work untouched. Unknown Resident/Task rejects usefully and atomically.
- Pending stop survives actual serde reload. Same-time advancement does nothing twice. One delayed elapsed update and actual stepwise updates produce identical authoritative final state and original harvest/deposit attribution.
- Cleanup failure remains visibly blocked with conserved real carry and Tools; it is neither false idle nor silent remote success. Repairing the isolated fault permits real existing elapsed execution to resume once, without losing or duplicating cargo.

## Executable coverage and fixture provenance

`crates/my_farm_core/tests/resident_task_stop.rs` contains20 tests. Four characterization tests execute the existing implementation successfully before any cancellation repair: normal Plant/growth/Harvest/deposit/source return; all six actual lifecycle boundaries; real accepted future Oven ingredient dependency; and load acceptance of the two isolated saved-input faults without changing queue, carry or outcomes. Sixteen behavior tests use the real command deserializer and executor for queued selection/another Resident, retained following work, unsafe downstream-input cancellation, item and Tool pickup, walking and working, multi-plot harvest, deposit and return, repeat/stale/unknown identity, reload/delayed advancement, pending Oven cancellation, active Oven-start consumption/autonomous-job preservation followed by real collection, and both recovery failures.

Positive crop/output/custody fixtures arise only through real PlantCrop/SweepHarvest commands and actual elapsed deadlines. The initial/fresh handoff Resident position is a valid Farm tile chosen before scheduling to expose a nonzero pickup walk. Oven fixtures begin in the existing valid level2/xp4 unlocked state and purchase the Oven through the real command; no jobs, completion results or carried ingredients are fabricated. Task and event identities are obtained from actual execution. Fixture-loop bounds only guard these small finite tests; they are not a new gameplay timeout.

Recovery negatives are **explicit exceptional saved-input faults**, not claims of normal player-command reachability. After a real harvest has created carried Wheat and physical Sickle custody, mutate only (a) Silo capacity to its currently stored Wheat quantity or (b) Silo tile to an out-of-Farm unreachable coordinate. Keep all other saved fields, queues, inventories and outcomes byte-value equivalent and call the real FarmState deserializer. Baseline accepts both isolated faults, proven independently. Cancellation/elapsed must expose the specific capacity/storage or reachability/target failure. Restore only the same capacity or tile field through a real reload, then advance the existing executor; no fabricated recovery outcome or bypassed admission. If a later strengthened loader rejects such an input first, independently translate this to honest load-boundary coverage and mark live cleanup recovery unrun rather than bypass validation.

## Baseline evidence and gates

```sh
cargo test -p my_farm_core --test resident_task_stop
cargo test -p my_farm_core --test temporal_tool_admission --test harvest_deposit_observation
cargo fmt --all --check
cargo clippy -p my_farm_core --test resident_task_stop -- -D warnings
```

At baseline90c7 the new file compiled and ran: **4 passed,16 failed**. Every failed test reached the real `FarmCommand` deserializer and rejected the missing `cancel_resident_task` variant. This is genuine missing public behavior; all dependent post-cancellation assertions remain **unexecuted**, not passing or individually witnessed failures. Loop-contained later deposit/return and alternate invalid-identity cases also remain unexecuted after that first failure. Recovery characterization confirms load acceptance but does not claim baseline live recovery works. The initial fixture Tool-pickup-location error was corrected before this recorded handoff; the final baseline failure is solely the missing command. Log retained at `/tmp/farm221-stop-baseline.log`. Existing reused contracts independently passed unchanged: temporal Tool15/15 and harvest-deposit9/9 (`/tmp/farm221-reused-baseline.log`). Formatting passed. Strict local Clippy1.99 and1.98.1 are blocked by a preexisting production `explicit_counter_loop` at `engine.rs:3907`; no production repair was made. A separate lint run allowing only that known baseline lint checks the new contract, not a claim that the strict required gate passed. Hosted pinned Rust1.96.1 and full postimplementation gates remain unrun.

Reuse the independent existing `temporal_tool_admission.rs`15-case contract and `harvest_deposit_observation.rs`9-case contract unchanged: temporal FIFO/reorder/nonpreemption, physical source custody, exact capacity/inventory and original harvest receipt attribution remain protected. Before merge run every new and reused contract and the **full applicable suite**: no verified deterministic test-impact map covers the shared planner, elapsed, view and save boundaries. Existing CI/server/binding gates remain required; acceptance-only draft RED is intentional, not merge readiness.

## Remaining boundaries

#129 remains the explicit prerequisite for **final protocol handling**. This technical child covers synchronous stable-identity state idempotence only. It does not establish lost-acknowledgement resolution, server-version/reconnect ambiguity, cross-Farm reset identity, journaling or transport exactly-once. #134 retains UI/recovery/direct-control/pause/resume and final protocol work. No player-facing cancellation route or Pages deployment is claimed by this core acceptance draft.

#171/#172/#200 retain the full causal Wheat→Bread quantity/output/goal contract, autonomous processing intervals, shared-station admission and goal-effort progression accounting. This prerequisite does not invent a finite-goal API or claim a complete Bread chain. Original ordinary dirty checkout remains untouched. Production must be implemented in a distinct context after the committed acceptance handoff and draft exist.

## Retrospective post-stop admission supplement

Independent final audit of production `99791009ebccb7bf530340c8ebd14b7f22a70a87`
reran the original20 stop,15 temporal Tool and9 harvest-deposit tests:44/44 GREEN.
It found an executable coverage gap, not a demonstrated defect: pending stopped
cleanup followed by new public admission and future reordering. After the
separate mechanical normal-view fixture translation `f798682`, the independent
acceptance author added `pending_stop_cleanup_survives_new_public_admission_and_future_reorder`
before any further repair. Original20 expectations remain unchanged.

This case obtains real Sickle custody through Plant/growth/SweepHarvest and
actual elapsed deadlines, stops at the active Harvest step, then admits two real
Plant tasks and reorders their stable identities with the public command. At
each admission/reorder and reload, the complete stopped head Task must remain
equal, including active step, start/deadline, stop flag and physical deposit/source
return cleanup. Actual execution then proves only the active harvest completes,
the future canceled plot stays planted, both later tasks complete, stock is
conserved and the real deposit retains the original harvest identity. Baseline
997 plus f798 is **GREEN** for this supplemental case, not a claimed failing
regression or an implementation-preceding test. Log:
`/tmp/farm221-independent-poststop.log`.

No additional ordinary idle-carry fixture is asserted: existing direct fixture
coverage creates carry by state mutation, whereas this supplement requires
actual public-command provenance. No independently established ordinary command
sequence leaves idle carry for the changed per-step scheduling branch; that
specific characterization remains a source-audit limitation rather than a
fabricated outcome or new cadence requirement. Existing stopped delayed/stepwise
and normal temporal-tool parity contracts passed unchanged.

## Supplemental legacy client response normalization

Independent regression authored against frozen `7f9af825b7962b3330c861c00398b996e93b61a4`
for review finding4244145236, before the next repair. Public
`normalizeFarmView` must default a missing resident-entry stop flag to false,
preserve explicit true/false, retain all other identity/state fields and avoid
mutating its input. An entirely absent legacy work map retains existing default
behavior. Both public farm/command response adapters must provide the same
normalized boolean without changing response versions/events/error/acceptance.
The fixture represents the legitimate pre-field wire shape using an optional
field type, without assertion casts pretending it already satisfies FarmView.

Actual Bun baseline executes4 methods:2 PASS (absent map/explicit booleans),
2 FAIL with actual `undefined` where false is required (existing legacy entry and
public response adapters). Log `/tmp/farm223-legacy-stop-baseline.log`.
Current LegacyFarmView typing also rejects the legitimate optional legacy flag;
that separate compiler baseline is recorded, not substituted for runtime RED.
Original protected stop contracts remain unchanged.

Adjacent source audit: ResidentTaskSummaryView (current/queued view tasks) has
no stop_requested field, so no task-summary default is invented. The persisted
Rust ResidentTask boolean already has serde(default); this client normalizes
FarmView rather than raw Farm state. Both response adapters delegate to the one
public view normalizer. No broad malformed-JSON validation or new stop policy is
introduced. Shared conventions resolve sourceRevision
`46d8793bb3034326561f876dcc67dbaa5aa1e432`.
