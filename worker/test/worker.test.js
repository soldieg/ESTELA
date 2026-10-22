import assert from "node:assert/strict";
import { test } from "node:test";

let worker;
try {
  worker = (await import("../src/index.js")).default;
} catch {
  // Keep the RED run as an assertion failure until the Worker exists.
}

const origin = "https://soldieg.github.io";
const issueUrl = "https://api.github.com/repos/soldieg/ESTELA/issues";
const env = () => ({
  SITE_ORIGIN: origin,
  GITHUB_OWNER: "soldieg",
  GITHUB_REPO: "ESTELA",
  GITHUB_TOKEN: "server-github-token",
  TURNSTILE_SECRET: "turnstile-secret",
  PHOTO_CLEANUP_SECRET: "cleanup-secret",
  REVIEW_PHOTOS: {
    objects: new Map(),
    async put(key, body, metadata) { this.objects.set(key, { body, metadata }); },
    async get(key) {
      const object = this.objects.get(key);
      return object ? { body: object.body, httpMetadata: object.metadata?.httpMetadata } : null;
    },
    async delete(key) { this.objects.delete(key); },
  },
});

function reviewForm({ category = "salon", rating = "5", comment = "Atendimento excelente.", name = "Ana", anonymous = false, photo = null } = {}) {
  const form = new FormData();
  form.set("category", category);
  form.set("rating", rating);
  form.set("comment", comment);
  form.set("name", name);
  if (anonymous) form.set("anonymous", "on");
  form.set("turnstileToken", "valid-turnstile-token");
  if (photo) form.set("photo", photo);
  return form;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function installFetch(t, responder) {
  t.mock.method(globalThis, "fetch", async (input, options = {}) => responder(String(input), options));
}

function requireWorker() {
  assert.equal(typeof worker?.fetch, "function", "Worker fetch handler must be implemented");
}

test("creates a pending salon Issue after server-side Turnstile verification", async (t) => {
  requireWorker();
  const calls = [];
  installFetch(t, async (url, options) => {
    calls.push({ url, options });
    if (url.includes("siteverify")) return jsonResponse({ success: true });
    if (url === issueUrl) return jsonResponse({ number: 41, state: "open" }, 201);
    throw new Error(`Unexpected URL ${url}`);
  });
  const response = await worker.fetch(new Request("https://worker.test/api/reviews", {
    method: "POST", headers: { Origin: origin }, body: reviewForm(),
  }), env());
  assert.equal(response.status, 201);
  const publicResponse = await response.json();
  assert.match(publicResponse.message, /enviada/i);
  const issue = JSON.parse(calls.find((call) => call.url === issueUrl).options.body);
  assert.match(issue.title, /^\[AVALIAÇÃO\].*Salão/);
  assert.match(issue.body, /estela-review:v1:/);
  assert.equal(calls.find((call) => call.url === issueUrl).options.headers.Authorization, "Bearer server-github-token");
  assert.doesNotMatch(JSON.stringify(publicResponse), /server-github-token/);
});

test("stores no typed name in an anonymous Issue", async (t) => {
  requireWorker();
  let issueBody = "";
  installFetch(t, async (url, options) => {
    if (url.includes("siteverify")) return jsonResponse({ success: true });
    if (url === issueUrl) {
      issueBody = JSON.parse(options.body).body;
      return jsonResponse({ number: 42 }, 201);
    }
    throw new Error(`Unexpected URL ${url}`);
  });
  const response = await worker.fetch(new Request("https://worker.test/api/reviews", {
    method: "POST", headers: { Origin: origin }, body: reviewForm({ name: "Nome Privado", anonymous: true }),
  }), env());
  assert.equal(response.status, 201);
  assert.equal(issueBody.includes("Nome Privado"), false);
  assert.match(issueBody, /Anônimo/);
});

test("creates an atelier Issue with its own category", async (t) => {
  requireWorker();
  let issue;
  installFetch(t, async (url, options) => {
    if (url.includes("siteverify")) return jsonResponse({ success: true });
    if (url === issueUrl) { issue = JSON.parse(options.body); return jsonResponse({ number: 43 }, 201); }
    throw new Error(`Unexpected URL ${url}`);
  });
  const response = await worker.fetch(new Request("https://worker.test/api/reviews", {
    method: "POST", headers: { Origin: origin }, body: reviewForm({ category: "atelier", rating: "3" }),
  }), env());
  assert.equal(response.status, 201);
  assert.match(issue.title, /Ateliê/);
  const encoded = issue.body.match(/<!-- estela-review:v1:([A-Za-z0-9_-]+) -->/)[1];
  assert.equal(JSON.parse(Buffer.from(encoded, "base64url").toString()).category, "atelier");
});

test("rejects a failed Turnstile token before creating an Issue", async (t) => {
  requireWorker();
  let issueCreated = false;
  installFetch(t, async (url) => {
    if (url.includes("siteverify")) return jsonResponse({ success: false });
    issueCreated = true;
    return jsonResponse({ number: 44 }, 201);
  });
  const response = await worker.fetch(new Request("https://worker.test/api/reviews", {
    method: "POST", headers: { Origin: origin }, body: reviewForm(),
  }), env());
  assert.equal(response.status, 403);
  assert.equal(issueCreated, false);
});

test("rejects a submission from an untrusted Origin without external calls", async (t) => {
  requireWorker();
  let called = false;
  installFetch(t, async () => { called = true; return jsonResponse({ success: true }); });
  const response = await worker.fetch(new Request("https://worker.test/api/reviews", {
    method: "POST", headers: { Origin: "https://attacker.example" }, body: reviewForm(),
  }), env());
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("rejects invalid review fields before calling GitHub", async (t) => {
  requireWorker();
  let issueCreated = false;
  installFetch(t, async (url) => {
    if (url.includes("siteverify")) return jsonResponse({ success: true });
    issueCreated = true;
    return jsonResponse({ number: 45 }, 201);
  });
  const response = await worker.fetch(new Request("https://worker.test/api/reviews", {
    method: "POST", headers: { Origin: origin }, body: reviewForm({ rating: "8" }),
  }), env());
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(issueCreated, false);
});

test("removes a temporary photo and reports failure if GitHub rejects the Issue", async (t) => {
  requireWorker();
  const bindings = env();
  const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, ...new Uint8Array(9)])], "photo.jpg", { type: "image/jpeg" });
  installFetch(t, async (url) => {
    if (url.includes("siteverify")) return jsonResponse({ success: true });
    return jsonResponse({ message: "rate limited" }, 422);
  });
  const response = await worker.fetch(new Request("https://worker.test/api/reviews", {
    method: "POST", headers: { Origin: origin }, body: reviewForm({ photo }),
  }), bindings);
  assert.equal(response.status, 502);
  assert.equal(bindings.REVIEW_PHOTOS.objects.size, 0);
  assert.doesNotMatch(await response.text(), /server-github-token/);
});

