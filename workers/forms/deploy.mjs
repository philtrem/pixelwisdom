import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const API_BASE_URL = "https://api.cloudflare.com/client/v4";
const SCRIPT_NAME = "pixelwisdom-forms";
const ZONE_NAME = "pixelwisdom.ca";
const ROUTE_PATTERNS = [
  "pixelwisdom.ca/api/forms/*",
  "www.pixelwisdom.ca/api/forms/*"
];

await loadEnvFile(".env.cloudflare-forms");
await loadEnvFile(".env.ses-forms");

if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
}

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for SES delivery.");
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

const zone = await findZone(accountId, ZONE_NAME, apiToken);
await uploadWorker(accountId, apiToken);
await upsertRoutes(zone.id, apiToken);

console.log(`Deployed ${SCRIPT_NAME} to ${ROUTE_PATTERNS.join(", ")}`);

async function loadEnvFile(path) {
  let raw;
  try {
    raw = await readFile(resolve(path), "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 0) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim().replace(/^"|"$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function findZone(accountId, zoneName, apiToken) {
  const data = await cloudflare(apiToken, `/zones?name=${encodeURIComponent(zoneName)}&account.id=${encodeURIComponent(accountId)}`);
  const zone = data.result?.find((candidate) => candidate.name === zoneName);
  if (!zone?.id) {
    throw new Error(`Cloudflare zone not found for ${zoneName}.`);
  }
  return zone;
}

async function uploadWorker(accountId, apiToken) {
  const source = await readFile(resolve("workers/forms/src/index.js"), "utf8");
  const metadata = {
    main_module: "index.js",
    compatibility_date: "2026-05-20",
    bindings: [
      {
        type: "plain_text",
        name: "ALLOWED_ORIGINS",
        text: "https://pixelwisdom.ca,https://www.pixelwisdom.ca"
      },
      {
        type: "plain_text",
        name: "TO_EMAIL",
        text: "phil@pixelwisdom.ca"
      },
      {
        type: "plain_text",
        name: "FROM_EMAIL",
        text: "forms@pixelwisdom.ca"
      },
      {
        type: "plain_text",
        name: "SES_REGION",
        text: process.env.SES_REGION || "us-east-1"
      },
      {
        type: "plain_text",
        name: "SES_FROM_EMAIL",
        text: "forms@pixelwisdom.ca"
      },
      {
        type: "secret_text",
        name: "AWS_ACCESS_KEY_ID",
        text: process.env.AWS_ACCESS_KEY_ID
      },
      {
        type: "secret_text",
        name: "AWS_SECRET_ACCESS_KEY",
        text: process.env.AWS_SECRET_ACCESS_KEY
      }
    ]
  };

  const formData = new FormData();
  formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
  formData.append("index.js", new Blob([source], { type: "application/javascript+module" }), "index.js");

  await cloudflare(apiToken, `/accounts/${accountId}/workers/scripts/${SCRIPT_NAME}`, {
    method: "PUT",
    body: formData
  });
}

async function upsertRoutes(zoneId, apiToken) {
  const existing = await cloudflare(apiToken, `/zones/${zoneId}/workers/routes`);
  const routes = existing.result ?? [];

  for (const pattern of ROUTE_PATTERNS) {
    const route = routes.find((candidate) => candidate.pattern === pattern);
    const body = JSON.stringify({ pattern, script: SCRIPT_NAME });

    if (route?.id) {
      await cloudflare(apiToken, `/zones/${zoneId}/workers/routes/${route.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body
      });
    } else {
      await cloudflare(apiToken, `/zones/${zoneId}/workers/routes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
      });
    }
  }
}

async function cloudflare(apiToken, path, init = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiToken}`,
      accept: "application/json",
      ...init.headers
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || data.success === false) {
    throw new Error(`Cloudflare API failed ${response.status}: ${JSON.stringify(data.errors || data)}`);
  }

  return data;
}
