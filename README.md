# BIOSYM Pharma — E-commerce Platform

Premium, production-grade pharmaceutical e-commerce platform for **BIOSYM Pharma Private Limited** (Node.js + Express + SQLite).

## Quick start

```bash
npm install
npm run seed          # creates the database + catalog + admin user (idempotent)
npm start             # http://localhost:3000
```

> Requires Node **22.5+** (uses the built-in `node:sqlite` module — no native builds).

### Seeded admin account
- Email: `admin@biosym.pharma`
- Password: `Admin@123`

## OTP provider (real, backend-verified)

Configure via `.env` (copy from `.env.example`). Allowed providers:

| Provider  | Notes |
|-----------|-------|
| `console` | Local dev only. Generates a real random OTP, prints it to the server console. Never use in production. |
| `msg91`   | **Production default.** OTP requested & verified via MSG91's API (`MSG91_API_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`). The code is never stored locally. |
| `twilio`  | Twilio Verify API (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`). |

Security model (enforced in `src/services/otp/index.js`):
- OTP is generated/verified on the backend only — never on the client.
- Secure random 6-digit code; hashed with HMAC-SHA256 before storage (self-generated providers).
- Expiry (default 5 min), request rate-limiting (3 per 15-min window), resend cooldown (30 s), max 5 verification attempts.
- Invalidated (consumed) after successful verification; never stored in plain text.

## Email (Resend)

`RESEND_API_KEY` + `EMAIL_FROM` enable email OTP and auth emails via Resend's REST API. Keys never ship to the browser. If unset, email OTP falls back to a console print with a warning.

## Payments

- **Cash on Delivery** works out of the box (fully real — order recorded, payment due).
- **Razorpay** online payments activate automatically when `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are set. Order creation, checkout and server-side signature verification are implemented. Without keys the option is hidden — no fake buttons.

## Project layout

```
server.js              entry point
src/
  app.js               express app assembly
  config/env.js        env config      ·   config/db.js  sqlite wrapper
  db/schema.sql        schema          ·   db/seed.js    seed catalog + admin
  services/otp/        provider abstraction (console/msg91/twilio) + rate limits
  services/email.js    Resend
  services/auth.js     register/login/OTP/reset logic
  services/img.js      generated SVG product/category artwork
  middleware/          auth guards, validation, error handler
  routes/              auth, catalog, cart, wishlist, orders, account, admin, pages
public/                CSS design system + vanilla JS modules
views/                 EJS pages (auth, shop, product, cart, checkout, account, admin)
```

## Auth flows

- **Password login** — email/mobile + bcrypt-hashed password, account lockout after 5 failures (15 min).
- **OTP login** — mobile/email → send OTP → 6-box verification (auto-advance, backspace, paste, countdown, resend, max-attempt lockout) → JWT session.
- **Registration** — full name, email, mobile, password (strength meter), optional DOB/gender.
- **Forgot password** — OTP → one-time reset token (10 min, DB-backed) → new password.

## Verifying a real OTP locally

1. Start with `OTP_PROVIDER=console`.
2. Request an OTP — it is printed in the server console in a boxed `[DEV] OTP generated` block.
3. Enter that code in the UI; verification is still performed against the HMAC hash on the backend.

## Tests

```bash
npm test   # smoke test hitting /health + catalog API
```
