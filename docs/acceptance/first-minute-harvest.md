# First-minute Resident-first Wheat harvest: independent acceptance for #231

Authority: Atlas **1.5.1** (start with a first harvest) and **1.5.2** (Resident-first assignment), plus 1.2.1, 1.3.1, 1.4.1 and 2.1.1, merged intent PR #230, and `AGENTS.md`. Baseline: `origin/main` `d68d5e6`. This contract was written in a separate acceptance context before any production edit. It uses the existing Pages harness (`playwright.pages-demo.config.ts`, real WASM `DemoFarmRuntime`, `wasm_demo` runtime). It does not cover the implementation design.

Test rules: the spec drives user-visible controls only. It **reads** the real WASM save (`my-farm.demo.save.v1`) to check authoritative state. It never writes, seeds or patches Farm state and never injects commands. Time advances only through `page.clock`, as elapsed simulation.

## Obligation map

| #231 obligation | Acceptance case (`apps/web/tests/first-minute-harvest.spec.ts`) |
|---|---|
| A new Farm opens with an already-ripe Wheat Field Plot, with no planting or waiting, in real Farm state | `desktop › new Farm opens with a ripe Wheat Field Plot…`: a Field Plot target with `data-wheat-appearance="ready"` is visible and unobscured right after **New Farm**. The saved `field_plots[id].crop` is `wheat` with `ready_at_ms <= last_update_ms`. All queues are empty. |
| Two selectable Residents | Same test: exactly two scene `button`s named `<Name> Farm Resident`. The default comes from the saved `selected_resident_id`. |
| The first objective is Resident → Harvest → Field; no modal tutorial | Same test: the `Farm guidance` region matches `/Resident … Harvest … (Field Plot\|field\|Wheat)/i`, does not mention Seed or plant, and no `dialog` is open. |
| Desktop: the non-default Resident gets the real Task; it walks, harvests, carries and deposits; success only after the deposit | `desktop › the chosen non-default Resident…`: only the chosen Resident's queue becomes 1, the default stays 0, and guidance names the chosen Resident. The scene marker shows `harvesting`, then transport toward the Silo, while Silo stock is unchanged and there is no "Harvest deposited". After the deposit, Silo stock rises by exactly 2 (catalog Wheat yield), guidance shows "Harvest deposited", and no ripe field remains. The saved `resident_last_harvest_deposit[chosen]` is Wheat, the default Resident has no receipt, and Silo Wheat rises by +2. |
| Cancelling target picking queues nothing | `desktop › cancelling…` (Escape) and `phone touch › phone cancel…` (**Select** action): Harvest is no longer pressed. Clicking or tapping the ripe field and then 30 s of simulated time give no queue, the field stays ripe and stock is unchanged. |
| Non-ready target is rejected without fake completion | `desktop › non-ready and already-assigned…`: Harvest on an empty plot (`data-wheat-appearance="none"`) queues nothing. |
| An occupied target is rejected without fake completion | Same test: the default Resident trying to harvest the field already assigned to the chosen Resident queues nothing. There is exactly one +2 deposit, and the receipt belongs only to the original Resident. |
| Reload during work keeps status, with no duplicate stock or completion | `desktop › reload during the harvest…`: reload while the Resident is non-idle, then **Start Farm**. The Resident is still non-idle, Silo is unchanged, and there is no "Harvest deposited". After completion Silo is +2 once. A second reload plus 120 s leaves inventory and receipts equal. |
| Keyboard path | `desktop › keyboard-only…`: Tab and Enter only reach the Resident selector, the Harvest tool and the ripe Field Plot target, and the chosen Resident gets the Task. |
| Phone/touch narrow viewport | `phone touch › narrow touch viewport…` (390×844, `hasTouch`, `isMobile`): the field, Resident marker and Harvest action are each the topmost element at their centre. Tapping them assigns the chosen Resident. The field does not move by more than 4 px on tap (no camera gesture). Transport is observed before the deposit, then +2 and "Harvest deposited" follow. |
| Visual evidence before harvest, during transport, after deposit | Screenshots go to the test output directory: `desktop-1-before-harvest.png`, `desktop-2-during-transport.png`, `desktop-3-after-deposit.png`, `phone-1…`, `phone-2…`, `phone-3…`. |
| The #212 plant → grow → harvest tutorial keeps working | Reused unchanged: `apps/web/tests/onboarding.spec.ts` (6 tests). |

## UI contract the implementation must provide

Existing seams this contract reuses (keep them stable):

