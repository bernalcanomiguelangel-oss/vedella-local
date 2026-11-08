"use client";

/**
 * Users & permissions UI (FEAT-006 §3.10). Platform-only front-end over the
 * FEAT-001 create-user / assign-role / assign-farm server actions. The temporary
 * password is entered by the operator and submitted to the audited server
 * action, which hashes it and sets mustChangePassword=true. The password is
 * never logged or echoed back. Role/farm changes go through the same actions,
 * which enforce "new accounts never auto-admin" and the unique User.farmId.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUser, assignRole, assignFarm } from "@/lib/admin/users-actions";

interface UserView {
  id: string;
  email: string;
  name: string | null;
  role: string;
  farmName: string | null;
  mustChangePassword: boolean;
}

const ROLES = ["customer", "farm_manager", "platform_admin"];

export function UsersPanel({
  users,
  farms,
}: {
  users: UserView[];
  farms: { id: string; name: string; hasManager: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // New-user form.
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("customer");
  const [farmId, setFarmId] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const availableFarms = farms.filter((f) => !f.hasManager);

  function create() {
    setMsg(null);
    startTransition(async () => {
      const res = await createUser({
        email,
        name: name || undefined,
        role,
        farmId: role === "farm_manager" ? farmId || null : null,
        temporaryPassword,
      });
      setMsg(res.ok ? "Usuari creat (contrasenya temporal)." : res.message ?? "Error");
      if (res.ok) {
        setEmail("");
        setName("");
        setRole("customer");
        setFarmId("");
        setTemporaryPassword("");
      }
      router.refresh();
    });
  }

  function changeRole(userId: string, nextRole: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await assignRole(userId, nextRole);
      setMsg(res.ok ? "Rol actualitzat." : res.message ?? "Error");
      router.refresh();
    });
  }

  function linkFarm(userId: string, nextFarmId: string) {
    if (!nextFarmId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await assignFarm(userId, nextFarmId);
      setMsg(res.ok ? "Granja vinculada." : res.message ?? "Error");
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      <section
        className="rounded-2xl border border-bark-200 bg-white p-4"
        data-testid="user-form"
      >
        <h2 className="font-display text-lg font-bold text-bark-900">Nou usuari</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-semibold text-bark-600">
            Correu
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-bark-600">
            Nom
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-bark-600">
            Rol
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {role === "farm_manager" && (
            <label className="text-xs font-semibold text-bark-600">
              Granja
              <select
                value={farmId}
                onChange={(e) => setFarmId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
              >
                <option value="">— tria una granja lliure —</option>
                {availableFarms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs font-semibold text-bark-600">
            Contrasenya temporal
            <input
              type="password"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-bark-500">
          L&apos;usuari haurà de canviar la contrasenya al primer accés. No es
          desa ni es mostra mai en text pla.
        </p>
        <button
          type="button"
          onClick={create}
          disabled={pending}
          data-testid="user-create"
          className="mt-3 rounded-full bg-bark-700 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-bark-800 disabled:opacity-50"
        >
          {pending ? "Creant…" : "Crea usuari"}
        </button>
        {msg && <p className="mt-2 text-sm text-olive-700" data-testid="user-msg">{msg}</p>}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-bold text-bark-900">
          Usuaris ({users.length})
        </h2>
        <div className="overflow-hidden rounded-2xl ring-1 ring-bark-100">
          <table className="w-full text-sm" data-testid="user-table">
            <thead className="bg-bark-100 text-left text-bark-700">
              <tr>
                <th className="px-4 py-2">Correu</th>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Granja</th>
                <th className="px-4 py-2">Canvi pendent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bark-100 bg-cream-50">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-medium">{u.email}</td>
                  <td className="px-4 py-2 text-bark-600">{u.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      disabled={pending}
                      className="rounded border border-bark-200 px-1 py-0.5 text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-bark-600">
                    {u.role === "farm_manager" ? (
                      u.farmName ? (
                        u.farmName
                      ) : (
                        <select
                          defaultValue=""
                          onChange={(e) => linkFarm(u.id, e.target.value)}
                          disabled={pending}
                          className="rounded border border-bark-200 px-1 py-0.5 text-xs"
                        >
                          <option value="">— vincula —</option>
                          {availableFarms.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {u.mustChangePassword ? (
                      <span className="text-amber-700">sí</span>
                    ) : (
                      <span className="text-bark-400">no</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
