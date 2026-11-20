# House Groceries

Family grocery coordination site. Live at **https://groceries.thespringfamily.com**.

- **Frontend:** React + Vite (`src/`)
- **API:** Cloudflare Worker (`worker/index.ts`), served from the same domain under `/api`
- **Login:** one shared family password (`APP_PASSWORD` secret) that sets an HttpOnly 30-day session cookie, signed with a separate `SESSION_SECRET`

After login the app opens on the shared shopping **List**, with **Items**, **Stores** and **Users** screens alongside it.

## Users

Family members live in the D1 `users` table. Each has a name, a color, an optional headshot (R2), and an
`active` flag. Users can be added, edited and **disabled, never deleted** (the API has no DELETE route and a
database trigger blocks it). The `id` is a UUID generated once at creation and never changes, so other tables
can safely reference it.

## Items

Things the family buys, in the D1 `items` table: name, description, an optional photo (R2, shared image route
with users), and who added it. Unlike users, items have no `active` flag and **can be deleted** (`DELETE /api/items/:id`,
which also removes the photo). If other items list it as an acceptable alternative the API answers `409` with
those items until the call is repeated with `?force=true`, and the screen shows that as a warning first. The
person who added an item is whoever the device chose in "Who are you?", so adding needs a chosen user.

Acceptable alternatives live in `item_alternatives` and are **directional**: if Milk lists Oat milk, Oat milk
is an acceptable substitute for Milk, but Milk is not automatically one for Oat milk. The API takes them as a
JSON array of item ids in the `alternatives` form field and replaces the whole list.

## Stores

Places the family shops, in the D1 `stores` table: name, an optional photo (R2, same image route), and a
latitude/longitude pair. The pair is optional so a store can be added first and pinned down later, but it is
always both or neither. In the store's Add/Edit sheet, **Record my current location** asks the browser for a GPS
fix (high accuracy, never a cached one) and fills in the two fields with the accuracy it got; press Save to keep
it. The browser only offers location on HTTPS (or localhost) and the person has to allow it. Stores can be
deleted from the Edit sheet; if items are located there the API answers `409` with them until the call is
repeated with `?force=true`, and their locations in that store go with it (the items stay).

An item can be sold at **several stores, each with its own location** ("Aisle 12", "Back wall by the dairy"),
kept in `item_stores`. The item's Edit sheet has a "Where to find it" section: tick a store, then type where it
is. The API takes it as a JSON array of `{ storeId, location }` in the `stores` form field and replaces the whole
list; `GET /api/items` returns it as `stores` (with each store's name). Locations show on the Items screen.

**Locations within a store** are real, ordered things: the `store_locations` table (name and position per
store, names unique ignoring case). `GET /api/stores` returns each store's `locations` in walking order with how
many items use each. An item's location is still the text in `item_stores.location`, but the server keeps it equal
to one of those names: saving an item with a new name adds it to the end of the store's order, and a name that
matches an existing one ignoring case is stored in the saved spelling. The store's Edit sheet has **Order
locations…**, opening `/stores/:id/locations`, where you put them in the order you walk the store: on a touch
screen press and hold anywhere on a row (about a quarter of a second; moving first just scrolls) and drag it,
with the other rows and their numbers shifting live as you go; with a mouse drag the ⠿ handle; or use the ▲ ▼
buttons. The page scrolls when you drag toward an edge, and is held still under your finger while a row is lifted. Every change shows instantly and is saved in the background (the newest order wins), so a slow
connection never leaves the buttons dead; **Sort A–Z** orders them naturally ("Aisle 2" before "Aisle 10"), and a location can be
added, or removed once nothing uses it. The API is `POST /api/stores/:id/locations` (`{ name }`),
`PUT /api/stores/:id/locations` (`{ order: [names] }`; any name left out keeps its place after the listed ones)
and `DELETE /api/stores/:id/locations/:locationId` (`409` while items use it). Wherever you type a location
(the item's Edit sheet, the long-press popup) it is a combo box: a text box with the store's existing locations
as tap buttons beneath, and typing a new name adds it. Migration `0007` carried over every location already in
use.

On the **List** screen, a "Shopping at" picker chooses the store (not remembered: the List always opens with none chosen). The 📍
button next to it checks the phone's GPS and selects the closest store that has a recorded location, if it is
within a quarter mile; otherwise it leaves the choice alone and says how far the nearest one is. The distance
is worked out in the browser (the position never goes to the server). With no store chosen, no locations are
shown. Once one is chosen, each item shows that store's location ("Not set for…" if it hasn't been placed
there) and the list is **sorted in that store's walking order** (items with no location there last, ties by
name). **Press and hold** an item (right-click on a desktop): with no store chosen it shows just the item's
picture, big; with a store chosen it opens the photo and a box to edit the location in that store. That uses
`PUT /api/items/:itemId/stores/:storeId` with `{ "location": "Aisle 12" }` (adds the item to the store if
needed), which changes one store without touching the item's others. (`DELETE` on the same path unlinks an item
from a store; the app doesn't use it, since the item's Edit sheet handles that.)

## List

One **shared** shopping list for the whole household (the `list_entries` table: one row per item, with who
starred it and when). Tap anywhere on an item on the Items page (except its Edit button) to put it on the list,
and again to take it off; selected items get a ★ and a gold outline. Items are deleted from inside the Edit
sheet. The **List** page shows
everything starred and lets anyone remove an item. Each item from `GET /api/items` carries `list`
(`{ addedBy, addedAt }` or `null`), and `PUT` / `DELETE /api/list/:itemId` add and remove (both are harmless to
repeat). Adding needs a chosen user, like adding an item. Deleting an item also takes it off the list.

## Who are you?

After the family password, a device that doesn't know who is using it shows a "Who are you?" picker of active
users. The choice is stored in a signed `sfg_user` cookie (1 year), separate from the 30-day login, so a phone
keeps its person across re-logins. If the chosen user is later disabled, the device asks again. Signing out
forgets the choice. `GET /api/session` returns `{ authenticated, user }`, and `POST /api/me` sets the user.

## Local development

```bash
npm install
npm run db:migrate:local   # first time, and after adding migrations
npm run dev                # http://localhost:5173
```

The local password and cookie secret live in `.dev.vars` (git-ignored): `APP_PASSWORD=grocery-dev` and a throwaway `SESSION_SECRET`.

## First-time Cloudflare setup

```bash
npx wrangler login
npx wrangler d1 create spring-family-grocery-db     # paste the database_id into wrangler.jsonc
npx wrangler r2 bucket create spring-family-grocery-photos
npm run db:migrate:remote
npx wrangler secret put APP_PASSWORD     # prompts for the real family password
npx wrangler secret put SESSION_SECRET   # paste a long random string (see below)
npm run deploy
```

The custom domain route in `wrangler.jsonc` requires `thespringfamily.com` to be a zone in the same Cloudflare account.

## Deploying changes

```bash
npm run deploy
```

Generate a `SESSION_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Changing `APP_PASSWORD` does not sign anyone out; rotating `SESSION_SECRET` does.
