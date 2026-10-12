# Explicit Wheat-to-Bread commitment acceptance (#225)

Independent protected contract authored on default `c5d31ae` before production.
Current Atlas3.1.2/3.1.3/3.2.1/3.2.2/3.3.2 and #225 control outcomes. This is
concrete chain admission, not #200's automatic Produce-N planner, goal credit,
XP/history/UI or full171/172/134 completion. Shared convention stack resolves
29 files, diagnostics[], sourceRevision46d8793bb3034326561f876dcc67dbaa5aa1e432;
this exact stack was previously read and retained. Local AGENTS/CLAUDE/domain
and current Atlas/ADRs control authority.

## Proposed public seam and independent translation

The existing public FarmCommand/application boundary receives an explicit chain
identity, concrete local job IDs, Resident assignments, target/recipe identities,
ordered dependency edges and ingredient source/quantity bindings. Proposed JSON
`admit_concrete_chain`/job/source spellings are routine API proposals approved
before authoring, not a mandated format or algorithm. External committed producers
may be identified through immutable chain/local-job mapping or actual authoritative
IDs; packing may be translated independently before the producer changes behavior.
The core derives executable steps, catalogue quantities, paths, timing and scarce
resource claims. A caller cannot inject executable outcomes, stock, trusted resource
claims or a second executor. Existing manual producers retain current semantics
and share authoritative planning/admission; sampling or UI is not involved.

Two real manual characterizations run independently: existing real harvest→projected
Oven start with zero stored Wheat, and later manual ready collection→physical Barn.
Normal recipe requires3 Wheat and produces1 Bread; each real Wheat harvest produces2,
from the frozen actual catalogue. Fixtures establish work using real public commands
and time. Oven setup has explicit consistent XP4/level2 and a real purchase; capacity
fault inputs change only a declared saved capacity. No output/executor injection.

## Protected observables

- Stored and backed cross-Resident inputs admit a complete physical Barn chain;
  future collection is committed before readiness without a later manual Collect.
  New planting/growth/harvest jobs may belong to the same concrete atomic request.
- Producer quantities have real immutable origins and cannot be double-consumed
  by another chain; duplicate IDs, cycles, dangling/overclaimed bindings fail
  atomically. Caller identity reuse cannot create duplicate work.
- Full intermediate Silo/final Barn claims exist at admission; last-stage capacity
  failure leaves all queues/jobs/IDs/stock/coins unchanged, and a second independent
  consumer cannot consume reserved capacity. No automatic purchases.
- Prior accepted task identity/order/timing remains intact. Baking is autonomous:
  the loading Resident can perform real unrelated work before Oven readiness;
  collection reacquires the assigned Resident. Scarce Tools remain physically
  conserved through real pickup/return. Existing traversal/no-traffic contracts apply.
- Actual delayed upstream deadlines revise downstream work without phantom Bread,
  ordinary blocked scheduling or stolen commitments. The delay test changes only
  an accepted task deadline via actual save/load; it is not an invented player command.
- Save/reload and split/large elapsed advancement retain exact authority state;
  repeated same-time advancement is idempotent. Ready/carried Bread is not stored.
- Stopping a necessary individual producer cannot silently strand an accepted
  consumer; the existing221 authority may reject usefully with whole state unchanged.
  Same-chain stopping/cleanup requires a supplemental coherent contract before a
  producer adds a new whole-chain cancel intent; do not implement another goal engine.
- Accepted effective recipe inputs/output/duration survive later catalogue changes;
  new requests see changed terms. Representation is flexible, immutable meaning is not.

Shared planner/executor/elapsed/storage/save/catalog authority must remain singular.
Source audit must verify both old manual producers and this new producer reuse it,
resource/producer edges persist in the real saved/read model and no full duplicated
inventory ledger is introduced. Tests do not impose #200 assignment/search optimization.
Current command application advances elapsed time before dispatch: same-time rejection
is whole-state atomic; later-time tests must compare with an independently elapsed
baseline rather than freeze legitimately accepted old work.

