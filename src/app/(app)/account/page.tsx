import { requirePage } from "@/lib/auth";
import { ROLE_LABEL, canChangeOwnPassword } from "@/lib/roles";
import { PageHeader, Panel } from "@/components/ui";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default async function AccountPage() {
  const user = await requirePage("/account");
  const rows: [string, string][] = [
    ["Name", user.name],
    ["Email", user.email],
    ["Phone", user.phone ?? "Not set"],
    ["Role", ROLE_LABEL[user.role]],
    ["Department", user.department],
  ];
  return (
    <>
      <PageHeader title="My account" subtitle="Your details and your password." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Your details">
          <dl className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-mute">{k}</dt>
                <dd className="min-w-0 break-words font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Password">
          {canChangeOwnPassword(user.role) ? (
            <ChangePasswordForm />
          ) : (
            <p className="text-mute">
              Passwords for the {ROLE_LABEL[user.role]} role are managed by the Manager. If you need a new one, contact the Manager and they will reset it for you.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
