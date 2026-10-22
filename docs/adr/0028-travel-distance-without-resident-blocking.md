# Travel Distance Without Resident Blocking

This is the third slice of #172 (#272). It builds on ADR 0012 (authoritative walk
paths), ADR 0026 (Step requirements) and ADR 0027 (autonomous waits).

Walking is Farm time. Every Resident Step snapshots its walk path and stores
`walk_duration_ms` (750 ms per walked Tile) beside `work_duration_ms`. Planning,
admission and the elapsed executor all use these durations, so a Farm layout with
shorter routes finishes the same work earlier. Time still advances only through
`apply_elapsed`.

Residents never block one another. `find_walk_path` and `is_walkable_tile` read
only the Farm grid, Farmhouse and Structure footprints. They never read Resident
locations or other Residents' queued paths. Crossing Residents therefore cannot
create waiting, deadlock or path invalidation. Shared scarcity comes only from the
Step requirements in ADR 0026: Tools, through the custody calendar from ADR 0023,
and exclusive work targets.

Structures still block. Walk paths go around footprints, Structure work uses an
approach Tile outside the footprint, and queued paths still keep new Structures
off the route (ADR 0012).

The contract is `crates/my_farm_core/tests/travel_distance.rs`. #138 should keep
these travel-distance comparisons when it evaluates layouts.
