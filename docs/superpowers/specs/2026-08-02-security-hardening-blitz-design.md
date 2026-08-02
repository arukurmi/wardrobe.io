# Security Hardening Blitz — Design

Date: 2026-08-02

## Context

wardrobe.io is a **single-user, localhost-only** personal wardrobe tracker.
The Express API binds to `127.0.0.1`; all ML runs client-side. There is **no
authentication, no accounts, no sessions**, and no `helmet` / `cors` /
rate-limiting today. The code is already reasonably hardened (multer size/count/
mimetype limits, 512-float embedding check, zip `..` filtering, prepared-
statement SQL only).

This blitz adds **defense-in-depth** and closes real gaps. Commit messages must
be **accurate** — we describe changes as hardening / defense-in-depth, never as
fixing vulnerabilities that do not exist.

## Goals

- ~50 small, individually-verified conventional commits (real work first; the
  number is a target, not a mandate to pad).
- **7 independent PRs**, each on its own branch off `main`, all left **OPEN**.
- Each branch reviewed by a security agent before the PR is opened.
- **No new npm runtime dependencies** (honours the Node 20.12 pin constraints in
  CLAUDE.md; we write small first-party middleware instead of pulling helmet/
  express-rate-limit).
- `cd server && npm test` stays green on every commit (baseline: 45 passing).

## The 7 PRs

1. **security/http-headers** — first-party `securityHeaders` middleware: CSP,
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy`, `Permissions-Policy`, remove `x-powered-by`, opt-in HSTS;
   harden `express.static('/data')` response headers. Unit + supertest.

2. **security/upload-hardening** — make multer `fileFilter` reject with a clear
   error instead of silently dropping; explicit content-length guard; validate
   `original.originalname` extension; tighten the tmp-file cleanup paths;
   defensive re-check of decoded embedding size. Tests.

3. **security/zip-safety** — `portability.ts`: cap extracted entry **count** and
   **total uncompressed bytes** (zip-bomb), reject symlink/absolute/`..` entries
   robustly, validate `dump.json` shape before insert. Tests with a crafted zip.

4. **security/path-traversal** — validate every id/filename used to build an fs
   path (nanoid alphabet allowlist), `path.resolve` + containment assertion
   against `dataDir` in photos/pieces delete paths and the `/data` mount. Tests.

5. **security/input-validation** — `.strict()` + explicit bounds on all remaining
   route schemas (garments, suggestions, settings, misc), id `param` validation
   middleware, per-route JSON body-size caps. Tests.

6. **security/rate-limit-and-timeouts** — first-party in-memory sliding-window
   rate limiter, per-request timeout middleware, request-id + non-leaky error
   handler improvements. Tests.

7. **security/auth-gate-and-supply-chain** — **opt-in** bearer-token gate
   (`WARDROBE_TOKEN` env; open when unset, timing-safe compare when set) on
   `/api`; plus `.npmrc` (save-exact), `SECURITY.md`, dependabot config, and a
   GitHub Actions `npm audit` CI workflow. Tests for the gate.

### File-overlap note

`app.ts` is touched by PRs 1, 6, 7 and `server.ts` by PRs 1, 4. Because all seven
branch independently from `main` and are left open (not stacked, not merged),
development never conflicts; any merge-time conflict is a trivial
middleware-registration line and is the maintainer's choice to resolve.

## Execution

- One git worktree per PR (isolated), `node_modules` shared from the main
  checkout via symlink (deps are identical — no PR adds dependencies).
- A general-purpose implementation agent per PR: TDD where sensible, granular
  conventional commits, `npm test` green before each commit, push branch, open
  PR (left open) with a scope + review summary in the body.
- A security review pass (security-scan agent) per branch; findings applied as
  follow-up commits and summarised in a PR comment.

## Out of scope

- Multi-user accounts / password login (would be an unneeded feature for a
  localhost single-user tool).
- Dependency major-version bumps pinned by CLAUDE.md (vitest v3 / vite v6 /
  archiver v7).
