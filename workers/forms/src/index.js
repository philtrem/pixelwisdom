const DEFAULT_ALLOWED_ORIGINS = [
  "https://pixelwisdom.ca",
  "https://www.pixelwisdom.ca"
];

const MAX_CONTENT_LENGTH = 64 * 1024;
const MAX_FIELD_LENGTH = 4000;
const DEFAULT_MIN_FORM_ELAPSED_MS = 1200;
const DEFAULT_MAX_FORM_ELAPSED_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const DEFAULT_RATE_LIMIT_MAX = 3;
const MAX_URLS_IN_SUBMISSION = 5;
const REQUIRED_FIELDS = ["name", "email", "message"];
const HONEYPOT_FIELDS = ["_gotcha", "fax_number", "company_website", "website_url"];

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

export async function handleRequest(request, env = {}, ctx = {}) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return withCors(request, env, new Response(null, { status: 204 }));
  }

  if (request.method === "GET" && isHealthPath(url.pathname)) {
    return json(request, env, { ok: true, service: "pixelwisdom-forms" });
  }

  if (request.method !== "POST" || !isSubmitPath(url.pathname)) {
    return json(request, env, { ok: false, error: "Not found" }, 404);
  }

  const originError = validateOrigin(request, env);
  if (originError) {
    return json(request, env, { ok: false, error: originError }, 403);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_CONTENT_LENGTH) {
    return json(request, env, { ok: false, error: "Submission is too large" }, 413);
  }

  let payload;
  try {
    payload = await parsePayload(request);
  } catch (error) {
    return json(request, env, { ok: false, error: messageFrom(error) }, 400);
  }

  const submission = normalizeSubmission(payload, request);
  const validationError = validateSubmission(submission);
  if (validationError) {
    return json(request, env, { ok: false, error: validationError }, 400);
  }

  if (isSpam(submission)) {
    return accepted(request, env);
  }

  const browserSignalError = validateBrowserSignal(submission, env);
  if (browserSignalError) {
    return json(request, env, { ok: false, error: browserSignalError }, 400);
  }

  const rateLimitError = await rateLimitSubmission(request, env);
  if (rateLimitError) {
    return json(request, env, { ok: false, error: rateLimitError }, 429);
  }

  try {
    const delivery = await deliverSubmission(env, submission, request);
    if (ctx.waitUntil && delivery.background) {
      ctx.waitUntil(delivery.background);
    }

    return wantsHtml(request)
      ? new Response(successHtml(), { headers: htmlHeaders(request, env) })
      : json(request, env, { ok: true, delivery: delivery.provider });
  } catch (error) {
    const status = error instanceof ConfigurationError ? 500 : 502;
    const response = { ok: false, error: messageFrom(error) };

    return wantsHtml(request)
      ? new Response(errorHtml(response.error), { status, headers: htmlHeaders(request, env) })
      : json(request, env, response, status);
  }
}

function isHealthPath(pathname) {
  return pathname === "/api/forms/health" || pathname === "/health";
}

function isSubmitPath(pathname) {
  return pathname === "/api/forms/submit" || pathname === "/submit";
}

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function validateOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (origin) {
    return allowedOrigins(env).includes(origin)
      ? null
      : "Origin is not allowed";
  }

  const referer = request.headers.get("referer");
  const refererOrigin = originFromUrl(referer);
  if (refererOrigin) {
    return allowedOrigins(env).includes(refererOrigin)
      ? null
      : "Referer is not allowed";
  }

  return env.ALLOW_MISSING_ORIGIN === "true"
    ? null
    : "Origin is required";
}

function originFromUrl(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

async function parsePayload(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("JSON body must be an object");
    }
    return payload;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    return Object.fromEntries(await request.formData());
  }

  throw new Error("Unsupported content type");
}

