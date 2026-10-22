import { escapeIssueText, validateReview } from "./validation.js";

const marker = /<!-- estela-review:v1:([A-Za-z0-9_-]+) -->/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}

function cors(request, env, headers = {}) {
  const allowed = request.headers.get("Origin") === env.SITE_ORIGIN;
  return allowed ? { ...headers, "Access-Control-Allow-Origin": env.SITE_ORIGIN, "Vary": "Origin" } : headers;
}

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseIssue(issue) {
  const encoded = issue.body?.match(marker)?.[1];
  if (!encoded) return null;
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
    if (data.version !== 1 || !["salon", "atelier"].includes(data.category) || !Number.isInteger(data.rating) || data.rating < 0 || data.rating > 5
      || typeof data.comment !== "string" || !data.comment.trim() || data.comment.length > 1000
      || typeof data.anonymous !== "boolean" || typeof data.name !== "string" || data.name.length > 60
      || (data.photoId !== null && !uuid.test(data.photoId))) return null;
    return data;
  } catch { return null; }
}

function hasReviewLabel(issue) {
  return issue.labels?.some((label) => (typeof label === "string" ? label : label.name) === "estela-review");
}

async function github(env, path, options = {}) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
}

async function readForm(request, limit) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return false; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request.url, { method: "POST", headers: request.headers, body: bytes }).formData();
}

async function submit(request, env) {
  const fail = (error, status) => json({ error }, status, cors(request, env));
  if (request.headers.get("Origin") !== env.SITE_ORIGIN) return fail("origin", 403);
  const maxBody = 5 * 1024 * 1024 + 64 * 1024;
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > maxBody) return fail("too_large", 413);
  let form;
  try {
    form = await readForm(request, maxBody);
    if (form === false) return fail("too_large", 413);
  } catch { return fail("invalid_form", 400); }
  if (!form) return fail("invalid_form", 400);
  if (form.getAll("photo").length > 1) return fail("invalid_photo", 400);
  const validated = await validateReview(form);
  if (!validated.ok) return fail(validated.error, 400);
  const fields = validated.value;
  const turnstileToken = String(form.get("turnstileToken") ?? "");
  if (!turnstileToken || !env.TURNSTILE_SECRET) return fail("verification", 403);
  let verification;
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: turnstileToken });
    verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  } catch { return fail("verification", 502); }
  if (!verification.ok || !(await verification.json()).success) return fail("verification", 403);

  let photoId = null;
  if (fields.photo) {
    photoId = crypto.randomUUID();
    try {
      await env.REVIEW_PHOTOS.put(`pending/${photoId}`, await fields.photo.arrayBuffer(), { httpMetadata: { contentType: fields.photo.type } });
    } catch { return fail("photo_storage", 502); }
  }
  const payload = { version: 1, category: fields.category, rating: fields.rating, anonymous: fields.anonymous, name: fields.name, comment: fields.comment, photoId };
  const categoryLabel = fields.category === "salon" ? "Salão de beleza" : "Ateliê";
  const name = fields.anonymous ? "Anônimo" : (fields.name || "Não informado");
  const body = [
    `**Categoria:** ${categoryLabel}`,
    `**Avaliação:** ${fields.rating} de 5 estrelas`,
    `**Nome:** ${escapeIssueText(name)}`,
    `**Comentário:**\n\n${escapeIssueText(fields.comment)}`,
    fields.photo ? "**Foto:** enviada (armazenada privadamente até aprovação)." : "**Foto:** não enviada.",
    "",
    `<!-- estela-review:v1:${encode(payload)} -->`,
  ].join("\n\n");
  const title = `[AVALIAÇÃO] ${categoryLabel} — ${fields.rating}/5`;
  let created;
  try {
    created = await github(env, "/issues", { method: "POST", body: JSON.stringify({ title, body }) });
  } catch {
    if (photoId) await env.REVIEW_PHOTOS.delete(`pending/${photoId}`).catch(() => {});
    return fail("submission_failed", 502);
  }
  if (!created.ok) {
    if (photoId) await env.REVIEW_PHOTOS.delete(`pending/${photoId}`).catch(() => {});
    return fail("submission_failed", 502);
  }
  return json({ message: "Avaliação enviada para análise." }, 201, cors(request, env));
}