## Honest initial baseline and completion

Manual characterization2/2 PASS actual execution. All new chain tests compile and
fail at the real public command deserializer's missing `admit_concrete_chain` variant.
This is one absent-capability signal; all post-admission numerical/storage/interval/
cleanup/catalog assertions remain UNRUN, not separate reproduced production bugs.
The initial fixture compiler borrow error was corrected before numerical baseline,
and is not classified as a product failure. Subsequent independently justified API
translations may occur before implementation without weakening observable contracts.

This initial protected handoff is intentionally not production-ready: supplemental
existing-producer identity/read-model closure, intermediate-phase reload, assigned
resource interval observations and active same-chain cleanup remain to be established
before the producer starts. Existing214 temporal tools, harvest deposit and45 stop
contracts remain unchanged. Full `bun run validate` and applicable server/WASM checks
are required after production because shared planner/elapsed/save mapping is incomplete.
No Pages, unknown-ACK protocol, direct takeover or #200 product acceptance is claimed.


## Supplemental complete seams before implementation

Protected actual phase witnesses now require pre-ready baking, post-ready real
Resident pickup with zero Barn Bread, reload at bake/carry and successful physical
deposit. Active final-collection stop uses existing221 cancellation and real cleanup,
retaining used inputs/output/Tools; necessary-producer stop rejects atomically rather
than stranding its accepted consumer. No new whole-goal cancellation engine is required.
Pickup/return completion events derive a simple independent finite-Tool custody
calendar with return-before-pickup ties and no overlapping single-Sickle occupancy.

The additive authoritative FarmView concrete_chains mapping is keyed by chain ID.
It exposes inspectable local-job→actual task/Oven IDs, Resident assignments, dependency
edges and producer quantity bindings; records must agree with actual Farm commitments
and survive reload without creating inventory. Shape/packing and whether one physical
task can contain multiple job boundaries may be translated independently before the
producer: task ownership must be unambiguous, not mandate a speculative splitting
algorithm. The client-only legacy omission test expects an empty map and identical
other state, with no cast pretending old wire types contain a new field. Current map
is absent, so its public normalization genuinely runtime-REDs at undefined versus{}.
Its compile RED for the absent output property is distinct from the Rust wire gap.
A valid modern map's per-field normalization must preserve authoritative data; source
audit/translation must not insert fabricated chains or default populated values.

Initial12 missing-intent tests plus five supplemental phase/view/old-producer tests
(all17) compile. Every
new Rust assertion still stops at absent admit_concrete_chain; phase/interval/view
outcomes are UNRUN. Characterizations remain independently2PASS. Source-audit
requirements (shared old/new admission/executor and persisted minimal claims/terms)
remain required postimplementation. This protected acceptance is now authored across
all requested minimal boundaries, with routine API/read-model translations pending
independent verification before production and full applicable postimplementation
validation unrun; no product/readiness claim follows from authoring.


Final independent baseline before production: manual2/2 PASS; chain17/17 RED
only at missing public intent (all later outcomes UNRUN); public client2 cases
include omission RED and populated wire-map preservation GREEN. The latter is a
compatibility fixture, not proof of real core admission. Strict focused Rust
Clippy and workspace formatting PASS. Real pre-existing SweepHarvest task IDs
and their actual Wheat output quantities back a new consumer without changing
accepted producer queues; bindings use a routine proposed committed_task_output
source spelling. This complements existing manual projected-input support rather
than claiming that current core cannot project future harvests at all.

Reproduction:

```sh
cargo test -p my_farm_core --test explicit_chain_characterization
cargo test -p my_farm_core --test explicit_chain_admission
cargo clippy -p my_farm_core --test explicit_chain_characterization --test explicit_chain_admission -- -D warnings
bun test packages/game-client/src/legacyConcreteChains.acceptance.test.ts
```

