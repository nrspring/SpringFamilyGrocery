import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import type { Session, User } from "../shared/types";
import Avatar from "./components/Avatar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Users from "./pages/Users";
import WhoAreYou from "./pages/WhoAreYou";

type Status = "loading" | "signed-out" | "signed-in";

export default function App() {
  const [status, setStatus] = useState<Status>("loading");
  // Which family member this device is. Null until they pick one.
  const [user, setUser] = useState<User | null>(null);
  // Lets someone skip the picker to add themselves as a user first.
  const [skippedPicker, setSkippedPicker] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((s: Session) => {
        setUser(s.user);
        setStatus(s.authenticated ? "signed-in" : "signed-out");
      })
      .catch(() => setStatus("signed-out"));

    // Any API call that comes back 401 means the session expired.
    const onUnauthorized = () => setStatus("signed-out");
    window.addEventListener("unauthorized", onUnauthorized);
    return () => window.removeEventListener("unauthorized", onUnauthorized);
  }, []);

  async function loadSession() {
    const s: Session = await fetch("/api/session").then((r) => r.json());
    setUser(s.user);
    setStatus(s.authenticated ? "signed-in" : "signed-out");
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setUser(null);
    setSkippedPicker(false);
    setSwitching(false);
    setStatus("signed-out");
  }

  if (status === "loading") return <main className="page" />;
  // After the password, a device that doesn't know who's using it asks.
  if (status === "signed-out") return <Login onSuccess={loadSession} />;

  if (switching || (!user && !skippedPicker)) {
    return (
      <WhoAreYou
        onChosen={(u) => {
          setUser(u);
          setSwitching(false);
        }}
        onManage={() => {
          setSkippedPicker(true);
          setSwitching(false);
        }}
        onCancel={user || skippedPicker ? () => setSwitching(false) : undefined}
      />
    );
  }

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
        <button
          type="button"
          className="who"
          onClick={() => setSwitching(true)}
          aria-label={user ? `Signed in as ${user.name}. Switch user` : "Choose who you are"}
        >
          {user ? (
            <>
              <Avatar name={user.name} color={user.color} photoUrl={user.photoUrl} size={28} />
              <span>{user.name}</span>
            </>
          ) : (
            <span>Choose user</span>
          )}
        </button>
        <button type="button" className="secondary small" onClick={logout}>
          Sign out
        </button>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/users" element={<Users />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
