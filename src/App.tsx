import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import type { Session, User } from "../shared/types";
import Avatar from "./components/Avatar";
import Items from "./pages/Items";
import List from "./pages/List";
import LocationOrder from "./pages/LocationOrder";
import Login from "./pages/Login";
import Stores from "./pages/Stores";
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
          <Route path="/" element={<List />} />
          <Route path="/list" element={<Navigate to="/" replace />} />
          <Route path="/items" element={<Items user={user} />} />
          <Route path="/stores" element={<Stores />} />
          <Route path="/stores/:id/locations" element={<LocationOrder />} />
          <Route path="/users" element={<Users />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {/* Pinned to the bottom so it stays reachable however long the page gets. */}
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end>
          <span aria-hidden>📝</span>
          List
        </NavLink>
        <NavLink to="/items">
          <span aria-hidden>🛒</span>
          Items
        </NavLink>
        <NavLink to="/stores">
          <span aria-hidden>🏪</span>
          Stores
        </NavLink>
        <NavLink to="/users">
          <span aria-hidden>👥</span>
          Users
        </NavLink>
      </nav>
    </>
  );
}
