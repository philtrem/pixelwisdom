# Pixel Wisdom Forms Worker

Cloudflare Worker endpoint for Pixel Wisdom form submissions.

## Endpoints

- `GET /api/forms/health`
- `POST /api/forms/submit`

The Worker accepts `application/json`, `application/x-www-form-urlencoded`, and `multipart/form-data` payloads. It validates `name`, `email`, and `message`, requires a trusted `Origin` or `Referer`, ignores honeypot and obvious link-spam submissions, requires the browser timing field emitted by the site JavaScript, rate-limits repeated submissions, and sends accepted submissions server-side.

## Delivery

The preferred deployment uses Amazon SES over HTTPS from the Worker. Grantlet provisions a narrow IAM user into `.env.ses-forms`, and `deploy.mjs` stores those values as Worker secret bindings.
Set `TO_EMAIL` to a comma- or semicolon-separated list to send each submission to multiple recipients.

Fallbacks are also supported:

- Cloudflare Email Routing through a `FORM_EMAIL` binding, if configured.
- `RESEND_API_KEY` secret for Resend delivery.
- `FORWARD_WEBHOOK_URL` secret for webhook delivery.
- `DRY_RUN=true` for local testing only.

## Spam Controls

The contact page sends `elapsed_ms` when JavaScript handles the submit. By default, the Worker rejects submissions that skip that browser signal or arrive too quickly. These knobs can be adjusted as Worker vars:

- `MIN_FORM_ELAPSED_MS` defaults to `1200`.
- `MAX_FORM_ELAPSED_MS` defaults to `86400000`.
- `RATE_LIMIT_WINDOW_SECONDS` defaults to `3600`.
- `RATE_LIMIT_MAX` defaults to `3`; set it to `0` to disable the throttle.
- `ALLOW_MISSING_ORIGIN=true` relaxes the trusted `Origin` or `Referer` requirement, but should not be used in production.
- `REQUIRE_BROWSER_SIGNAL=false` relaxes the timing requirement, but should not be used in production.

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

If using Resend instead of SES:

```sh
npx wrangler secret put RESEND_API_KEY --config workers/forms/wrangler.toml
```

This repo also includes a direct API deploy script. Grantlet can provision a narrow Cloudflare token into `.env.cloudflare-forms` and SES credentials into `.env.ses-forms`, then deploy with:

```sh
node workers/forms/deploy.mjs
```
