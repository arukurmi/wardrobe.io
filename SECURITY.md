# Security Policy

## Reporting a vulnerability

If you find a security issue, please **do not open a public issue**. Instead,
email the maintainer at <arukurmi22@gmail.com> with a description, reproduction
steps, and impact. You'll get an acknowledgement, and a fix or mitigation will
follow as fast as is reasonable for a personal project.

## Threat model

wardrobe.io is a **single-user, localhost-only** tool. By design there is no
account system, no multi-tenancy, and no remote authentication: the server
binds to `127.0.0.1` and your photos and data never leave your machine. The
expected deployment is one person running the API and UI on their own laptop.

Given that model, the API is intentionally open on localhost — this is a
convenience, not a bug. The security surface that matters here is mostly
supply-chain hygiene (dependencies) and what happens if you deliberately
expose the port beyond localhost (e.g. through an SSH tunnel or reverse proxy).

## Optional bearer-token gate (`WARDROBE_TOKEN`)

For the case where you *do* expose the port beyond localhost, the API ships an
**opt-in** bearer-token gate. It is **off by default**, so the normal localhost
experience is unchanged.

Enable it by setting an environment variable before starting the server:

```bash
WARDROBE_TOKEN="$(openssl rand -hex 32)" npm run dev   # in ./server
```

When `WARDROBE_TOKEN` is set, every `/api/*` request **and** every `/data/*`
image request must send:

```
Authorization: Bearer <token>
```

- The gate covers **both** the JSON API (`/api`) and the served image files
  (`/data`), so enabling it protects your photos, not just metadata.
- The token is compared in constant time: both sides are hashed to a
  fixed-length SHA-256 digest and compared with `node:crypto` `timingSafeEqual`,
  so neither the value nor the length of a guessed token leaks via timing.
- Missing or incorrect tokens receive `401 { "error": "unauthorized" }`.
- `GET /api/health` stays reachable without a token so liveness probes work.
- Leave `WARDROBE_TOKEN` unset (or empty) to disable the gate entirely.

## `WARDROBE_HSTS`

The token gate does not add transport security. If you terminate TLS in front
of the app and want browsers to remember to use HTTPS, front the app with a
reverse proxy that sets `Strict-Transport-Security` (HSTS). There is no
built-in HTTPS listener; treat any exposure beyond localhost as something you
secure at the proxy layer.

## Dependencies

- Versions are pinned exactly (`save-exact=true` in `.npmrc`).
- Dependabot proposes weekly npm updates for `/server` and `/client`.
- CI runs `npm audit --audit-level=high` on every push and pull request.
- A few majors are intentionally held back for Node 20.12 compatibility
  (vitest v3, vite v6, archiver v7) — see `CLAUDE.md`.