function normalizeSubmission(payload, request) {
  const fields = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") {
      fields[key] = value.trim();
    }
  }

  return {
    form: cleanValue(fields.form || fields.form_id || "pixelwisdom-contact", 80),
    name: cleanValue(fields.name, 160),
    email: cleanValue(fields.email, 320),
    subject: cleanValue(fields.subject || "New form submission", 200),
    message: cleanValue(fields.message, MAX_FIELD_LENGTH),
    page: cleanValue(fields.page || request.headers.get("referer") || "", 500),
    origin: cleanValue(request.headers.get("origin") || "", 500),
    userAgent: cleanValue(request.headers.get("user-agent") || "", 500),
    elapsedMs: parseInteger(fields.elapsed_ms),
    honeypots: Object.fromEntries(HONEYPOT_FIELDS.map((field) => [field, cleanValue(fields[field], 500)])),
    fields
  };
}

function cleanValue(value, maxLength) {
  return String(value || "")
    .replace(/\r/g, "")
    .slice(0, maxLength);
}

function validateSubmission(submission) {
  for (const field of REQUIRED_FIELDS) {
    if (!submission[field]) {
      return `${field} is required`;
    }
  }

  if (!isValidEmail(submission.email)) {
    return "email is invalid";
  }

  return null;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isSpam(submission) {
  return hasHoneypotValue(submission) || hasSpamContent(submission);
}

function hasHoneypotValue(submission) {
  return Object.values(submission.honeypots).some(Boolean);
}

function hasSpamContent(submission) {
  const text = [
    submission.name,
    submission.email,
    submission.subject,
    submission.message
  ].join("\n");
  const urls = text.match(/\b(?:https?:\/\/|www\.)\S+/gi) || [];

  if (urls.length > MAX_URLS_IN_SUBMISSION) {
    return true;
  }

  if (/(?:<a\s+href=|\[url=)/i.test(text)) {
    return true;
  }

  return urls.length > 0 && /\b(?:backlinks?|casino|loan|payday|viagra|whatsapp)\b/i.test(text);
}

function validateBrowserSignal(submission, env) {
  if (env.REQUIRE_BROWSER_SIGNAL === "false") {
    return null;
  }

  if (!Number.isFinite(submission.elapsedMs)) {
    return "Please reload the page and try again.";
  }

  const minElapsed = positiveInteger(env.MIN_FORM_ELAPSED_MS, DEFAULT_MIN_FORM_ELAPSED_MS);
  const maxElapsed = positiveInteger(env.MAX_FORM_ELAPSED_MS, DEFAULT_MAX_FORM_ELAPSED_MS);

  if (submission.elapsedMs < minElapsed) {
    return "Please wait a moment before sending.";
  }

  if (submission.elapsedMs > maxElapsed) {
    return "Please reload the page and try again.";
  }

  return null;
}

async function rateLimitSubmission(request, env) {
  const limit = nonNegativeInteger(env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX);
  if (limit <= 0 || !globalThis.caches?.default) {
    return null;
  }

  const identifier = clientIdentifier(request);
  if (!identifier) {
    return null;
  }

  const windowSeconds = positiveInteger(env.RATE_LIMIT_WINDOW_SECONDS, DEFAULT_RATE_LIMIT_WINDOW_SECONDS);
  const now = Date.now();
  const keyHash = await sha256Hex(identifier);
  const cacheKey = new Request(`https://pixelwisdom.local/form-rate/${keyHash}`);
  const cached = await caches.default.match(cacheKey);
  let state = { count: 0, resetAt: now + windowSeconds * 1000 };

  if (cached) {
    const cachedState = await cached.json().catch(() => null);
    if (cachedState && Number(cachedState.resetAt) > now) {
      state = {
        count: Number(cachedState.count) || 0,
        resetAt: Number(cachedState.resetAt)
      };
    }
  }

  state.count += 1;
  const ttl = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
  await caches.default.put(
    cacheKey,
    new Response(JSON.stringify(state), {
      headers: { "cache-control": `max-age=${ttl}` }
    })
  );

  return state.count > limit
    ? "Too many submissions. Please try again later."
    : null;
}

function clientIdentifier(request) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  const country = request.cf?.country || "";
  const userAgent = request.headers.get("user-agent") || "";

  if (ip) {
    return `ip:${ip}:${country}`;
  }

  return userAgent ? `ua:${userAgent}` : "";
}

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function deliverSubmission(env, submission, request) {
  const deliveryEnv = await resolveDeliverySecrets(env);

  if (hasSesConfig(deliveryEnv)) {
    await sendWithSes(deliveryEnv, submission);
    return { provider: "ses" };
  }

  if (env.FORM_EMAIL && typeof env.FORM_EMAIL.send === "function") {
    await sendWithCloudflareEmail(env, submission);
    return { provider: "cloudflare-email" };
  }

  if (env.RESEND_API_KEY) {
    await sendWithResend(env, submission);
    return { provider: "resend" };
  }

  if (env.FORWARD_WEBHOOK_URL) {
    await sendWithWebhook(env, submission, request);
    return { provider: "webhook" };
  }

  if (env.DRY_RUN === "true") {
    return { provider: "dry-run" };
  }

  throw new ConfigurationError("No delivery provider configured");
}

async function resolveDeliverySecrets(env) {
  return {
    ...env,
    AWS_ACCESS_KEY_ID: await resolveSecretValue(env.AWS_ACCESS_KEY_ID),
    AWS_SECRET_ACCESS_KEY: await resolveSecretValue(env.AWS_SECRET_ACCESS_KEY),
    AWS_SESSION_TOKEN: await resolveSecretValue(env.AWS_SESSION_TOKEN),
    RESEND_API_KEY: await resolveSecretValue(env.RESEND_API_KEY),
    FORWARD_WEBHOOK_URL: await resolveSecretValue(env.FORWARD_WEBHOOK_URL)
  };
}

async function resolveSecretValue(value) {
  if (value && typeof value === "object" && typeof value.get === "function") {
    return value.get();
  }
  return value;
}

function hasSesConfig(env) {
  return Boolean(
    env.AWS_ACCESS_KEY_ID &&
    env.AWS_SECRET_ACCESS_KEY &&
    (env.SES_FROM_EMAIL || env.FROM_EMAIL)
  );
}

async function sendWithCloudflareEmail(env, submission) {
  const { EmailMessage } = await import("cloudflare:email");
  const from = env.FROM_EMAIL || "forms@pixelwisdom.ca";
  const to = recipientEmails(env.TO_EMAIL, "phil@pixelwisdom.ca")[0];
  const raw = buildMimeMessage({ from, to, submission });

  await env.FORM_EMAIL.send(new EmailMessage(from, to, raw));
}

async function sendWithSes(env, submission) {
  const region = env.SES_REGION || env.AWS_REGION || "us-east-1";
  const from = env.SES_FROM_EMAIL || env.FROM_EMAIL || "forms@pixelwisdom.ca";
  const recipients = recipientEmails(env.TO_EMAIL, "phil@pixelwisdom.ca");
  const endpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const body = JSON.stringify({
    FromEmailAddress: from,
    Destination: {
      ToAddresses: recipients
    },
    ReplyToAddresses: [submission.email],
    Content: {
      Simple: {
        Subject: {
          Data: emailSubject(submission),
          Charset: "UTF-8"
        },
        Body: {
          Text: {
            Data: emailText(submission),
            Charset: "UTF-8"
          },
          Html: {
            Data: emailHtml(submission),
            Charset: "UTF-8"
          }
        }
      }
    }
  });

  const response = await signedAwsFetch(endpoint, {
    method: "POST",
    body,
    region,
    service: "ses",
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    sessionToken: env.AWS_SESSION_TOKEN
  });

  if (!response.ok) {
    const providerMessage = await response.text().catch(() => "");
    throw new Error(`SES rejected submission (${response.status})${providerMessage ? `: ${providerMessage.slice(0, 200)}` : ""}`);
  }
}

async function sendWithResend(env, submission) {
  const from = env.FROM_EMAIL || "Pixel Wisdom Forms <forms@pixelwisdom.ca>";
  const recipients = recipientEmails(env.TO_EMAIL, "phil@pixelwisdom.ca");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: recipients,
      reply_to: submission.email,
      subject: emailSubject(submission),
      text: emailText(submission),
      html: emailHtml(submission)
    })
  });

  if (!response.ok) {
    throw new Error(`Email provider rejected submission (${response.status})`);
  }
}

