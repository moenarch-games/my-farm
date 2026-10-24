import { ResourceIcon } from "../../components/ResourceIcon";
import { availableRecipes, itemName, recipeName, secondsRemaining } from "@my-farm/game-model/selectors";
import { farmhouseOvenDisabledReason } from "@my-farm/game-model/structureMenu";
import { reservedAnimalReason, reservedFieldReason, reservedMachineReason, reservedOvenReason } from "@my-farm/game-model/residentTasks";
import { type AnimalShelterState, type CatalogDocument, type FarmView, type FieldPlot, type ItemStack, type MachineState } from "@my-farm/contracts";
import { resourceItem } from "../inventory/resourceItem";
import { type SendCommand } from "../runtime/farmCommandRunner";

export function FarmhouseActions({
  catalog,
  view,
  nowMs,
  send,
  onEnterHouseInterior,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  send: SendCommand;
  onEnterHouseInterior: () => void;
}) {
  const oven = catalog.farmhouse_upgrades.find((upgrade) => upgrade.kind === "oven");
  const reason = farmhouseOvenDisabledReason(catalog, view);
  const ovenOwned = view.owned_farmhouse_upgrades.includes("oven");
  const first = view.oven.queue[0];
  const remaining = first ? secondsRemaining(first.ready_at_ms, nowMs) : 0;
  const queueLimit = oven?.queue_limit ?? 2;
  const queueFull = view.oven.queue.length >= queueLimit;
  const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  const reservedReason = reservedOvenReason(view);
  return (
    <div className="action-stack">
      <p>Farmhouse</p>
      <button type="button" onClick={onEnterHouseInterior}>
        Enter Farmhouse
      </button>
      {!oven ? (
        <p>Oven upgrade unavailable</p>
      ) : ovenOwned ? (
        <>
          <p>Oven - queue {view.oven.queue.length}/{queueLimit}</p>
          {first ? (
            <button
              type="button"
              disabled={remaining > 0 || Boolean(reservedReason)}
              title={reservedReason ?? undefined}
              onClick={() => send({ type: "collect_oven_job" })}
            >
              Collect {recipeName(catalog, first.recipe_id)} {remaining > 0 ? `(${remaining}s)` : ""}
            </button>
          ) : null}
          <div className="recipe-list">
            {catalog.recipes
              .filter((recipe) => recipe.target.type === "oven" && recipe.unlock_level <= view.level)
              .map((recipe) => {
                const missingInputs = missingRecipeInputs(recipe.inputs, inventory);
                const canQueue = !reservedReason && !queueFull && missingInputs.length === 0;
                const disabledReason = queueFull
                  ? "Queue full"
                  : reservedReason ?? missingInputs.map((stack) => `Need ${stack.quantity} ${itemName(catalog, stack.item_id)}`).join(", ");
                return (
                  <div className="recipe-card" data-testid={`recipe-card-${recipe.id}`} key={recipe.id}>
                    <div className="recipe-card__header">
                      <strong>{recipe.name}</strong>
                      <button
                        type="button"
                        disabled={!canQueue}
                        aria-label={`Make ${recipe.name}`}
                        title={canQueue ? `Make ${recipe.name}` : disabledReason}
                        onClick={() => send({ type: "queue_oven_recipe", recipe_id: recipe.id })}
                      >
                        Make
                      </button>
                    </div>
                    <div className="recipe-card__inputs" aria-label={`${recipe.name} required resources`}>
                      {recipe.inputs.map((stack) => {
                        const available = inventory.get(stack.item_id) ?? 0;
                        const missing = Math.max(0, stack.quantity - available);
                        return (
                          <RecipeInputAmount
                            key={stack.item_id}
                            catalog={catalog}
                            stack={stack}
                            available={available}
                            missing={missing}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
          {reservedReason ? <small>{reservedReason}</small> : null}
        </>
      ) : (
        <>
          <p>Oven upgrade - {oven.cost_coins} coins, queue {oven.queue_limit}</p>
          <button
            type="button"
            disabled={Boolean(reason)}
            title={reason ?? "Buy Oven"}
            onClick={() => send({ type: "buy_farmhouse_upgrade", upgrade_kind: "oven" })}
          >
            Buy Oven
          </button>
          {reason ? <small>{reason}</small> : null}
        </>
      )}
    </div>
  );
}

export function StorageStatus({
  label,
  used,
  capacity,
  unit,
}: {
  label: string;
  used: number;
  capacity: number;
  unit: string;
}) {
  return (
    <div className="action-stack">
      <p>{label} storage - {used}/{capacity} {unit}</p>
    </div>
  );
}

export function StorageUpgradeStatus({
  catalog,
  view,
  storageKind,
  label,
  used,
  capacity,
  tier,
  unit,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  storageKind: "silo" | "barn";
  label: string;
  used: number;
  capacity: number;
  tier: number;
  unit: string;
  send: SendCommand;
}) {
  const tiers = catalog.storage_upgrades.filter((upgrade) => upgrade.storage_kind === storageKind);
  const maxTier = tiers.reduce((max, upgrade) => Math.max(max, upgrade.tier), 0);
  const next = tiers.find((upgrade) => upgrade.tier === tier + 1);
  const nextCapacity = next ? Math.max(capacity, next.capacity) : null;
  const lockedReason = next && view.level < next.unlock_level ? `Unlocks at level ${next.unlock_level}` : null;
  const coinsReason = next && view.coins < next.cost_coins ? `Need ${next.cost_coins - view.coins} coins` : null;
  const reason = !next ? "Fully upgraded" : lockedReason ?? coinsReason;
  return (
    <div className="action-stack">
      <p>{label} storage - {used}/{capacity} {unit}</p>
      <p>Tier {tier}/{maxTier}</p>
      {next ? (
        <p>Next upgrade - {next.cost_coins} coins, capacity {capacity} -&gt; {nextCapacity}</p>
      ) : (
        <p>Fully upgraded</p>
      )}
      <button
        type="button"
        disabled={Boolean(reason)}
        title={reason ?? `Upgrade ${label}`}
        onClick={() => send({ type: "upgrade_storage", storage_kind: storageKind })}
      >
        Upgrade {label}
      </button>
      {reason ? <small>{reason}</small> : null}
    </div>
  );
}

export function PlotActions({
  catalog,
  view,
  plot,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  plot: FieldPlot;
  nowMs: number;
  send: SendCommand;
}) {
  const reservedReason = reservedFieldReason(view, plot.id);
  if (plot.crop) {
    const remaining = secondsRemaining(plot.crop.ready_at_ms, nowMs);
    return (
      <div className="action-stack">
        <p>{itemName(catalog, plot.crop.item_id)} - {remaining === 0 ? "ready" : `${remaining}s`}</p>
        <button
          type="button"
          disabled={remaining > 0 || Boolean(reservedReason)}
          title={reservedReason ?? undefined}
          onClick={() => send({ type: "harvest_crop", plot_id: plot.id })}
        >
          Harvest
        </button>
        {reservedReason ? <small>{reservedReason}</small> : null}
      </div>
    );
  }
  const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  return (
    <div className="action-grid">
      {catalog.crops
        .filter((crop) => crop.unlock_level <= view.level)
        .map((crop) => (
          <button
            type="button"
            key={crop.item_id}
            disabled={Boolean(reservedReason) || (inventory.get(crop.item_id) ?? 0) < 1}
            title={reservedReason ?? undefined}
            onClick={() => send({ type: "plant_crop", plot_id: plot.id, crop_id: crop.item_id })}
          >
            Plant {itemName(catalog, crop.item_id)}
          </button>
        ))}
      {reservedReason ? <small>{reservedReason}</small> : null}
    </div>
  );
}

export function MachineActions({
  catalog,
  view,
  machine,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  machine: MachineState;
  nowMs: number;
  send: SendCommand;
}) {
  const first = machine.queue[0];
  const remaining = first ? secondsRemaining(first.ready_at_ms, nowMs) : 0;
  const queueLimit =
    catalog.machines.find((entry) => entry.kind === machine.kind)?.queue_limit ?? 2;
  const queueFull = machine.queue.length >= queueLimit;
  const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  const reservedReason = reservedMachineReason(view, machine.id);
  return (
    <div className="action-stack">
      <p>Feed Mill - queue {machine.queue.length}/{queueLimit}</p>
      {first ? (
        <button
          type="button"
          disabled={remaining > 0 || Boolean(reservedReason)}
          title={reservedReason ?? undefined}
          onClick={() => send({ type: "collect_machine_job", machine_id: machine.id })}
        >
          Collect {recipeName(catalog, first.recipe_id)} {remaining > 0 ? `(${remaining}s)` : ""}
        </button>
      ) : null}
      <div className="recipe-list">
        {availableRecipes(catalog, machine, view.level).map((recipe) => {
          const missingInputs = missingRecipeInputs(recipe.inputs, inventory);
          const canQueue = !reservedReason && !queueFull && missingInputs.length === 0;
          const disabledReason = queueFull
            ? "Queue full"
            : reservedReason ?? missingInputs.map((stack) => `Need ${stack.quantity} ${itemName(catalog, stack.item_id)}`).join(", ");
          return (
            <div className="recipe-card" data-testid={`recipe-card-${recipe.id}`} key={recipe.id}>
              <div className="recipe-card__header">
                <strong>{recipe.name}</strong>
                <button
                  type="button"
                  disabled={!canQueue}
                  aria-label={`Make ${recipe.name}`}
                  title={canQueue ? `Make ${recipe.name}` : disabledReason}
                  onClick={() => send({ type: "queue_recipe", machine_id: machine.id, recipe_id: recipe.id })}
                >
                  Make
                </button>
              </div>
              <div className="recipe-card__inputs" aria-label={`${recipe.name} required resources`}>
                {recipe.inputs.map((stack) => {
                  const available = inventory.get(stack.item_id) ?? 0;
                  const missing = Math.max(0, stack.quantity - available);
                  return (
                    <RecipeInputAmount
                      key={stack.item_id}
                      catalog={catalog}
                      stack={stack}
                      available={available}
                      missing={missing}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {reservedReason ? <small>{reservedReason}</small> : null}
    </div>
  );
}

export function RecipeInputAmount({
  catalog,
  stack,
  available,
  missing,
}: {
  catalog: CatalogDocument;
  stack: ItemStack;
  available: number;
  missing: number;
}) {
  const requiredItem = resourceItem(catalog, stack.item_id, stack.quantity);
  return (
    <span className={missing > 0 ? "recipe-input recipe-input--missing" : "recipe-input"}>
      <ResourceIcon type="item" itemId={stack.item_id} itemKind={requiredItem.kind} />
      <span className="recipe-input__name">{requiredItem.name}</span>
      <strong>{available}/{stack.quantity}</strong>
      {missing > 0 ? <em>Need {missing}</em> : null}
    </span>
  );
}

function missingRecipeInputs(inputs: ItemStack[], inventory: Map<string, number>): ItemStack[] {
  return inputs
    .map((stack) => ({
      item_id: stack.item_id,
      quantity: Math.max(0, stack.quantity - (inventory.get(stack.item_id) ?? 0)),
    }))
    .filter((stack) => stack.quantity > 0);
}

export function ShelterActions({
  catalog,
  view,
  shelter,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  shelter: AnimalShelterState;
  nowMs: number;
  send: SendCommand;
}) {
  const label = shelter.kind === "chicken_coop" ? "Chicken Coop" : "Cow Pasture";
  return (
    <div className="action-stack">
      <p>{label}</p>
      {shelter.animals.map((animal, index) => {
        const reservedReason = reservedAnimalReason(view, shelter.id, animal.id);
        if (animal.state.type === "idle") {
          return (
            <span className="animal-action" key={animal.id}>
              <button
                type="button"
                disabled={Boolean(reservedReason)}
                title={reservedReason ?? undefined}
                onClick={() =>
                  send({ type: "feed_animal", shelter_id: shelter.id, animal_slot: animal.id })
                }
              >
                Feed animal {index + 1}
              </button>
              {reservedReason ? <small>{reservedReason}</small> : null}
            </span>
          );
        }
        if (animal.state.type === "ready") {
          return (
            <span className="animal-action" key={animal.id}>
              <button
                type="button"
                disabled={Boolean(reservedReason)}
                title={reservedReason ?? undefined}
                onClick={() =>
                  send({
                    type: "collect_animal_product",
                    shelter_id: shelter.id,
                    animal_slot: animal.id,
                  })
                }
              >
                Collect animal {index + 1}
              </button>
              {reservedReason ? <small>{reservedReason}</small> : null}
            </span>
          );
        }
        return (
          <span key={animal.id}>
            Animal {index + 1}: {secondsRemaining(animal.state.ready_at_ms, nowMs)}s
          </span>
        );
      })}
      <small>{catalog.shelters.find((entry) => entry.kind === shelter.kind)?.animal_name}</small>
    </div>
  );
}
