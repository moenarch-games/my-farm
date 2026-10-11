# First-crop Silo deposit observation (#212 / PR #213)

Independent acceptance baseline: origin/main `e844cc6` and the existing PR #213
implementation `900f6b5`, before this repair's production changes. Authority:
owner-approved first-crop guidance scope #212/#132, authoritative Resident Inventory
and task execution in ADRs 0008/0014/0015/0016. Shared convention sourceRevision:
`46d8793bb3034326561f876dcc67dbaa5aa1e432`.

## Observable outcome

Guidance can say a harvested crop reached the Silo only after a successful physical
Silo Deposit Step. That fact survives later use, sale, client snapshot coalescing and
save/reload. Acceptance/queueing, harvesting into carry, tool return, an absent task,
a larger global inventory or a stripped cleanup plan do not prove deposit.
Existing FarmView has no rigorous historical observation: harvested events describe
carry, deposit emits no persistent observation, and completed queue steps disappear.
No full event log, client-derived gameplay state or fabricated reconstruction of old
save history is acceptable.

## Bounded additive observation contract

`FarmState.resident_harvest_cargo` records only currently carried, not yet consumed
harvest-origin units: per Resident, positive `{task_id, crop_id, quantity}` entries.
An actual successful HarvestCrop Step creates attribution using the original task
identity and actual accepted yield. Entries merge where applicable; their per-crop
sum never exceeds actual carried stock and positive entry count is bounded by
Resident item capacity. No dropped queue, planned future yield or market/storage
pickup creates attribution. Cleanup stripping and replanning preserve existing
physical cargo attribution.

Every successful carried withdrawal consumes harvest attribution first in a stable
order, alongside the existing physical transfer. This is a narrow attribution rule
for fungible carried units, not a change to item balances, costs, production yields,
XP, reservations, timing, command acceptance or FIFO. Failed withdrawals leave both
stock and attribution unchanged. Planting, production input, feeding and Farm Shop
transfers consume attribution without creating a Silo receipt.

`FarmState.resident_last_harvest_deposit` retains at most one successful deposit
receipt per Resident: `{task_id, crop_id, completed_at_ms}`. Only actual harvested
units removed by a successful DepositItems Step to the Silo establish it. The receipt
uses the ORIGINAL harvest task identity even if a later task/idle cleanup performs
the deposit. Completion time is the authoritative actual completed Step time, not
the client's polling time. A later real harvest deposit may replace the last receipt;
spending previously deposited output and ordinary nonharvest transfers cannot erase
or replace it. Replayed elapsed time produces no duplicate observation.

FarmView projects the receipt map only; internal cargo is not a client authority.
Both persisted fields are serde-default additive fields: old saves load with unknown,
empty history, without a schema reset or invented earlier completion. Saved positive
cargo and saved receipts round-trip; explicit New Farm/reset starts empty. Existing
blocked-work precedence in guidance remains required even when a historical receipt
exists. These observations do not implement #171/#172/#200 production Goal accounting
or introduce goal XP/reward semantics.

## Executable independent evidence

`cargo test -p my_farm_core --test harvest_deposit_observation` covers:

- Real harvest is not credited before the actual Silo deadline; deposit receipt
  survives five later planting inputs that reduce stored Wheat below its earlier
  preharvest quantity. The FarmView receipt remains authoritative.
- Queue cleanup stripping followed by direct reuse of both harvested Wheat units
  creates no receipt, even after a later market purchase increases Silo inventory.
- Reusing one unit leaves one actual harvested unit: its later physical cleanup
  deposit credits the ORIGINAL harvest task, never the replacement planting task.
- A stale/edited saved Deposit Step asks for three units against actual carry of
  two. Actual execution blocks, deposits nothing and preserves pending attribution.
- Reload while carrying actual harvested output preserves its provenance and permits
  a later real deposit. Reload after deposit preserves the receipt.
- A legacy save with ordinary carried Wheat and no observation fields can perform
  real cleanup without inventing harvest history. Market purchase/storage pickup
  also creates no harvest attribution or receipt.
- Actual harvested output transferred to the Farm Shop consumes origin but is not
  a Silo deposit milestone.
- Large versus stepwise elapsed time yields identical Farm/receipt state; applying
  the same time again is a no-op, with bounded cargo throughout.

Fixtures supply a ready starter Wheat crop or an explicitly legacy saved carried
stack; all harvest, consumption and deposit outcomes come from the actual public
core command/elapsed interfaces. The failed-deposit fixture edits an execution plan,
not its outcome. Exact stock expectations derive from unchanged baseline Wheat6,
Wheat yield2 and Wheat planting input1. No fake outcome or client stock threshold
is substituted for completion.

Initial baseline is compile-red: the bounded observation fields do not yet exist.
Consequently none of these new postconditions has a passing runtime claim before
production. Existing protected core, save/migration, generated contracts and real
production-browser guidance acceptance remain required after implementation. This
contract supplements the coordinator's independently authored coalesced-snapshot
browser regression; it does not replace that actual user journey.