async function sendWithWebhook(env, submission, request) {
  const response = await fetch(env.FORWARD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "pixelwisdom-forms-worker"
    },
    body: JSON.stringify({
      ...submission,
      ipCountry: request.cf?.country || null,
      receivedAt: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(`Webhook rejected submission (${response.status})`);
  }
}

function emailSubject(submission) {
  return headerSafe(`[${submission.form}] ${submission.subject}`);
}

function emailText(submission) {
  return [
    `Form: ${submission.form}`,
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Subject: ${submission.subject}`,
    `Page: ${submission.page || "n/a"}`,
    "",
    submission.message
  ].join("\n");
}

function emailHtml(submission) {
  return `
    <h2>New form submission</h2>
    <p><strong>Form:</strong> ${escapeHtml(submission.form)}</p>
    <p><strong>Name:</strong> ${escapeHtml(submission.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(submission.subject)}</p>
    <p><strong>Page:</strong> ${escapeHtml(submission.page || "n/a")}</p>
    <hr>
    <p>${escapeHtml(submission.message).replace(/\n/g, "<br>")}</p>
  `;
}

function recipientEmails(value, fallback) {
  const recipients = String(value || fallback)
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);

  return recipients.length ? recipients : [fallback];
}

function buildMimeMessage({ from, to, submission }) {
  const boundary = `pixelwisdom-${crypto.randomUUID()}`;
  const subject = emailSubject(submission);

  return [
    `From: ${headerSafe(from)}`,
    `To: ${headerSafe(to)}`,
    `Reply-To: ${headerSafe(submission.email)}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    emailText(submission),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    emailHtml(submission),
    "",
    `--${boundary}--`
  ].join("\r\n");
}

function headerSafe(value) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(request, env, payload, status = 200) {
  return withCors(
    request,
    env,
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    })
  );
}

