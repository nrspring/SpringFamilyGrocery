import { useEffect, useState, type FormEvent } from "react";

type Status = "loading" | "signed-out" | "signed-in";

export default function App() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((s: { authenticated: boolean }) =>
        setStatus(s.authenticated ? "signed-in" : "signed-out"),
      )
      .catch(() => setStatus("signed-out"));
  }, []);

  if (status === "loading") return <main className="page" />;
  if (status === "signed-out") return <Login onSuccess={() => setStatus("signed-in")} />;
  return <UnderConstruction onLogout={() => setStatus("signed-out")} />;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) return onSuccess();
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not sign in");
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <form className="card" onSubmit={submit}>
        <div className="emoji" aria-hidden>
          🛒
        </div>
        <h1>House Groceries</h1>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

function UnderConstruction({ onLogout }: { onLogout: () => void }) {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    onLogout();
  }

  return (
    <main className="page">
      <div className="card">
        <div className="emoji" aria-hidden>
          🚧
        </div>
        <h1>Under construction</h1>
        <p className="muted">
          We are building a better way to coordinate the family groceries. Check back soon!
        </p>
        <button type="button" className="secondary" onClick={logout}>
          Sign out
        </button>
      </div>
    </main>
  );
}
