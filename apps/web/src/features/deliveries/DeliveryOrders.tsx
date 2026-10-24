import { type Ref } from "react";
import { type CatalogDocument, type FarmView } from "@my-farm/contracts";
import { Metric } from "../hud/TopBar";
import { resourceItem } from "../inventory/resourceItem";
import { ResourceAmount } from "../inventory/ResourceAmount";
import { type SendCommand } from "../runtime/farmCommandRunner";

export function Orders({
  catalog,
  view,
  send,
  ordersRef,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  send: SendCommand;
  ordersRef: Ref<HTMLElement>;
}) {
  return (
    <section className="panel-section" ref={ordersRef} tabIndex={-1}>
      <h2>Delivery Orders</h2>
      {view.delivery_orders.length === 0 ? <p>Build the delivery board at level 4.</p> : null}
      {view.delivery_orders.map((order) => (
        <div className="order" key={order.id}>
          <div>
            {order.requirements.map((stack) => (
              <ResourceAmount
                key={stack.item_id}
                item={resourceItem(catalog, stack.item_id, stack.quantity)}
                amount={`x${stack.quantity}`}
              />
            ))}
          </div>
          <strong className="order__reward">
            <Metric type="coins" label={`${order.reward_coins} coins`} />
            <Metric type="xp" label={`${order.reward_xp} XP`} />
          </strong>
          <button
            type="button"
            onClick={() => send({ type: "fulfill_delivery_order", order_id: order.id })}
          >
            Fulfill
          </button>
        </div>
      ))}
    </section>
  );
}
