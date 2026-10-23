# ABAPro

Multi-tenant ABA therapy management foundation. Clinical modules other than organization setup are not implemented yet.

## Stack

- Web: Vue 3, TypeScript, Vite, Vue Router, Pinia
- API: NestJS, versioned REST under `/api/v1`
- Shared contracts: `@abapro/shared`
- Database: PostgreSQL. Local development uses an embedded PostgreSQL database when `DATABASE_URL` is not set. Production requires `DATABASE_URL`.
- Authentication: OpenID Connect authorization code with PKCE. The API keeps a server-side session in an httpOnly cookie. It does not issue its own access tokens or store passwords.

In development, the API can run an embedded identity provider. That provider is refused when `NODE_ENV=production`. Production must set `OIDC_ISSUER` to an HTTPS identity provider, plus a client id, client secret, and `COOKIE_SECRET`.

## Run

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3001/api/v1/health
- Development identity provider: http://127.0.0.1:3002

Create an identity from the sign-in page, then complete organization setup. Invitation and password-reset links are written to the development mailbox at http://127.0.0.1:3002/identity/outbox. That mailbox is not available in production.

Dashboard figures are synthetic and labeled as such.

## Checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