async function listReviews(request, env) {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL("/api/reviews", request.url));
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return json(await cached.json(), 200, cors(request, env, { "Cache-Control": "public, max-age=60" }));
  }
  const url = new URL("https://api.github.com/repos/unused");
  url.pathname = `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`;
  url.search = new URLSearchParams({ state: "closed", labels: "estela-review", per_page: "100", sort: "created", direction: "desc" }).toString();
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_TOKEN}`, "X-GitHub-Api-Version": "2022-11-28" } });
  } catch { return json({ error: "unavailable" }, 502, cors(request, env)); }
  if (!response.ok) return json({ error: "unavailable" }, 502, cors(request, env));
  let issues;
  try { issues = await response.json(); } catch { return json({ error: "unavailable" }, 502, cors(request, env)); }
  if (!Array.isArray(issues)) return json({ error: "unavailable" }, 502, cors(request, env));
  const reviews = (await Promise.all(issues.filter((issue) => issue.state === "closed" && !issue.pull_request && hasReviewLabel(issue))
    .map(async (issue) => {
      const data = parseIssue(issue);
      if (!data) return null;
      const photoReady = data.photoId && await env.REVIEW_PHOTOS.head(`approved/${data.photoId}`);
      return {
        id: issue.number, category: data.category, rating: data.rating, anonymous: Boolean(data.anonymous),
        name: data.anonymous ? "Anônimo" : (data.name || "Cliente"), comment: data.comment,
        createdAt: issue.created_at,
        photoUrl: photoReady ? `${new URL(request.url).origin}/api/reviews/${issue.number}/photo` : null,
      };
    }))).filter(Boolean);
  const payload = { reviews };
  if (cache) await cache.put(cacheKey, json(payload, 200, { "Cache-Control": "public, max-age=60" }));
  return json(payload, 200, cors(request, env, { "Cache-Control": "public, max-age=60" }));
}

async function servePhoto(request, env, number) {
  const response = await github(env, `/issues/${number}`);
  if (!response.ok) return new Response(null, { status: 404 });
  const issue = await response.json();
  if (issue.state !== "closed" || !hasReviewLabel(issue)) return new Response(null, { status: 404 });
  const data = parseIssue(issue);
  if (!data?.photoId || !uuid.test(data.photoId)) return new Response(null, { status: 404 });
  const object = await env.REVIEW_PHOTOS.get(`approved/${data.photoId}`);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env, { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" }) });
    if (url.pathname === "/api/reviews" && request.method === "POST") return submit(request, env);
    if (url.pathname === "/api/reviews" && request.method === "GET") return listReviews(request, env);
    const photo = url.pathname.match(/^\/api\/reviews\/(\d+)\/photo$/);
    if (photo && request.method === "GET") {
      try { return await servePhoto(request, env, photo[1]); } catch { return new Response(null, { status: 502 }); }
    }
    const cleanup = url.pathname.match(/^\/internal\/reviews\/photo\/([0-9a-f-]{36})$/i);
    if (cleanup && request.method === "POST") {
      if (!env.PHOTO_CLEANUP_SECRET || request.headers.get("Authorization") !== `Bearer ${env.PHOTO_CLEANUP_SECRET}`) return new Response(null, { status: 401 });
      if (!uuid.test(cleanup[1])) return new Response(null, { status: 400 });
      await Promise.all([env.REVIEW_PHOTOS.delete(`pending/${cleanup[1]}`), env.REVIEW_PHOTOS.delete(`approved/${cleanup[1]}`)]);
      return new Response(null, { status: 204 });
    }
    const approve = url.pathname.match(/^\/internal\/reviews\/photo\/([0-9a-f-]{36})\/approve$/i);
    if (approve && request.method === "POST") {
      if (!env.PHOTO_CLEANUP_SECRET || request.headers.get("Authorization") !== `Bearer ${env.PHOTO_CLEANUP_SECRET}`) return new Response(null, { status: 401 });
      if (!uuid.test(approve[1])) return new Response(null, { status: 400 });
      const pending = await env.REVIEW_PHOTOS.get(`pending/${approve[1]}`);
      if (pending) {
        await env.REVIEW_PHOTOS.put(`approved/${approve[1]}`, pending.body, { httpMetadata: pending.httpMetadata });
        await env.REVIEW_PHOTOS.delete(`pending/${approve[1]}`);
      } else if (!(await env.REVIEW_PHOTOS.get(`approved/${approve[1]}`))) return new Response(null, { status: 404 });
      return new Response(null, { status: 204 });
    }
    return json({ error: "not_found" }, 404);
  },
};
