import worker from "./src/index.js";

const env = {
  ALLOWED_ORIGINS: "https://pixelwisdom.ca",
  DRY_RUN: "true",
  TO_EMAIL: "phil@pixelwisdom.ca,p.h.i.l@live.ca",
  FROM_EMAIL: "forms@pixelwisdom.ca",
  SES_REGION: "us-east-1",
  SES_FROM_EMAIL: "forms@pixelwisdom.ca"
};

const request = new Request("https://pixelwisdom.ca/api/forms/submit", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "origin": "https://pixelwisdom.ca",
    "accept": "application/json"
  },
  body: JSON.stringify({
    form: "pixelwisdom-contact",
    name: "Test User",
    email: "test@example.com",
    subject: "Worker smoke test",
    message: "This is a smoke test submission.",
    elapsed_ms: "5000"
  })
});

const response = await worker.fetch(request, env, {});
const body = await response.json();

if (response.status !== 200 || body.ok !== true || body.delivery !== "dry-run") {
  console.error({ status: response.status, body });
  process.exit(1);
}

const blocked = await worker.fetch(new Request("https://pixelwisdom.ca/api/forms/submit", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "origin": "https://not-pixelwisdom.example"
  },
  body: JSON.stringify({
    name: "Test User",
    email: "test@example.com",
    message: "This should be blocked.",
    elapsed_ms: "5000"
  })
}), env, {});

if (blocked.status !== 403) {
  console.error({ status: blocked.status, body: await blocked.text() });
  process.exit(1);
}

const missingOrigin = await worker.fetch(new Request("https://pixelwisdom.ca/api/forms/submit", {
  method: "POST",
  headers: {
    "content-type": "application/json"
  },
  body: JSON.stringify({
    name: "Test User",
    email: "test@example.com",
    message: "This should be blocked.",
    elapsed_ms: "5000"
  })
}), env, {});

if (missingOrigin.status !== 403) {
  console.error({ status: missingOrigin.status, body: await missingOrigin.text() });
  process.exit(1);
}

const missingBrowserSignal = await worker.fetch(new Request("https://pixelwisdom.ca/api/forms/submit", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "origin": "https://pixelwisdom.ca"
  },
  body: JSON.stringify({
    name: "Test User",
    email: "test@example.com",
    message: "This should be blocked."
  })
}), env, {});

if (missingBrowserSignal.status !== 400) {
  console.error({ status: missingBrowserSignal.status, body: await missingBrowserSignal.text() });
  process.exit(1);
}

const honeypot = await worker.fetch(new Request("https://pixelwisdom.ca/api/forms/submit", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "origin": "https://pixelwisdom.ca"
  },
  body: JSON.stringify({
    name: "Test User",
    email: "test@example.com",
    message: "This should be ignored.",
    elapsed_ms: "5000",
    website_url: "https://spam.example"
  })
}), env, {});
const honeypotBody = await honeypot.json();

if (honeypot.status !== 200 || honeypotBody.ok !== true || honeypotBody.delivery) {
  console.error({ status: honeypot.status, body: honeypotBody });
  process.exit(1);
}

const originalCachesDescriptor = Object.getOwnPropertyDescriptor(globalThis, "caches");
const cacheStore = new Map();
Object.defineProperty(globalThis, "caches", {
  configurable: true,
  value: {
    default: {
      async match(request) {
        const cached = cacheStore.get(request.url);
        return cached
          ? new Response(cached.body, { headers: cached.headers })
          : undefined;
      },
      async put(request, response) {
        cacheStore.set(request.url, {
          body: await response.text(),
          headers: Object.fromEntries(response.headers)
        });
      }
    }
  }
});

try {
  const rateLimitEnv = {
    ...env,
    RATE_LIMIT_MAX: "1",
    RATE_LIMIT_WINDOW_SECONDS: "60"
  };
  const rateLimitedRequest = () => new Request("https://pixelwisdom.ca/api/forms/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://pixelwisdom.ca",
      "cf-connecting-ip": "203.0.113.10",
      "user-agent": "forms-test"
    },
    body: JSON.stringify({
      name: "Test User",
      email: "test@example.com",
      message: "This should be rate limited on the second try.",
      elapsed_ms: "5000"
    })
  });

  const firstRateLimited = await worker.fetch(rateLimitedRequest(), rateLimitEnv, {});
  const firstRateLimitedBody = await firstRateLimited.json();
  if (firstRateLimited.status !== 200 || firstRateLimitedBody.delivery !== "dry-run") {
    console.error({ status: firstRateLimited.status, body: firstRateLimitedBody });
    process.exit(1);
  }

  const secondRateLimited = await worker.fetch(rateLimitedRequest(), rateLimitEnv, {});
  if (secondRateLimited.status !== 429) {
    console.error({ status: secondRateLimited.status, body: await secondRateLimited.text() });
    process.exit(1);
  }
} finally {
  if (originalCachesDescriptor) {
    Object.defineProperty(globalThis, "caches", originalCachesDescriptor);
  } else {
    delete globalThis.caches;
  }
}

console.log("forms worker smoke tests passed");
