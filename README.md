# House Groceries

Family grocery coordination site. Live at **https://groceries.thespringfamily.com**.

- **Frontend:** React + Vite (`src/`)
- **API:** Cloudflare Worker (`worker/index.ts`), served from the same domain under `/api`
- **Login:** one shared family password (`APP_PASSWORD` secret) that sets an HttpOnly 30-day session cookie, signed with a separate `SESSION_SECRET`

Currently just a login and an "under construction" page.

## Local development

```bash
npm install
npm run dev     # http://localhost:5173
```

The local password and cookie secret live in `.dev.vars` (git-ignored): `APP_PASSWORD=grocery-dev` and a throwaway `SESSION_SECRET`.

## First-time Cloudflare setup

```bash
npx wrangler login
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
