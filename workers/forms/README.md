# Pixel Wisdom Forms Worker

Cloudflare Worker endpoint for Pixel Wisdom form submissions.

## Endpoints

- `GET /api/forms/health`
- `POST /api/forms/submit`

The Worker accepts `application/json`, `application/x-www-form-urlencoded`, and `multipart/form-data` payloads. It validates `name`, `email`, and `message`, ignores honeypot submissions, and sends the submission server-side.

## Delivery

The preferred deployment uses Cloudflare Email Routing via the `FORM_EMAIL` send binding in `wrangler.toml`.

Fallbacks are also supported:

- `RESEND_API_KEY` secret for Resend delivery.
- `FORWARD_WEBHOOK_URL` secret for webhook delivery.
- `DRY_RUN=true` for local testing only.

## Local Checks

```sh
node --check workers/forms/src/index.js
node --check workers/forms/deploy.mjs
node workers/forms/test.mjs
```

## Deployment

When Grantlet Cloudflare access is authorized, deploy the Worker to:

```txt
pixelwisdom.ca/api/forms/*
www.pixelwisdom.ca/api/forms/*
```

With Wrangler, the equivalent commands are:

```sh
npx wrangler deploy --config workers/forms/wrangler.toml
```

If using Resend instead of Cloudflare Email Routing:

```sh
npx wrangler secret put RESEND_API_KEY --config workers/forms/wrangler.toml
```

This repo also includes a direct API deploy script. Grantlet can provision a narrow Cloudflare token into `.env.cloudflare-forms`, then deploy with:

```sh
node workers/forms/deploy.mjs
```
