import { useCallback, useEffect, useState } from "react";
import type { User } from "../../shared/types";
import { api } from "../api";
import Avatar from "../components/Avatar";
import UserForm from "../components/UserForm";
import { COLORS } from "../colors";

export default function Users() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api.listUsers());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(user: User) {
    setBusyId(user.id);
    setError("");
    try {
      await api.updateUser(user.id, { active: !user.active });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  // Suggest a color nobody active is using yet.
  const used = new Set(users?.filter((u) => u.active).map((u) => u.color));
  const defaultColor = COLORS.find((c) => !used.has(c)) ?? COLORS[(users?.length ?? 0) % COLORS.length];

  return (
    <section>
      <div className="section-head">
        <h1>Users</h1>
        <button type="button" onClick={() => setEditing("new")}>
          Add user
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {users === null && !error && <p className="muted">Loading…</p>}
      {users?.length === 0 && <p className="muted">No users yet. Add the first one!</p>}

      <ul className="user-list">
        {users?.map((u) => (
          <li key={u.id} className={`user-row${u.active ? "" : " disabled"}`}>
            <Avatar name={u.name} color={u.color} photoUrl={u.photoUrl} />
            <div className="user-info">
              <strong>{u.name}</strong>
              {!u.active && <span className="badge">Disabled</span>}
            </div>
            <button type="button" className="secondary small" onClick={() => setEditing(u)}>
              Edit
            </button>
            <button
              type="button"
              className="secondary small"
              disabled={busyId === u.id}
              onClick={() => toggleActive(u)}
            >
              {u.active ? "Disable" : "Enable"}
            </button>
          </li>
        ))}
      </ul>

      {editing && (
        <UserForm
          // Remount per user so form state never leaks between edits.
          key={editing === "new" ? "new" : editing.id}
          user={editing === "new" ? undefined : editing}
          defaultColor={defaultColor}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </section>
  );
}