test("does not create an Issue when private photo storage fails", async (t) => {
  requireWorker();
  const bindings = env();
  bindings.REVIEW_PHOTOS.put = async () => { throw new Error("R2 unavailable"); };
  let issueCreated = false;
  installFetch(t, async (url) => {
    if (url.includes("siteverify")) return jsonResponse({ success: true });
    issueCreated = true;
    return jsonResponse({ number: 46 }, 201);
  });
  const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, ...new Uint8Array(9)])], "photo.jpg", { type: "image/jpeg" });
  const response = await worker.fetch(new Request("https://worker.test/api/reviews", {
    method: "POST", headers: { Origin: origin }, body: reviewForm({ photo }),
  }), bindings);
  assert.equal(response.status, 502);
  assert.equal(issueCreated, false);
});

test("lists only closed Issues carrying valid review metadata", async (t) => {
  requireWorker();
  const data = { version: 1, category: "salon", rating: 5, anonymous: true, name: "", comment: "Ótimo trabalho", photoId: null };
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64url");
  installFetch(t, async (url) => {
    assert.match(url, /state=closed/);
    assert.match(url, /labels=estela-review/);
    return jsonResponse([
      { number: 51, state: "closed", title: "[AVALIAÇÃO] Salão", body: `<!-- estela-review:v1:${encoded} -->`, created_at: "2026-10-20T10:00:00Z", labels: [{ name: "estela-review" }] },
      { number: 52, state: "closed", title: "ordinary issue", body: "not a review", created_at: "2026-10-21T10:00:00Z", labels: [] },
      { number: 53, state: "open", title: "[AVALIAÇÃO] Salão", body: `<!-- estela-review:v1:${encoded} -->`, created_at: "2026-10-22T10:00:00Z", labels: [{ name: "estela-review" }] },
    ]);
  });
  const response = await worker.fetch(new Request("https://worker.test/api/reviews", { headers: { Origin: origin } }), env());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.reviews.length, 1);
  assert.deepEqual(payload.reviews[0], {
    id: 51, category: "salon", rating: 5, anonymous: true, name: "Anônimo", comment: "Ótimo trabalho",
    createdAt: "2026-10-20T10:00:00Z", photoUrl: null,
  });
});

