---
id: my-farm-product-decisions-2026-10-11
title: "My Farm — approved product decision tree"
category: product-design
decision_status: accepted
implementation_status: not-verified
date: 2026-10-11
tags: [my-farm, decision-atlas, resident-control, production-scheduling, reservations, ux]
issues: [115, 125, 126, 130, 133, 134, 135, 148, 150, 153, 171, 172, 200]
---

# My Farm — product decision tree / trie

These owner-approved decisions are repository-owned **source records** for the previously designed Decision Atlas (hierarchical navigation, tags, relations, and verified decision-to-code traceability). **Accepted** means the user decided; it does not mean an implementation or Pages demo is shipped. This tree supplements the linked issue PRDs; it does not supersede their detailed acceptance contracts.

Stable node identity is the path in each leaf. Branches are navigational categories, not an execution plan. Every leaf records the selected A/B/C answer, rule, and existing authoritative issue links. The Decision Atlas viewer, cross-repository index, schema validator and CI publication are **not implemented or verified** by writing this source record.

## Hierarchical decisions

- **My Farm**
  - **experience**
    - **platform**
      - **`my-farm/experience/platform/pages-single-player`** — **A now; C later**: Build complete browser-local Rust/WASM single-player parity incrementally on production GitHub Pages with real playable proofs; hosted multiplayer through multiplayer-setup-service/moenarch.com is later. [#126](https://github.com/moritzbrantner/my-farm/issues/126), [#153](https://github.com/moritzbrantner/my-farm/issues/153). Tags: `platform`, `pages`.
    - **art**
      - **`my-farm/experience/art/colorful-readable-3d`** — **A**: Colorful, recognizable 3D crops, Residents and structures with clear growth and readiness cues; visible from gameplay camera and phone-sized screens. [#148](https://github.com/moritzbrantner/my-farm/issues/148), [#125](https://github.com/moritzbrantner/my-farm/issues/125). Tags: `art`, `usability`.
    - **camera**
      - **`my-farm/experience/camera/management-overview`** — **B**: Default elevated freely rotatable 3D overview, with tilt, zoom and reset; no locked-only isometric view. [#148](https://github.com/moritzbrantner/my-farm/issues/148), [#150](https://github.com/moritzbrantner/my-farm/issues/150). Tags: `camera`, `interaction`.
    - **hud**
      - **`my-farm/experience/hud/progressive-schedule`** — **C**: Compact current/next Resident tasks in the scene-first HUD; expandable detailed timeline for commitments, dependencies, reservations and estimated completion. [#115](https://github.com/moritzbrantner/my-farm/issues/115), [#135](https://github.com/moritzbrantner/my-farm/issues/135), [#171](https://github.com/moritzbrantner/my-farm/issues/171). Tags: `hud`, `scheduling`.
  - **residents**
    - **control**
      - **`my-farm/residents/control/hybrid`** — **C**: Delegated Resident task management is default; optional direct control of one Resident uses the same authoritative Rust Farm. [#126](https://github.com/moritzbrantner/my-farm/issues/126), [#150](https://github.com/moritzbrantner/my-farm/issues/150). Tags: `residents`, `authority`.
      - **`my-farm/residents/control/first-field-slice`** — **A**: First owner-visible direct-control Pages slice: walk to Wheat, plant, grow, harvest, carry to Silo, deposit, and return to task management. [#126](https://github.com/moritzbrantner/my-farm/issues/126). Tags: `wheat`, `pages`.
      - **`my-farm/residents/control/busy-takeover`** — **B**: Take control at a safe step boundary by pausing delegated work; preserve and later resume queued tasks, carried goods, Tools and reservations. [#126](https://github.com/moritzbrantner/my-farm/issues/126), [#134](https://github.com/moritzbrantner/my-farm/issues/134). Tags: `lifecycle`, `authority`.
      - **`my-farm/residents/control/movement-input`** — **C**: Same manual mode supports WASD or touch joystick and click/tap-to-move; steering interrupts a pending path safely. [#150](https://github.com/moritzbrantner/my-farm/issues/150), [#126](https://github.com/moritzbrantner/my-farm/issues/126). Tags: `input`, `movement`.
      - **`my-farm/residents/control/follow-and-overview`** — **C**: Direct-control camera switches smoothly between close Resident follow and the freely rotatable farm overview without changing gameplay. [#150](https://github.com/moritzbrantner/my-farm/issues/150), [#148](https://github.com/moritzbrantner/my-farm/issues/148). Tags: `camera`, `movement`.
    - **work**
      - **`my-farm/residents/work/context-and-sweep`** — **C**: Contextual planting/harvesting of one plot plus deliberate multi-plot hold-and-drag sweeps executed in physical task order by the Resident. [#150](https://github.com/moritzbrantner/my-farm/issues/150), [#126](https://github.com/moritzbrantner/my-farm/issues/126). Tags: `farming`, `input`.
      - **`my-farm/residents/work/tool-choice`** — **C**: Choose the correct available Tool automatically by default; permit optional explicit manual equipment while honoring Tool checkout and reservations. [#150](https://github.com/moritzbrantner/my-farm/issues/150), [#126](https://github.com/moritzbrantner/my-farm/issues/126). Tags: `tools`, `authority`.
  - **production**
    - **admission**
      - **`my-farm/production/admission/automatic-one-off-goals`** — **B**: One Produce N new Bread request automatically builds and atomically admits the full feasible production chain; no per-step approval or recurring stock target. [#200](https://github.com/moritzbrantner/my-farm/issues/200), [#135](https://github.com/moritzbrantner/my-farm/issues/135). Tags: `goals`, `automation`.
      - **`my-farm/production/admission/complete-reservation-or-reject`** — **A**: Every real starting input, Resident/Tool/facility slot, producing step and Silo/Barn capacity must be reservable for the entire chain; otherwise reject completely with explanation and never auto-buy. [#171](https://github.com/moritzbrantner/my-farm/issues/171), [#200](https://github.com/moritzbrantner/my-farm/issues/200). Tags: `reservation`, `atomicity`.
      - **`my-farm/production/admission/backed-future-chains`** — **C**: Atomically schedule new planting, harvest, deposit, baking and collection as upstream dependencies; future outputs count only when fully backed by admitted steps and concrete starting resources. [#171](https://github.com/moritzbrantner/my-farm/issues/171), [#200](https://github.com/moritzbrantner/my-farm/issues/200). Tags: `dependency`, `reservation`.
    - **scheduling**
      - **`my-farm/production/scheduling/earliest-feasible-finish`** — **A**: Prefer the earliest feasible completion for the entire goal, using legitimate parallelism, bounded deterministic planning, and no preemption of accepted commitments. [#171](https://github.com/moritzbrantner/my-farm/issues/171), [#200](https://github.com/moritzbrantner/my-farm/issues/200). Tags: `performance`, `scheduling`.
      - **`my-farm/production/scheduling/cancel-after-active-step`** — **B**: On goal cancellation finish currently active steps and required cleanup, stop future steps, keep completed goods and safely release only unused future reservations. [#134](https://github.com/moritzbrantner/my-farm/issues/134), [#171](https://github.com/moritzbrantner/my-farm/issues/171), [#200](https://github.com/moritzbrantner/my-farm/issues/200). Tags: `lifecycle`, `cancellation`.
      - **`my-farm/production/scheduling/separate-immutable-goals`** — **A**: To produce five more after a committed ten-Bread goal, create a separate five-Bread goal; do not rewrite the original committed quantity. [#171](https://github.com/moritzbrantner/my-farm/issues/171), [#200](https://github.com/moritzbrantner/my-farm/issues/200), [#135](https://github.com/moritzbrantner/my-farm/issues/135). Tags: `goals`, `identity`.
    - **accounting**
      - **`my-farm/production/accounting/additional-output`** — **A**: Produce N Bread means N additional new units, not reach N in inventory; four existing Bread never count toward the ten-new goal. [#200](https://github.com/moritzbrantner/my-farm/issues/200), [#171](https://github.com/moritzbrantner/my-farm/issues/171), [#135](https://github.com/moritzbrantner/my-farm/issues/135). Tags: `goals`, `accounting`.
      - **`my-farm/production/accounting/deposit-completion`** — **C**: Count a new Bread unit toward its goal only after successful authoritative Barn deposit; Oven Ready Output and Resident pickup are intermediate states. [#200](https://github.com/moritzbrantner/my-farm/issues/200), [#171](https://github.com/moritzbrantner/my-farm/issues/171), [#172](https://github.com/moritzbrantner/my-farm/issues/172), [#135](https://github.com/moritzbrantner/my-farm/issues/135). Tags: `goals`, `storage`.
      - **`my-farm/production/accounting/spend-credited-output`** — **A**: Deposited credited Bread is immediately usable or sellable unless separately reserved; cumulative production credit survives later sale or use. [#200](https://github.com/moritzbrantner/my-farm/issues/200), [#171](https://github.com/moritzbrantner/my-farm/issues/171), [#135](https://github.com/moritzbrantner/my-farm/issues/135). Tags: `inventory`, `accounting`.
    - **feedback**
      - **`my-farm/production/feedback/recent-completed-goals`** — **B**: Show brief completion notification and retain bounded inspectable recent completed-goal history, then remove finished goals from the live queue; durable and duplicate-free, not permanent analytics. [#200](https://github.com/moritzbrantner/my-farm/issues/200), [#135](https://github.com/moritzbrantner/my-farm/issues/135), [#126](https://github.com/moritzbrantner/my-farm/issues/126). Tags: `history`, `hud`.

    - **rewards**
      - **`my-farm/production/rewards/goal-completion-bonus-xp`** — **B**: Completing a player-authored finite `Produce N new` goal grants **additional XP** beyond existing farming/production XP, exactly once on the final successful goal-attributed Barn deposit (N/N). Incomplete or cancelled goals earn no completion XP. The XP is awarded by the authoritative Farm progression model and shown in the compact completion notification/history; **selected B:** completion XP scales with genuine goal-attributed production effort. Equivalent work (one 10-Bread goal versus ten 1-Bread goals) should earn approximately the same aggregate bonus, without a flat per-goal jackpot. The effort metric is now **B: standard catalog production difficulty based on canonical product/recipe requirements**, not actual Resident time, travel, waiting or inefficient work. The standard value's manual/derived authoring method and XP conversion rate remain open; no diminishing-repeat policy is approved. [#200](https://github.com/moritzbrantner/my-farm/issues/200), [#133](https://github.com/moritzbrantner/my-farm/issues/133), [#135](https://github.com/moritzbrantner/my-farm/issues/135). Tags: `progression`, `xp`, `reward`.
      - **`my-farm/production/rewards/standard-catalog-effort`** — **B**: Bonus XP uses the product/recipe's **standard catalog-defined production effort** grounded in its canonical requirements, rather than observed Resident working time, distance, waits, detours or intentionally inefficient routes. Equivalent output under the same accepted catalog version should earn the same bonus regardless of whether ingredients were already stored or newly produced; snapshot the effective effort terms when a goal is admitted. The value's manual/derived definition, precise XP conversion and rounding remain undecided. [#130](https://github.com/moritzbrantner/my-farm/issues/130), [#133](https://github.com/moritzbrantner/my-farm/issues/133), [#200](https://github.com/moritzbrantner/my-farm/issues/200). Tags: `catalog`, `progression`, `xp`, `balance`.

## Cross-branch relationships for the graph

- **requires** `my-farm/residents/control/hybrid` → `my-farm/residents/control/busy-takeover` and `my-farm/residents/control/movement-input`. Manual Resident takeover is pause/resume; goal cancellation is a different lifecycle.
- **requires** `my-farm/production/admission/automatic-one-off-goals` → `my-farm/production/admission/complete-reservation-or-reject` and `my-farm/production/admission/backed-future-chains`. These share the one Rust-authoritative reservation calendar.
- **constrained-by** `my-farm/production/scheduling/earliest-feasible-finish` → `my-farm/production/admission/complete-reservation-or-reject`. Earlier commitments and proven conservation win over scheduling speed.
- **requires** `my-farm/production/accounting/deposit-completion` → `my-farm/production/accounting/additional-output`. Only new attributable deposited units contribute to the goal.
- **clarifies** `my-farm/production/accounting/spend-credited-output` → `my-farm/production/accounting/deposit-completion`. Historical completed production and currently available inventory are separate quantities.
- **uses** `my-farm/production/feedback/recent-completed-goals` → `my-farm/production/accounting/deposit-completion`. Enter the bounded recent-history view only on confirmed completion.

- **grants-on** `my-farm/production/rewards/goal-completion-bonus-xp` → `my-farm/production/accounting/deposit-completion`. Additional XP is granted once by existing Rust progression authority on the final new goal-attributed Barn deposit, never by UI events or a partial/cancelled goal.

- **scaling** `my-farm/production/rewards/goal-completion-bonus-xp` → `my-farm/production/accounting/additional-output`. Bonus XP is proportional to genuinely completed, goal-attributed production effort; splitting equivalent work among multiple completed goals must not materially increase it. Exact effort metric remains to be chosen.

- **basis-for** `my-farm/production/rewards/standard-catalog-effort` → `my-farm/production/rewards/goal-completion-bonus-xp`. Fixed/catalog-standard difficulty, not observed travel or extra work, determines the XP effort input; the original bonus node still controls exactly-once grant on completion.

## Decision Atlas indexing and traceability handoff

- **Authority:** My Farm owns these product decisions. Its existing GitHub issues own detailed PRDs and acceptance criteria. The planned Atlas aggregates **read-only**; it must not become a second decision database.
- **Index contract proposed earlier:** schema/index/validation in `coding-tooling`, CI publication in `reusable-workflows`, GitHub Pages aggregator that consumes repository-published indexes at build time. No such viewer or validated schema is asserted here.
- **Identity:** Retain the stable `my-farm/...` IDs across refactors and represent changes to an accepted decision explicitly rather than silently renaming IDs.
- **Shared indexing integration:** Tracking issue: [coding-tooling#315](https://github.com/moritzbrantner/coding-tooling/issues/315). The GitHub Pages Atlas viewer and reusable index publication remain future work; this document is the source tree now.
- **Evidence:** Issue references are verified owner-specification anchors. Exact code symbols, acceptance tests, CI publication, actual Pages behavior and implementation status **remain unverified**; never invent them. Only mark verified traceability when a concrete commit/symbol/test can be checked.
- **Migration:** When the shared validator and per-decision schema are built, migrate or index these leaf records without altering their owner-approved choices; do not add a competing authoring source or commit generated fleet-wide indexes to My Farm.

## Scope and integrity

- 23 distinct accepted leaf decisions from the My Farm design session, captured on 2026-10-11.
- Includes recent decisions **B: bounded recent completed-goal history**, **B: additional effort-proportional XP awarded on real goal completion**, and **B: catalog-standard product effort is the XP basis**.
- Do not infer a feature is implemented from this document. First production Pages acceptance for automatic Wheat→Bread goals remains in [#200](https://github.com/moritzbrantner/my-farm/issues/200).
