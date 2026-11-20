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

/** Just enough of a user to show who they are. */
export interface UserRef {
  id: string;
  name: string;
  color: string;
  photoUrl: string | null;
}

/** A named place inside a store, e.g. "Aisle 12". */
export interface StoreLocation {
  id: string;
  name: string;
  /** How many items are placed here. */
  itemCount: number;
}

export interface Store {
  /** Permanent unique identifier (UUID). Safe to store as a foreign key. */
  id: string;
  name: string;
  /** Decimal degrees; null until the store's location has been recorded. */
  latitude: number | null;
  longitude: number | null;
  photoUrl: string | null;
  /** How many items are stocked here. */
  itemCount: number;
  /** The places in the store, in the order you walk it. */
  locations: StoreLocation[];
  createdAt: string;
  updatedAt: string;
}

/** Where one item can be found in one store. */
export interface ItemStore {
  storeId: string;
  storeName: string;
  /** Free text such as "Aisle 12"; may be empty. */
  location: string;
}

export interface Item {
  /** Permanent unique identifier (UUID). Safe to store as a foreign key. */
  id: string;
  name: string;
  description: string;
  photoUrl: string | null;
  /** The family member who added it; null if the person who did is unknown. */
  addedBy: UserRef | null;
  /** Set when the item is on the shared shopping list; null when it isn't. */
  list: { addedBy: UserRef | null; addedAt: string } | null;
  /** Ids of items that are acceptable substitutes for this one. */
  alternativeIds: string[];
  /** The stores that sell it, with where to find it in each, sorted by store name. */
  stores: ItemStore[];
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  authenticated: boolean;
  /** Who this device said they are, or null if not chosen yet (or they were disabled). */
  user: User | null;
}