test("serves a private photo only while its review Issue is closed", async (t) => {
  requireWorker();
  const bindings = env();
  const photoId = "8a87189e-44fc-45b6-bd34-c507194136cb";
  bindings.REVIEW_PHOTOS.objects.set(photoId, {
    body: new Uint8Array([1, 2, 3]),
    metadata: { httpMetadata: { contentType: "image/jpeg" } },
  });
  let state = "open";
  const data = { version: 1, category: "salon", rating: 4, anonymous: false, name: "Ana", comment: "Bom", photoId };
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64url");
  installFetch(t, async () => jsonResponse({ number: 61, state, body: `<!-- estela-review:v1:${encoded} -->`, labels: [{ name: "estela-review" }] }));
  const pending = await worker.fetch(new Request("https://worker.test/api/reviews/61/photo"), bindings);
  assert.equal(pending.status, 404);
  state = "closed";
  const approved = await worker.fetch(new Request("https://worker.test/api/reviews/61/photo"), bindings);
  assert.equal(approved.status, 200);
  assert.equal(approved.headers.get("Content-Type"), "image/jpeg");
  state = "open";
  const reopened = await worker.fetch(new Request("https://worker.test/api/reviews/61/photo"), bindings);
  assert.equal(reopened.status, 404);
});

test("rejects photo cleanup without the private cleanup secret", async (t) => {
  requireWorker();
  const bindings = env();
  bindings.REVIEW_PHOTOS.objects.set("8a87189e-44fc-45b6-bd34-c507194136cb", { body: new Uint8Array([1]) });
  const response = await worker.fetch(new Request("https://worker.test/internal/reviews/photo/8a87189e-44fc-45b6-bd34-c507194136cb", {
    method: "POST", headers: { Authorization: "Bearer wrong" },
  }), bindings);
  assert.equal(response.status, 401);
  assert.equal(bindings.REVIEW_PHOTOS.objects.size, 1);
});

test("deletes a photo with the cleanup secret", async (t) => {
  requireWorker();
  const bindings = env();
  const photoId = "8a87189e-44fc-45b6-bd34-c507194136cb";
  bindings.REVIEW_PHOTOS.objects.set(photoId, { body: new Uint8Array([1]) });
  const response = await worker.fetch(new Request(`https://worker.test/internal/reviews/photo/${photoId}`, {
    method: "POST", headers: { Authorization: "Bearer cleanup-secret" },
  }), bindings);
  assert.equal(response.status, 204);
  assert.equal(bindings.REVIEW_PHOTOS.objects.size, 0);
});