Before closure, independently translate any routine API/read-model names against
real public types without dropping obligations, execute all post-admission cases,
inspect authority reuse and minimal persistent binding/terms representation, and
run the documented full repository gate. Source-side current pending recipe IDs
alone do not snapshot terms; no test-first claim about future implementation or
ready product follows from this contract. Closes only225 after actual verification;
parents171/172/134/200 remain open.


## Retrospective initial-custody oracle translation

After the first producer WIP, the interval oracle's four-remaining-event assumption
was disproven by actual public admission: zero-duration initial Woman PickupTools
already executed at the Farmhouse; Woman holds Sickle1 and her remaining queue
starts actual harvest, while the full calendar has one pickup/two returns. The
original default c5d31ae engine already calls complete_resident_tasks(now) after
successful command dispatch (engine473); this is not a new delayed-pickup policy.

The independently authored translation initializes custody from every actual
Resident inventory, tracks future pickup/return by Resident, forbids return by a
nonholder and any aggregate custody above1, requires two real initial-or-future
Sickle pickups and two returns, and retains actual end-to-end conservation. No
production scheduling is changed. Current WIP actual translated interval1PASS;
three manual characterizations PASS including a new real public immediate-pickup
witness. The new characterization is authored retrospectively relative to WIP,
not falsely claimed as preceding all implementation. This corrects the test oracle,
not a numerical product defect; original downstream obligations remain intact.


## Independent producer-origin alias regression before next repair

Retrospective relative to current first producer WIP, but authored before its next
functional alias repair: one real HarvestCrop output must have one origin identity
whether addressed by chain/local job or actual Resident/task ID. In a real ripe
fixture with six separately bought stored Wheat, the first chain already claims
both harvest-a Wheat. A second request aliasing that same task for one more Wheat
must reject atomically despite unrelated stock masking aggregate availability.
The other producer's legitimate remainder stays available and is exercised after
rejection; alias rejection must not disable all committed producer inputs.

A real completed first chain leaves one unclaimed harvested Wheat, which is then
actually sold. Three unrelated Wheat are actually bought. Neither its historical
chain/local record nor old actual task ID may assert guaranteed future origin for
that unrelated stock. A fresh ordinary stored binding still succeeds. No permanent
lot/goal/history/inventory ledger is prescribed: a no-longer-demonstrably-queued or
pending physical producer can reject usefully rather than fabricate provenance.

Both actual current-WIP regression tests RED at accepted invalid requests, not at
missing API or unrelated locked input. Atomic/useful rejection and later legitimate
consumer outcomes remain UNRUN until repair. Logs /tmp/farm225-alias-baseline.log
and /tmp/farm225-history-baseline.log. Original17 numerical protections remain;
new two make19. Start/Collect aliases of one real Oven output require the same
source-identity audit even though this frozen Bread recipe consumes Wheat rather
than invented Bread-consuming catalogue content.


## Independent already-started collector readiness regression

New current-WIP test authored before readiness repair: actual admission and elapsed
execution give the assigned Man the actual OvenMitt while the Oven is Producing
and no Bread exists. Only the real saved Oven ready_at is delayed beyond the
already committed Collect step's former deadline, then the Farm is reloaded.
Former-deadline elapsed must not create carried/stored Bread or remove the
producing job, lose custody or classify ordinary delay as blocked; later actual
ready collection must still physically deposit one Bread. No fake output/task
injection or new time budget. Actual baseline RED at premature carried Bread,
not an unexecuted helper/API check; remaining repair assertions UNRUN. Log:
/tmp/farm225-started-collector-baseline.log. Protected chain total now20.

Mechanical typed fixtures retain all values/assertions: populated chain-map fixture
uses satisfies FarmView[concrete_chains] to preserve the source discriminator;
existing current-view app/legacy-stop fixtures receive empty concrete_chains only.
The intentional old-chain fixture still omits this field. Both client protections
(2chain+4stop) execute6PASS against current WIP; no casts or runtime normalization
hacks were used to fit changed generated types.


