import worker from "./src/index.js";

const env = {
  ALLOWED_ORIGINS: "https://pixelwisdom.ca",
  DRY_RUN: "true",
  TO_EMAIL: "p.h.i.l@live.ca",
  FROM_EMAIL: "forms@pixelwisdom.ca"
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
    message: "This is a smoke test submission."
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
    message: "This should be blocked."
  })
}), env, {});

if (blocked.status !== 403) {
  console.error({ status: blocked.status, body: await blocked.text() });
  process.exit(1);
}

console.log("forms worker smoke tests passed");
