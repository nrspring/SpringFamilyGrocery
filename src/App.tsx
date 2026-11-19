import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Users from "./pages/Users";

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

    // Any API call that comes back 401 means the session expired.
    const onUnauthorized = () => setStatus("signed-out");
    window.addEventListener("unauthorized", onUnauthorized);
    return () => window.removeEventListener("unauthorized", onUnauthorized);
  }, []);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setStatus("signed-out");
  }

  if (status === "loading") return <main className="page" />;
  if (status === "signed-out") return <Login onSuccess={() => setStatus("signed-in")} />;

  return (
    <>
      <header className="topbar">
        <span className="brand">🛒 House Groceries</span>
        <nav>
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/users">Users</NavLink>
        </nav>
        <button type="button" className="secondary small" onClick={logout}>
          Sign out
        </button>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/users" element={<Users />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
