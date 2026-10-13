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
