import type { User } from "../../shared/types";

export default function Home({ user }: { user: User | null }) {
  return (
    <div className="card center">
      <div className="emoji" aria-hidden>
        🚧
      </div>
      <h1>{user ? `Hi, ${user.name}!` : "Under construction"}</h1>
      {user && <p className="subtitle">Under construction</p>}
      <p className="muted">
        We are building a better way to coordinate the family groceries. Check back soon!
      </p>
    </div>
  );
}
