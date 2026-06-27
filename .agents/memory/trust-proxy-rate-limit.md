---
name: Trust proxy + rate limiter
description: express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR unless trust proxy is set before rate limiter in Replit.
---

The rule: `app.set("trust proxy", 1)` must appear **before** any `express-rate-limit` middleware is registered.

**Why:** Replit's reverse proxy sets the `X-Forwarded-For` header on every request. express-rate-limit validates that the header is expected (i.e., Express's trust proxy setting is not false). If the setting is missing, the middleware throws a ValidationError on every request.

**How to apply:** In `app.ts`, immediately after `const app = express()`, before Helmet/CORS/rate-limiter:
```ts
app.set("trust proxy", 1);
```
