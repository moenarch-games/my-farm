# Step-Scoped Resource Requirements

This is the first slice of #172 (#270). A Resident Task is already an ordered list
of Steps, each a walk followed by work. Each Step now declares, through
`ResidentTaskStep::requirements()`, which authoritative resources or presence it
needs and which part of the Step each one covers:

- **Resident**: walk and work. The Resident's time is reserved Step by Step, so
  `ResidentTask::step_requirement_windows()` places each Step's Resident window
  directly after the previous one on Farm time.
- **Tool**: work only. The Tool comes from `ResidentTaskStepWork::required_tool()`,
  the single mapping the planner uses to add a checkout. At the Step boundary the
  executor checks that the Resident holds the Tool. If it doesn't, the Step blocks
  with `missing_tools` and does not run without it. Physical custody stays the
  checkout-to-return calendar from ADR 0023.
- **Work target**: work only, and exclusive. That covers a Field Plot, Machine,
  Oven, Animal slot or Farm Shop. `claimed_work_targets()` lists the claims of
  pending Steps. A claim starts at admission and ends at the boundary where its
  Step completes. Every existing "is reserved" check reads it.
- **Structure**: work only, and shared. That covers the Silo, Barn or Tool Source
  for pickup, deposit and return Steps. These Steps never claim an exclusive target.

Requirements are worked out from the saved Step rather than persisted, so they
survive save/reload without a second ledger. Time still advances only through
direct elapsed simulation. No second scheduler or queue is added.

Every current Step needs a Resident. #271 adds autonomous phases that release the
Resident and take one back for later Steps. It does this by declaring Steps without
the Resident requirement, not by adding rules for particular Machines.