## Independent phase/unused-claim/crop/numeric supplement before next repair

Current #225 body explicitly permits current or identified backed future inputs,
requires phase-correct physical reservations and release of only unused claims,
captures accepted new job meaning across catalogue edits, and requires bounded
useful atomic failures. These supplemental expectations add no owner choice,
automatic goal producer, inventory ledger or alternative cancellation controller.
They are authored retrospectively relative to the first producer plus alias/
readiness WIP, before the next functional repair. Frozen HEAD45cfcea with tracked
producer WIP; concrete typesSHA97dfa4532765e30246c0b1c7df057293a5cf560719802eb4841b30bd3c61ae0d;
engine concrete helperSHAe02ae0dde3adab32cf033e9c3d831d5a2986db56e92911eda08128c297adb5a4.

Actual new baseline, not assumed failures:

- Two separately bought current Wheat remain independent of a first chain's
  three future-harvest-backed inputs. A second explicit two-Plant request should
  use them while preserving old queues, but currently rejects as reserved.
- Real elapsed deposits four harvested Wheat while the accepted three-Wheat
  recipe pickup remains pending. Public Sell3 and Discard3 wrongly succeed,
  stealing/destroying actual promised ingredients. They must reject atomically
  while a one-unit unclaimed remainder stays usable. These guard public manual
  mutations, not owner-authorized physical executor pickup.
- Existing stop cancels the unused future Collect then still-pending Bake;
  active producer Tool custody remains intact and no future Wheat is refunded.
  Replacement input bindings to those still-queued real harvests should admit,
  but currently reject from stale unused claims. Prior required-producer rejection
  and safe active final cleanup/used-input preservation tests remain controlling.
- Accepted Plant/Grow/Harvest meaning must survive changes to Wheat duration,
  yield and XP through real reload. Current final XP becomes24 instead of10;
  actual first planted crop ready_at becomes46000 instead of34000 despite the
  same real22000 planting instant. Intermediate growth witness prevents a fake
  final parity achieved by harvesting before the rewritten readiness. New requests
  later must use changed5-unit yields/XP/duration; those late assertions UNRUN
  while old accepted-work parity fails. Existing quantity snapshots alone do not
  prove growth/XP grandfathering.
- Valid public saved numeric faults next_id=u64MAX orMAX-1 currently panic on
  identity increment. A later-time ID fault also panics AFTER real earlier accepted
  task progression; correct rejection must equal independently elapsed baseline,
  not freeze old promises. Near-i64MAX time is already GREEN with useful atomic
  rejection. No wall-time budget or invented save format is asserted.

Complete actual protected chain30 baseline21PASS/9RED; original20 remainGREEN,
new time-boundaryGREEN, nine newly executed failures above. Manual3 and client6
prior protections unchanged. Focused strict Rust Clippy/format/owned whitespace
PASS. No production edits. Post-rejection resource release, legitimate current/
remaining input admission, new-catalog behavior and deep rejection comparisons
remain UNRUN where the first failing assertion prevents them; numerical failures
are distinct from the earlier missing-API baseline. Full repository/WASM gates
still required after the distinct producer repairs and freezes the implementation.

Logs /tmp/farm225-next-complete-baseline.log;
/tmp/farm225-input-phase-current-baseline.log;
/tmp/farm225-input-phase-deposited-baseline.log;
/tmp/farm225-input-discard-baseline.log;
/tmp/farm225-unused-claims-baseline.log;
/tmp/farm225-crop-terms-baseline.log;
/tmp/farm225-grow-ready-baseline.log;
/tmp/farm225-all-bounds-baseline.log;
/tmp/farm225-later-bounds-baseline.log;
/tmp/farm225-next-supplement-clippy.log.
