# Autonomous Wait Steps

Product authority: [Decision Atlas 3.2.1 and 3.2.4](../decisions/atlas.md) (#271).
This builds on the Step requirements in ADR 0026.

When a concrete-chain Harvest or Oven collection is admitted at readiness, the
Resident used to idle until the crop had grown or the bake had finished. The task
now starts with an explicit `AutonomousWait { phase }` Step instead
(`CropGrowth { crop_id }` or `OvenBake { job_id, recipe_id }`). That Step covers
the gap from the Resident's previous commitment to the next Resident Step. It
declares no Resident or Tool requirement. It does claim the Field Plot or Oven.
Time still advances only through direct elapsed simulation. The wait completes
on Farm time once its phase has begun, and readiness stays gated at the
Harvest/Collect Step as before. Dependency slides stretch the wait, so the
Resident still arrives for its next Step no earlier than the producer is ready.
They do not shift the wait's start.

Newly admitted work uses a wait fit-only, whether it comes from a manual command
or a chain job. The same planner re-plans the work's base Steps from the Resident's
state at the start of the wait. The result must hand the Resident back holding the
same items and Tools it started with. It must also finish, including the re-routed
walk to the waiting task's next Step, before that Step's accepted end. The work is
then queued ahead of the waiting task, and the wait shrinks to fit. Both the
dependency and Tool calendars must converge without making any accepted Resident
Step later. If any check fails, the work queues after, as before. When an earlier
task runs long, the overrun eats into the following wait first, before it moves
that task's Resident Steps.

A committed chain job's own cleanup, such as its Silo or Barn Deposit Step, is
part of the accepted work. Later admissions no longer strip it and merge it into
their own deposits.

The read model reports `requires_resident` on each Step view, a `waiting`
Resident state and a `waiting` head queue state. The web Resident Details show
these as "Waiting (free for other work)" and "Resident free Ns". Waits are saved
as ordinary Steps, so save/reload needs no new ledger. Reorder drops wait Steps
together with the other derived resource Steps.
