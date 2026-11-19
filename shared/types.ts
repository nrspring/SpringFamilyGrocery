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
