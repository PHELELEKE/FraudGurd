import { requirePage } from "@/lib/auth";
import { listSuppliers } from "@/lib/queries";
import { can } from "@/lib/roles";
import { fmtDate, maskAccount } from "@/lib/format";
import { PageHeader, Panel, StatusTag } from "@/components/ui";
import { AddSupplierForm, BankChangeForm, VerifyButton } from "@/components/actions";

export default async function SuppliersPage() {
  const user = await requirePage("/suppliers");
  const suppliers = await listSuppliers();
  const canAdd = can(user.role, "supplier.create");
  const canVerify = can(user.role, "supplier.verify");
  const approved = suppliers.filter((s) => s.status === "approved");

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Bank details are the most common target for invoice fraud, so every change is recorded and flagged."
      />
      <div className="space-y-4">
        <Panel title="Supplier list" flush>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th>Bank</th>
                  <th>Account</th>
                  <th>Branch</th>
                  <th>Bank details changed</th>
                  {canVerify && <th></th>}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td>
                      <StatusTag status={s.status} label={s.status === "approved" ? "Verified" : "Not verified"} />
                    </td>
                    <td>
                      <div>{s.bank_name}</div>
                      <div className="text-[13px] text-mute">{s.account_holder}</div>
                    </td>
                    <td className="num">{maskAccount(s.account_number)}</td>
                    <td className="num">{s.branch_code}</td>
                    <td className="num text-mute">{s.bank_changed_at ? fmtDate(s.bank_changed_at) : "Never"}</td>
                    {canVerify && <td className="r">{s.status === "pending" ? <VerifyButton id={s.id} /> : null}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {canAdd && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Add a supplier" subtitle="New suppliers start as not verified until the Finance Manager checks them.">
              <AddSupplierForm />
            </Panel>
            <Panel title="Change bank details" subtitle="Use this when a supplier tells you their account has changed. Confirm it with them first.">
              <BankChangeForm suppliers={approved.map((s) => ({ id: s.id, name: s.name }))} />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
