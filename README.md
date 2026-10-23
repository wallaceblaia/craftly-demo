# Craftly

Order handmade goods from local makers. Built in three weekends with an AI coding assistant, then remediated with an
ArchGenerator remediation kit (wave 1, 58 findings).

> ⚠️ **Demo repository.** Craftly is a fictional app used in illustrative ArchGenerator video scenarios. Its first commits
> are an intentionally insecure "vibe-coded MVP" (with fake keys that never worked). **Do not deploy it.**

## Run

```
cp .env.example .env   # fill in every value
npm install
npm start              # needs Node 22.5+
npm test               # security regression tests
```

## What the remediation changed

- Every query is parameterized; orders, profiles and admin routes check who is asking.
- Tokens are signed, verified (HS256 only) and expire; passwords use salted scrypt; the login is rate limited.
- No secret lives in the code: they come from the environment, and the app refuses to start without them.
- The catalog import only reaches allowed https hosts; the database backup and the free file reader are gone.
- Dependencies upgraded (Express 5, jsonwebtoken 9, multer 2); the native sqlite3 driver (and its vulnerable tar chain)
  replaced by Node's built-in SQLite; body-parser, lodash and node-fetch removed.
- The single 270-line server file split into modules, with regression tests for each attack.
