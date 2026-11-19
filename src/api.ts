import type { Item, User } from "../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 401) window.dispatchEvent(new Event("unauthorized"));
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
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
  active?: boolean;
  /** Replaces the whole list of acceptable alternatives. Omit to keep it. */
  alternativeIds?: string[];
  /** A new photo. Omit to keep the current one. */
  photo?: Blob | null;
}

function toItemForm(input: ItemInput) {
  const form = new FormData();
  if (input.name !== undefined) form.set("name", input.name);
  if (input.description !== undefined) form.set("description", input.description);
  if (input.active !== undefined) form.set("active", String(input.active));
  if (input.alternativeIds !== undefined) form.set("alternatives", JSON.stringify(input.alternativeIds));
  if (input.photo) form.set("photo", input.photo, "item.jpg");
  return form;
}

export const api = {
  listItems: () => request<Item[]>("/api/items"),

  createItem: (input: ItemInput) =>
    request<Item>("/api/items", { method: "POST", body: toItemForm(input) }),

  updateItem: (id: string, input: ItemInput) =>
    request<Item>(`/api/items/${id}`, { method: "PATCH", body: toItemForm(input) }),

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
