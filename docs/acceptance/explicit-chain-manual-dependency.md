# Ordinary Plant backing concrete Harvest

Authority: issue #225 and Atlas Decisions 3.1.2–3.1.3, 3.2.1–3.2.2.
Separate acceptance context `/root` authored these cases against the implementation
worker's frozen `8af8ab8c1d16afe722ac2aa2c8f5772be9bcb6ba`, before the corresponding
ordinary-producer repair. Earlier repairs already exist; this is additive
retrospective acceptance, not a claim that all tests preceded implementation.

The public `PlantCrop` command can queue a real ordinary Corn Plant behind an
active Wheat Plant. The existing public chain admission accepts a later Harvest
of that same plot without an explicit `after` edge. This accepted physical
dependency must remain protected even though its producer is not a concrete job.

`crates/my_farm_core/tests/explicit_chain_manual_dependency_acceptance.rs` proves:

- The actual ordinary Plant followed by concrete Harvest completes with the
  catalog's harvested output, one seed consumed, and conserved custody.
- Reordering the accepted Harvest before its ordinary Plant rejects atomically.
- Stopping the required ordinary Plant while Harvest remains committed rejects
  atomically, with an explanation and unchanged commitments.

Observed baseline: one positive case passes; the two protection cases genuinely
fail because both commands are accepted. The input uses existing public commands,
real queued tasks and the unchanged shared acceptance fixture. No generated crop,
task status, stock or expected outcome is fabricated to exercise the dependency.

Run `cargo test -p my_farm_core --test explicit_chain_manual_dependency_acceptance`
alongside all original `explicit_chain_admission` and `explicit_chain_review_regressions`
contracts after repair. This native technical acceptance does not establish the
automatic goal UI, complete Bread journey or live Pages acceptance.

## Retrospective regression: delayed ordinary Plant and transitive `after` edges

A separate acceptance context authored
`crates/my_farm_core/tests/explicit_chain_ordinary_delay_regression.rs` against
`918f34799576b90da03f8f3b25ef6650f2544c0f` before any repair, from Codex review
finding `4264225140` (diagnostic, not product authority) and Atlas 3.1.2–3.1.3,
3.2.1–3.2.2, 3.3.2: growth is a real upstream dependency and dependent work must
not run before its producers. Each case uses a real ordinary Corn Plant, a
concrete Harvest of that plot and a concrete Wheat Plant on the other Resident
with `after: [harvest]`, advances real time in 1s steps and requires that the
dependent never plants while the Harvest is still waiting, then that the whole
chain physically completes with the catalog Corn yield and conserved Tools.

- `undelayed_ordinary_plant_orders_dependent_after_concrete_harvest` (control,
  same- and cross-Resident): **PASS** on baseline.
- `delayed_cross_resident_ordinary_plant_keeps_after_harvest_job_waiting`: the
  ordinary Plant's restored later deadline leaves the cross-Resident Harvest
  waiting at the maturity guard with an absent crop; save/reload mid-delay.
  **PASS** on baseline: the dependent necessarily sits behind the delayed Plant
  on the planter's own queue, and the existing front-of-queue maturity revision
  re-propagates the Harvest deadline once the crop exists.
- `delayed_same_resident_ordinary_plant_keeps_after_harvest_job_waiting`:
  **PASS** on baseline for the same reason.
- `reorder_delaying_ordinary_plant_cannot_let_after_harvest_job_run_first`: a
  public future-queue reorder moves the dependent ahead of its transitive
  ordinary Plant on the planting Resident. Either an atomic, explained rejection
  or ordered execution with full completion satisfies the contract. **RED** on
  baseline: the reorder is accepted and the dependent plants at 42000 ms while
  the Harvest still waits for a crop that was never planted.

The restore-deadline form of the finding was not reproduced through public
behavior with the two existing Residents; the reorder form is the reproduced
defect. No production code, protected test, fixture or expected assertion was
changed by this acceptance commit.