- Main menu buttons **New Farm** and **Start Farm**. The region `Farm guidance` and its "Harvest deposited" completion title.
- Scene Resident markers: `button` named `<Name> Farm Resident`, `data-testid="farm-scene-resident-<id>"`, with `data-resident-state` (`idle|walking|working|blocked`), `data-resident-activity` (`harvesting`, `depositing_inventory`, …) and `data-resident-target` (contains `Silo` while carrying to the Silo).
- Desktop: region `Farm Residents` with buttons whose names start with the Resident name and that carry `aria-pressed` for the work selection. `toolbar` `Interaction Tools` → button `Harvest` (exact) with `aria-pressed`. Escape cancels target picking.
- Phone (≤760 px): `navigation` `Farm actions` with buttons `Harvest` and `Select` that carry `aria-pressed`. Tapping a scene Resident marker selects that Resident for work.
- Field Plot targets: element labelled `Field Plot <plot-id>` with `data-wheat-appearance` (`ready` for ripe Wheat, `none` for empty).
- `data-testid="storage-summary-chip"` with `aria-label` containing `Silo <used> of <capacity>`.

New or changed requirements:

1. A fresh Farm (reset or New Farm) has at least one Wheat Field Plot that is authoritatively ripe at creation. At least one other Field Plot stays empty, which the non-ready rejection case uses.
2. The initial guidance text names the Resident → Harvest → Field order, as described above, and stops telling the player to Seed or plant.
3. While the harvest is in progress, guidance names the assigned Resident's display name. Existing "Follow the harvest…" copy already does this, and it must stay true for the first-minute flow on both layouts.
4. **Keyboard:** the ripe Field Plot target must be reachable with Tab (it currently has `tabIndex=-1`), and Enter on it while Harvest is active must assign the harvest.
5. **Phone:** the ripe field, the non-default Resident marker and the Harvest action must not be covered by HUD, guidance or context sheets at the moment they are needed.

## Baseline evidence (main `d68d5e6`)

Commands (resource-capped):

```sh
bun install --frozen-lockfile && bash scripts/build-farm-art.sh
CARGO_BUILD_JOBS=2 bun run build:wasm-demo
cd apps/web && NODE_OPTIONS=--max-old-space-size=3072 MY_FARM_PREBUILT_WASM=1 \
  bunx playwright test -c playwright.pages-demo.config.ts --workers=1 first-minute-harvest.spec.ts onboarding.spec.ts
```

- `first-minute-harvest.spec.ts`: **0/8 GREEN, 8 RED**. Every test stops at the first precondition: no `[data-wheat-appearance="ready"]` Field Plot exists on a new Farm, because `starting_plots()` has no crop. This is the intended missing behaviour. All later assertions (Resident-first assignment, transport, deposit, reload, keyboard, phone) are **unexecuted on baseline**, not witnessed failures or passes.
- `onboarding.spec.ts` (#212 regression): **6/6 GREEN**.

## Evidence gaps

- **Harness mechanics after the precondition have not been run.** A scratch check of the later steps (transport detection, `advanceUntil`, reload, Tab traversal) was started and then stopped at an owner shutdown before it reached the new cases. Independent re-verification may adjust only timing or selectors that demonstrably keep the scenario the same.
- **Silo-capacity conflict** cannot be reached in the first-minute UI without seeding Farm state, which this contract forbids. The native core contract `crates/my_farm_core/tests/harvest_deposit_observation.rs::failed_deposit_does_not_create_receipt_or_consume_origin` and the capacity-fault cases in `resident_task_stop.rs` cover "no receipt and no fake completion on a failed deposit". They must stay green.
- **Unreachable target:** the starting Farm has no unreachable Field Plot reachable through the UI. This case is left to core path/blocked-task coverage.
- **"No unintended camera gestures"** is only approximated by tap-stability of the field's screen position. Pinch, drag and rotate behaviour is not asserted. The camera parts that are not implemented (Atlas 1.3.1) must be reported honestly.
- **Production Pages URL:** this harness runs the real WASM through the Vite `wasm_demo` runtime, the same as CI. The published https://moritzbrantner.github.io/my-farm/ must be checked manually after merge and deployment: New Farm → select the non-default Resident → Harvest → ripe field → watch the deposit.
- **#212 interaction:** `onboarding.spec.ts` plants on `plot-1` and asserts exact Silo totals (`Silo 10 of 40`, Wheat 6 at start). If the ripe starting crop occupies `plot-1`, or the starting stock changes, those expectations need **independent re-verification** before any edit. Implementation agents must not rewrite them.
