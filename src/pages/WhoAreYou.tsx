import { useEffect, useState } from "react";
import type { User } from "../../shared/types";
import { api } from "../api";
import Avatar from "../components/Avatar";

interface Props {
  onChosen: (user: User) => void;
  /** Continue without picking, to add or manage users. */
  onManage: () => void;
  /** Present when switching from an existing identity; lets the person back out. */
  onCancel?: () => void;
}

export default function WhoAreYou({ onChosen, onManage, onCancel }: Props) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listUsers()
      .then((all) => setUsers(all.filter((u) => u.active)))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function choose(user: User) {
    setBusyId(user.id);
    setError("");
    try {
      onChosen(await api.chooseUser(user.id));
    } catch (e) {
      setError((e as Error).message);
      setBusyId(null);
    }
  }

  return (
    <main className="page">
      <div className="card picker">
        <h1>Who are you?</h1>
        <p className="muted">Tap your name. This device will remember you.</p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {users === null && !error && <p className="muted">Loading…</p>}
        {users?.length === 0 && <p className="muted">No users yet. Add the first one!</p>}

        <div className="tiles">
          {users?.map((u) => (
            <button
              key={u.id}
              type="button"
              className="tile"
              disabled={busyId !== null}
              onClick={() => choose(u)}
            >
              <Avatar name={u.name} color={u.color} photoUrl={u.photoUrl} size={72} />
              <span>{u.name}</span>
            </button>
          ))}
        </div>

        <button type="button" className="link" onClick={onManage}>
          Not listed? Add or manage users
        </button>
        {onCancel && (
          <button type="button" className="link" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </main>
  );
}
