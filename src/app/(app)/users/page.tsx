import { requirePage } from "@/lib/auth";
import { listUsers, CREATABLE_ROLES } from "@/lib/people";
import { DEPARTMENTS } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/roles";
import { fmtDateTime } from "@/lib/format";
import { Empty, PageHeader, Panel, Tag } from "@/components/ui";
import { CreateUserForm, ResetPasswordControl } from "@/components/UsersAdmin";

export default async function UsersPage() {
  const user = await requirePage("/users");
  const isManager = user.role === "manager";
  const users = await listUsers(user);

  return (
    <>
      <PageHeader
        title={isManager ? "Users" : "Manager account"}
        subtitle={
          isManager
            ? "You create every account except employees, who register themselves. You can also reset anyone's password here."
            : "The Manager's password is reset here by the Finance Manager. Nobody else can reset it."
        }
      />
      {isManager && (
        <Panel title="Create a user" subtitle="They sign in with the email and password you set here." className="mb-4">
          <CreateUserForm
            roles={CREATABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            departments={[...DEPARTMENTS]}
          />
        </Panel>
      )}
      <Panel flush>
        {users.length === 0 ? (
          <Empty title="No users" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Contact</th>
                  <th>Department</th>
                  <th>Joined</th>
                  <th>Password</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === user.id;
                  const canReset = isManager ? u.role !== "manager" : u.role === "manager";
                  return (
                    <tr key={u.id}>
                      <td className="font-medium">
                        {u.name}
                        {self && <span className="ml-2 text-[13px] text-mute">(you)</span>}
                      </td>
                      <td>
                        <Tag tone={u.role === "employee" ? "neutral" : "accent"}>{ROLE_LABEL[u.role]}</Tag>
                      </td>
                      <td>
                        <div>{u.email}</div>
                        <div className="text-[13px] text-mute">{u.phone ?? "No phone"}</div>
                      </td>
                      <td>{u.department}</td>
                      <td className="whitespace-nowrap text-mute">{fmtDateTime(u.created_at)}</td>
                      <td>
                        {canReset ? (
                          <ResetPasswordControl userId={u.id} name={u.name} />
                        ) : (
                          <span className="text-[13px] text-mute">{self ? "Change it on My account" : "Reset by the Finance Manager"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