function accepted(request, env) {
  return wantsHtml(request)
    ? new Response(successHtml(), { headers: htmlHeaders(request, env) })
    : json(request, env, { ok: true });
}

function withCors(request, env, response) {
  const origin = request.headers.get("origin");
  const headers = new Headers(response.headers);

  if (origin && allowedOrigins(env).includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }

  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, accept");
  headers.set("access-control-max-age", "86400");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function wantsHtml(request) {
  return (request.headers.get("accept") || "").includes("text/html");
}

function htmlHeaders(request, env) {
  return withCors(
    request,
    env,
    new Response(null, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    })
  ).headers;
}

function successHtml() {
  return "<!doctype html><title>Message sent</title><p>Message sent. You can close this tab.</p>";
}

function errorHtml(message) {
  return `<!doctype html><title>Message failed</title><p>${escapeHtml(message)}</p>`;
}

function messageFrom(error) {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function signedAwsFetch(url, options) {
  const requestUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(options.body || "");
  const headers = {
    "content-type": "application/json",
    "host": requestUrl.host,
    "x-amz-date": amzDate
  };

  if (options.sessionToken) {
    headers["x-amz-security-token"] = options.sessionToken;
  }

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    options.method,
    requestUrl.pathname,
    requestUrl.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = await awsSigningKey(options.secretAccessKey, dateStamp, options.region, options.service);
  const signature = await hmacHex(signingKey, stringToSign);

  headers.authorization = [
    "AWS4-HMAC-SHA256",
    `Credential=${options.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(", ");

  return fetch(requestUrl, {
    method: options.method,
    headers,
    body: options.body
  });
}

async function awsSigningKey(secretAccessKey, dateStamp, region, service) {
  const dateKey = await hmacBytes(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = await hmacBytes(dateKey, region);
  const serviceKey = await hmacBytes(regionKey, service);
  return hmacBytes(serviceKey, "aws4_request");
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? textBytes(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hex(digest);
}

async function hmacBytes(key, value) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? textBytes(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, textBytes(value));
}

async function hmacHex(key, value) {
  return hex(await hmacBytes(key, value));
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

class ConfigurationError extends Error {}
