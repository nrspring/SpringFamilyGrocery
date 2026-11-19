export interface User {
  /** Permanent unique identifier (UUID). Safe to store as a foreign key. */
  id: string;
  name: string;
  /** Hex color such as "#1e88e5". */
  color: string;
  photoUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  /** Permanent unique identifier (UUID). Safe to store as a foreign key. */
  id: string;
  name: string;
  description: string;
  photoUrl: string | null;
  /** The family member who added it; null if the person who did is unknown. */
  addedBy: { id: string; name: string; color: string; photoUrl: string | null } | null;
  active: boolean;
  /** Ids of items that are acceptable substitutes for this one. */
  alternativeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  authenticated: boolean;
  /** Who this device said they are, or null if not chosen yet (or they were disabled). */
  user: User | null;
}
