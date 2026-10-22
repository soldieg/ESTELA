import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const marker = /<!-- estela-review:v1:([A-Za-z0-9_-]+) -->/;
const photoIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readReview(issue) {
  const encoded = issue?.body?.match(marker)?.[1];
  if (!encoded) return null;
  try {
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return data.version === 1 && ["salon", "atelier"].includes(data.category) ? data : null;
  } catch { return null; }
}

export function planIssueEvent(payload) {
  const issue = payload?.issue;
  const data = readReview(issue);
  if (!data) return null;
  if (payload.action === "opened" && /^\[AVALIAÇÃO\]/i.test(issue.title || "")) {
    return { type: "label", issueNumber: issue.number, labels: ["estela-review", data.category === "salon" ? "review-salao" : "review-atelie"] };
  }
  if (payload.action === "deleted" && photoIdPattern.test(data.photoId || "")) return { type: "cleanup", photoId: data.photoId };
  return null;
}

async function github(path, method, body, allowExisting = false) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    method,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok && !(allowExisting && response.status === 422)) throw new Error(`GitHub API failed with status ${response.status}`);
  return response;
}

async function run() {
  const payload = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const action = planIssueEvent(payload);
  if (!action) return;
  if (action.type === "label") {
    for (const name of action.labels) {
      await github("/labels", "POST", { name, color: name === "estela-review" ? "6d3947" : "d4a5a5" }, true);
    }
    await github(`/issues/${action.issueNumber}/labels`, "POST", { labels: action.labels });
  } else {
    const base = process.env.REVIEW_WORKER_URL?.replace(/\/$/, "");
    if (!base || !process.env.PHOTO_CLEANUP_SECRET) throw new Error("Worker cleanup configuration is missing");
    const response = await fetch(`${base}/internal/reviews/photo/${action.photoId}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.PHOTO_CLEANUP_SECRET}` } });
    if (!response.ok && response.status !== 404) throw new Error(`Photo cleanup failed with status ${response.status}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
