import { requirePage } from "@/lib/auth";
import { listApprovedRequests, listOrders, listSuppliers } from "@/lib/queries";
import { can } from "@/lib/roles";
import { fmtDate } from "@/lib/format";
import { parseCompanyFilter } from "@/lib/companies";
import { Amount, AmountVat, CompanyTag, Empty, PageHeader, Panel, StatusTag, Tag } from "@/components/ui";
import { CompanyFilterBar } from "@/components/CompanyFilter";
import { CreateOrderRow, ReceiveGoodsForm } from "@/components/actions";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requirePage("/orders");
  const { company } = await searchParams;
  const companyFilter = parseCompanyFilter(company);
  const [approved, orders, suppliers] = await Promise.all([
    listApprovedRequests(companyFilter),
    listOrders(companyFilter),
    listSuppliers(),
  ]);
  const canOrder = can(user.role, "order.create");
  const canReceive = can(user.role, "goods.receive");

  return (
    <>
      <PageHeader
        title="Orders and deliveries"
        subtitle="Procurement turns approved requests into purchase orders and records what actually arrives. A project can move to the other company here if it needs to."
      />

      <div className="mb-4">
        <CompanyFilterBar current={companyFilter} basePath="/orders" />
      </div>

      <div className="space-y-4">
        <Panel title="Approved requests waiting for a purchase order" flush={approved.length === 0}>
          {approved.length === 0 ? (
            <Empty title="Nothing waiting">Approved requests show up here so a purchase order can be created.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {approved.map((r) => (
                <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-medium">{r.item}</span>
                      <span className="num ml-3 text-[13px] text-mute">
                        {r.ref}, {r.category}, requested by {r.requester}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CompanyTag company={r.company} />
                      <span className="num text-[14px] text-mute">
                        {r.quantity} units, estimate <Amount value={r.estimated_cost} className="text-ink" /> excl. VAT
                      </span>
                    </div>
                  </div>
                  {canOrder ? (
                    <CreateOrderRow
                      requestId={r.id}
                      quantity={r.quantity}
                      estimatedUnit={Math.round((r.estimated_cost / r.quantity) * 100) / 100}
                      requestCompany={r.company}
                      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, status: s.status }))}
                    />
                  ) : (
                    <p className="text-[14px] text-mute">Waiting for Procurement to choose a supplier.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Purchase orders" flush>
          {orders.length === 0 ? (
            <Empty title="No purchase orders yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Purchase order</th>
                    <th>Company</th>
                    <th>Supplier</th>
                    <th className="r">Unit price</th>
                    <th className="r">Total</th>
                    <th>Delivered</th>
                    <th>Status</th>
                    {canReceive && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <div className="font-medium">{o.item}</div>
                        <div className="num text-[13px] text-mute">
                          {o.ref}, {fmtDate(o.created_at)}
                        </div>
                      </td>
                      <td>
                        <CompanyTag company={o.company} />
                        {o.company !== o.request_company && <div className="mt-1 text-[12px] text-mid">Moved from {o.request_company === "small_civils" ? "Small Civils" : "VZ Coatings"}</div>}
                      </td>
                      <td>
                        {o.supplier}
                        {o.supplier_status === "pending" && (
                          <span className="ml-2">
                            <Tag tone="mid">Not verified</Tag>
                          </span>
                        )}
                      </td>
                      <td className="r">
                        <Amount value={o.unit_price} />
                      </td>
                      <td className="r">
                        <AmountVat value={o.total} />
                      </td>
                      <td className="num">
                        {o.received} of {o.quantity}
                      </td>
                      <td>
                        <StatusTag status={o.status} />
                      </td>
                      {canReceive && (
                        <td className="r">{o.received < o.quantity ? <ReceiveGoodsForm poId={o.id} remaining={o.quantity - o.received} /> : null}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
