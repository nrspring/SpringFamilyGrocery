# House Groceries

Family grocery coordination site. Live at **https://groceries.thespringfamily.com**.

- **Frontend:** React + Vite (`src/`)
- **API:** Cloudflare Worker (`worker/index.ts`), served from the same domain under `/api`
- **Login:** one shared family password (`APP_PASSWORD` secret) that sets an HttpOnly 30-day session cookie, signed with a separate `SESSION_SECRET`

Currently a login, an "under construction" home page, and **Items** and **Users** screens.

## Users

Family members live in the D1 `users` table. Each has a name, a color, an optional headshot (R2), and an
`active` flag. Users can be added, edited and **disabled, never deleted** (the API has no DELETE route and a
database trigger blocks it). The `id` is a UUID generated once at creation and never changes, so other tables
can safely reference it.

## Items

Things the family buys, in the D1 `items` table: name, description, an optional photo (R2, shared image route
with users), who added it, and an `active` flag. Like users, items are **disabled, never deleted**. The person
who added an item is whoever the device chose in "Who are you?", so adding needs a chosen user.

Acceptable alternatives live in `item_alternatives` and are **directional**: if Milk lists Oat milk, Oat milk
is an acceptable substitute for Milk, but Milk is not automatically one for Oat milk. The API takes them as a
JSON array of item ids in the `alternatives` form field and replaces the whole list.

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
