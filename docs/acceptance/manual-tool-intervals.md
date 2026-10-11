# Manual Tool custody interval acceptance

Independent acceptance for #214, the bounded manual crop-task prerequisite of
#171, with #172's step boundary respected. Source baseline
`a1ec8ee22dcf253a5c0f32689c310e1bf12822e5`; no production patch supplied or edited.
Shared conventions sourceRevision: `46d8793bb3034326561f876dcc67dbaa5aa1e432`.

Authority: #171/#172 owner decisions, `docs/decisions/atlas.md` 3.1/3.2,
`CONTEXT.md`, and ADRs 0011–0016/0018/0022. AGENTS also refers to missing
`docs/agents/issue-tracker.md`, `triage-labels.md`, and `planning-workflow.md`;
these unavailable references are reported rather than guessed. Existing authoritative
Rust interfaces and documented domain rules settle this bounded scope.

Run `cargo test -p my_farm_core --test temporal_tool_admission --locked`.
Tests use actual `new_farm`, default catalog, `apply_command`, `apply_elapsed`,
`farm_view` and FarmState JSON save/reload. They define no new public API, goal
producer, executor, save envelope or frontend reservation calendar.

The baseline runs seven tests: two green (capacity/current-input atomic rejection),
five red at the second Resident's real PlantCrop admission with
`required tool unavailable`. This is an actual runtime behavior failure; assertions
beyond that admission have not yet executed and are not claimed verified.

Covered contract:

- Accept later manual PlantCrop checkout of the one Hoe after the earlier Resident's
  physical ReturnTools, preserving earlier accepted task IDs/order/terms.
- Show accepted later work in the existing Resident work read model.
- Derive non-overlapping checkout/return completion from actual task step timestamps.
- At every elapsed observation, conserve exactly one real Hoe/Sickle across source
  stock and carried inventories; consume exactly three actual planting Crops.
- Two accepted harvests share one Sickle and deposit exactly four real Wheat, with
  no duplicate credit when the same elapsed observation is repeated.
- One large elapsed advance matches the same elapsed time in small advances.
- Reload mid-checkout and match each subsequent authoritative state exactly.
- Late actual first-step completion delays subsequent checkout; never steal the held
  Tool or make ordinary waiting into blocked invariant recovery; all cleanup finishes.
- Existing accepted harvest reserves its two-Wheat Silo deposit; a second harvest
  cannot consume that capacity. Rejection leaves the entire Farm unchanged.
- Missing current planting Crop rejects with no new tasks or partial Farm changes.

## Fixture provenance and delay

Positive shared work uses real manual crop Commands from a fresh Farm with its
actual initial six Wheat and one Hoe. Capacity uses the established integration-test
pattern of two initially mature authoritative `PlantedCrop` records, not fabricated
outputs; every harvest/deposit still executes through real Commands/elapsed state.

The delay case modifies the **active authoritative task's actual next completion
deadline** by 20 seconds after both commitments are admitted. This is deliberate
saved-state fault injection for late execution, not a production Command, browser
timer, catalog rebalance or promise that players can edit task deadlines. It tests
downstream recovery via the real executor. Preserve accepted production terms and
recompute derived dependent times. Independent re-verification is required if fixture
or timing changes alter this late-execution scenario.

## Scope and remaining gates

Tool custody includes physical pickup/return travel; it is not a reservation for
all subsequent autonomous crop growth. Existing manual crop steps suffice here;
#172 still owns explicit resource/presence declarations and autonomous production
release/reacquisition. No Oven, finite goal, future-produced material accounting,
producer provenance, goal completion/XP or optimizer is implemented/tested here.
#171/#172/#200 remain open for their full outcomes.

Before merge run all recorded acceptance, existing core smoke/regressions and the
repository's `bun run validate` completion gate. No proven affected-test dependency
mapping exists for shared planner/elapsed/serialization boundaries, so future
implementation requires the full applicable suite. Keep this acceptance-only PR
draft while red. No production browser or Pages completion is claimed.

## Physical stock survives reload during custody

`reloading_an_actual_checked_out_tool_preserves_physical_stock` uses a normal
PlantCrop command and actual immediate adjacent tool pickup. Before serialization,
there is one Hoe in total across storage and Resident custody. Reload must retain
that exact physical quantity, carried inventory, queue and timestamp; returning
the tool must conserve the same total. Modern saves must not recreate an absent
storage key while that tool is checked out. Legacy defaults do not justify
inventing an additional tool in a current save.

Independent baseline `a1ec8ee`, acceptance branch `3d15c8`: the new case fails
at the first post-reload conservation assertion (total 2, expected 1).
`ensure_tool_stocks` currently backfills the absent Hoe key even when one is
carried. An isolated Cargo target confirms this result; the full eight-case
contract is 2 passing / 6 failing, with the other five failures still rejecting
future shared-tool admission. This is a #171/#214 blocker, not an approved change
to onboarding scope or a successful tool-reservation result.
