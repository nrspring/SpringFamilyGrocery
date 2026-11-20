import type { Item, Store, User } from "../shared/types";

/** An error response from the API, keeping the status and JSON body for callers that need them. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** How long to wait for the server. Uploads (photos) get longer, since a phone's upload link can be slow. */
const TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Without a limit, a request that never answers (a phone going through a tunnel, a dead Wi-Fi
  // login page) leaves the screen waiting forever. Give up and say so instead.
  const controller = new AbortController();
  const limit = init?.body instanceof FormData ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS;
  const timer = window.setTimeout(() => controller.abort(), limit);
  try {
    const res = await fetch(path, { ...init, signal: controller.signal });
    if (res.status === 401) window.dispatchEvent(new Event("unauthorized"));
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      let body: Record<string, unknown> = {};
      try {
        body = (await res.json()) as Record<string, unknown>;
        if (typeof body.error === "string") message = body.error;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(message, res.status, body);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  } catch (e) {
    if (controller.signal.aborted) throw new Error("That took too long. Check your connection and try again.");
    // fetch itself failed (no connection at all) rather than the server answering with an error.
    if (e instanceof TypeError) throw new Error("Couldn't reach the server. Check your connection and try again.");
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface UserInput {
  name?: string;
  color?: string;
  active?: boolean;
  /** A new headshot. Omit to keep the current one. */
  photo?: Blob | null;
}

function toForm(input: UserInput) {
  const form = new FormData();
  if (input.name !== undefined) form.set("name", input.name);
  if (input.color !== undefined) form.set("color", input.color);
  if (input.active !== undefined) form.set("active", String(input.active));
  if (input.photo) form.set("photo", input.photo, "headshot.jpg");
  return form;
}

export interface ItemInput {
  name?: string;
  description?: string;
  /** Replaces the whole list of acceptable alternatives. Omit to keep it. */
  alternativeIds?: string[];
  /** Replaces where the item can be found, store by store. Omit to keep it. */
  stores?: { storeId: string; location: string }[];
  /** A new photo. Omit to keep the current one. */
  photo?: Blob | null;
}

function toItemForm(input: ItemInput) {
  const form = new FormData();
  if (input.name !== undefined) form.set("name", input.name);
  if (input.description !== undefined) form.set("description", input.description);
  if (input.alternativeIds !== undefined) form.set("alternatives", JSON.stringify(input.alternativeIds));
  if (input.stores !== undefined) form.set("stores", JSON.stringify(input.stores));
  if (input.photo) form.set("photo", input.photo, "item.jpg");
  return form;
}

export interface StoreInput {
  name?: string;
  /** Decimal degrees, or null to clear. Send both or neither. */
  latitude?: number | null;
  longitude?: number | null;
  /** A new photo. Omit to keep the current one. */
  photo?: Blob | null;
}

function toStoreForm(input: StoreInput) {
  const form = new FormData();
  if (input.name !== undefined) form.set("name", input.name);
  if (input.latitude !== undefined) form.set("latitude", input.latitude === null ? "" : String(input.latitude));
  if (input.longitude !== undefined) form.set("longitude", input.longitude === null ? "" : String(input.longitude));
  if (input.photo) form.set("photo", input.photo, "store.jpg");
  return form;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  listStores: () => request<Store[]>("/api/stores"),

  getStore: (id: string) => request<Store>(`/api/stores/${id}`),

  /** Adds a place in the store (at the end of its order). Returns the updated store. */
  addLocation: (storeId: string, name: string) =>
    request<Store>(`/api/stores/${storeId}/locations`, jsonInit("POST", { name })),

  /** Sets the order of the store's locations, first to last. Returns the updated store. */
  orderLocations: (storeId: string, order: string[]) =>
    request<Store>(`/api/stores/${storeId}/locations`, jsonInit("PUT", { order })),

  /** Removes a location nothing uses; a 409 ApiError if items are still there. */
  deleteLocation: (storeId: string, locationId: string) =>
    request<Store>(`/api/stores/${storeId}/locations/${locationId}`, { method: "DELETE" }),

  createStore: (input: StoreInput) =>
    request<Store>("/api/stores", { method: "POST", body: toStoreForm(input) }),

  updateStore: (id: string, input: StoreInput) =>
    request<Store>(`/api/stores/${id}`, { method: "PATCH", body: toStoreForm(input) }),

  /** Without `force`, fails with a 409 ApiError (body.items) if items are located in the store. */
  deleteStore: (id: string, force = false) =>
    request<void>(`/api/stores/${id}${force ? "?force=true" : ""}`, { method: "DELETE" }),

  /** Puts the item on the shared shopping list (as the person this device chose). */
  addToList: (itemId: string) => request<Item>(`/api/list/${itemId}`, { method: "PUT" }),

  removeFromList: (itemId: string) => request<Item>(`/api/list/${itemId}`, { method: "DELETE" }),
  /** Sets the optional quantity note on a listed item; blank clears it. */
  setListQuantity: (itemId: string, quantity: string) =>
    request<Item>(`/api/list/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity }),
    }),

  listItems: () => request<Item[]>("/api/items"),

  /** Sets where the item is in one store (adding it there if needed) and leaves its other stores alone. */
  setItemLocation: (itemId: string, storeId: string, location: string) =>
    request<Item>(`/api/items/${itemId}/stores/${storeId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location }),
    }),

  createItem: (input: ItemInput) =>
    request<Item>("/api/items", { method: "POST", body: toItemForm(input) }),

  updateItem: (id: string, input: ItemInput) =>
    request<Item>(`/api/items/${id}`, { method: "PATCH", body: toItemForm(input) }),

  /** Without `force`, fails with a 409 ApiError (body.usedBy) if other items list it as an alternative. */
  deleteItem: (id: string, force = false) =>
    request<void>(`/api/items/${id}${force ? "?force=true" : ""}`, { method: "DELETE" }),

  listUsers: () => request<User[]>("/api/users"),

  /** Remembers on this device who is using it. */
  chooseUser: (userId: string) =>
    request<User>("/api/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    }),

  createUser: (input: UserInput) =>
    request<User>("/api/users", { method: "POST", body: toForm(input) }),

  updateUser: (id: string, input: UserInput) =>
    request<User>(`/api/users/${id}`, { method: "PATCH", body: toForm(input) }),
};
