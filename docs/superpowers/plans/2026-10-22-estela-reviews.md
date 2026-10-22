# ESTELA Review Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-site review form whose submissions become public GitHub Issues, while the website displays only approved (closed) reviews.

**Architecture:** A plain JavaScript Cloudflare Worker validates submissions, stores optional photos in private R2, and creates Issues through GitHub REST using a server secret. A GitHub Actions workflow labels new review Issues and removes stored photos when an Issue is deleted. The static site reads the Worker’s cached approved-review endpoint, with no credentials in browser code.

**Tech Stack:** Existing HTML/CSS/JavaScript, Cloudflare Workers + R2 + Turnstile, GitHub Issues REST API, GitHub Actions, Node.js built-in test runner, Wrangler for deployment.

**Spec:** [docs/superpowers/specs/2026-10-22-estela-reviews-design.md](../specs/2026-10-22-estela-reviews-design.md)

## Global Constraints

- Categories are **Salão de beleza** and **Ateliê**.
- Ratings are integers 0–5 with accessible meanings from the spec.
- A name is optional; anonymous submissions omit it from the Issue and site.
- A comment is required; one optional JPEG, PNG, or WebP image may be at most 5 MB.
- Open Issues are pending and hidden; closed Issues are approved and shown; reopening hides them; deleting hides the review and removes its private image.
- The GitHub token, Turnstile secret, and photo-cleanup secret remain server-side secrets.
- Public Issue text is visible before approval. The site must disclose this and never claim that an anonymous submission is private.
- Render visitor text as text, never as trusted HTML. No fake reviews.

## Review Focus

- Markdown/HTML injection in comments: escape or render as text; test markup and script-looking strings.
- Anonymous submissions accidentally retaining the typed name: assert the stored Issue body and public response omit it.
- Invalid or oversized photos and partial storage/GitHub failures: reject invalid input and avoid false success or duplicate submissions.
- Issue lifecycle drift: pending, closed, reopened, and deleted Issues must control visibility and photo delivery consistently.
- Public abuse and secret exposure: verify Turnstile server-side, reject wrong origins, and assert no credential is returned to the browser.

---

### Task 1: Worker setup and input validation

**Files:**
- Create: `worker/package.json`
- Create: `worker/wrangler.toml`
- Create: `worker/src/validation.js`
- Create: `worker/test/validation.test.js`

**Interfaces:**
- Produces `validateReview(formData)`: returns `{ ok: true, value: { category, rating, name, anonymous, comment, photo } }` or `{ ok: false, error }`.
- Produces `escapeIssueText(text)`: escapes user text before inserting it into the Markdown Issue body.
- Consumes only standard `FormData`, `File`, and Node test APIs; no runtime dependencies.

- [ ] Write tests for both allowed categories, integer ratings 0–5, required comment, length limits, anonymous-name omission, accepted image types/size, oversized image, SVG rejection, and Markdown/script-looking text.
- [ ] Run `node --test worker/test/validation.test.js`; confirm the new tests fail before implementation.
- [ ] Implement the validators and Wrangler Worker/R2 bindings with no GitHub token values in tracked files.
- [ ] Run `node --test worker/test/validation.test.js`; confirm all cases pass.

### Task 2: Submission, approved-list, and photo endpoints

**Files:**
- Create: `worker/src/index.js`
- Create: `worker/test/worker.test.js`

**Interfaces:**
- `POST /api/reviews`: accepts multipart form data, verifies Turnstile and Origin, stores an optional image, then creates an Issue; returns a generic success message without the moderation URL or issue number.
- `GET /api/reviews`: returns normalized reviews only from closed Issues carrying the review marker; returns no GitHub token or untrusted HTML.
- `GET /api/reviews/:number/photo`: serves the private R2 object only if the matching Issue is closed and references that photo.
- `POST /internal/reviews/photo/:photoId`: deletes the private R2 object after a GitHub deletion event; requires the cleanup secret.
- Issue title starts `[AVALIAÇÃO]`; the body has fixed category/rating/name/comment/photo fields and a version marker. Anonymous submissions omit the provided name.

- [ ] Write endpoint tests for valid Salon/Ateliê submissions, anonymous body, invalid Turnstile, wrong Origin, invalid data, GitHub failure, R2 failure, open/closed/reopened photo access, and cleanup-secret rejection.
- [ ] Run `node --test worker/test/*.test.js`; confirm the new endpoint tests fail before implementation.
- [ ] Implement the Worker using GitHub REST and R2 bindings; return CORS headers only for the configured site origin and cache the public listing briefly.
- [ ] Run `node --test worker/test/*.test.js`; confirm all cases pass, including no success response when an Issue was not created.

### Task 3: GitHub review lifecycle workflows

**Files:**
- Create: `.github/workflows/review-issues.yml`
- Create: `.github/scripts/review-issue-event.mjs`
- Create: `.github/scripts/review-issue-event.test.mjs`

**Interfaces:**
- `planIssueEvent(payload)` returns a label action for a newly opened `[AVALIAÇÃO]` Issue, a cleanup action containing the random `photoId` parsed from a deleted Issue body, or `null` for unrelated events.
- Workflow permissions are limited to `issues: write`; the Worker cleanup secret is used only for deletion events, and the workflow passes the deleted Issue's `photoId`.
- Labels: `estela-review` plus exactly one category label (`review-salao` or `review-atelie`).

- [ ] Test opened Salon/Ateliê events, unrelated issues, deletion cleanup, and events with malformed payloads.
- [ ] Run `node --test .github/scripts/review-issue-event.test.mjs`; confirm tests fail before implementation.
- [ ] Implement the event planner and workflow with no shell interpolation of untrusted Issue text.
- [ ] Run the event tests and inspect the workflow to confirm narrow permissions and correct event types.

### Task 4: Review form and public review UI

**Files:**
- Create: `avaliacoes.html`
- Create: `assets/reviews.js`
- Modify: `index.html`
- Modify: `beleza.html`
- Modify: `costura.html`
- Modify: `assets/site.css`
- Create: `tests/reviews-ui.test.js`

**Interfaces:**
- Review API URL and Turnstile public site key are configured through public meta values; no secret is placed in HTML/JavaScript.
- `filterAndSortReviews(reviews, filters)` in `assets/reviews.js` returns a new array filtered by category/rating and sorted by `newest`, `oldest`, or `highest` (ties newest first). The module renders review text using `textContent`, wires the form, and handles filters on `avaliacoes.html`.
- Each service page shows recent reviews for its category below its work-photo gallery and links to `avaliacoes.html?categoria=...`.
- `avaliacoes.html` supports both categories, rating filter, newest/oldest/highest-rated sort, and the form. The first visit shows a clear empty state, not sample reviews.

- [ ] Test review ordering/filter helpers and text-only rendering behavior, including malicious Markdown/HTML strings.
- [ ] Run `node --test tests/reviews-ui.test.js`; confirm tests fail before implementation.
- [ ] Add accessible star choices with visible labels, anonymous toggle, optional photo input, public-visibility notice, submission status/error messages, and review lists under the existing galleries.
- [ ] Run `node --test tests/reviews-ui.test.js` and verify existing site scripts still load.
- [ ] Check responsive layout at narrow mobile and desktop widths; confirm all controls can be used by keyboard.

### Task 5: Deployment wiring and end-to-end test guide

**Files:**
- Create: `.github/workflows/deploy-review-worker.yml`
- Create: `worker/README.md`
- Modify: `README.md`

**Interfaces:**
- Manual/branch-safe Worker deployment uses repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GITHUB_ISSUES_TOKEN`, `TURNSTILE_SECRET`, and `PHOTO_CLEANUP_SECRET`.
- The Turnstile site key and Worker URL are public configuration values, not secrets.
- Deployment instructions cover creating the R2 bucket and Turnstile widget, setting secrets, running the Worker deploy workflow, and setting the site API URL.
- If the required Cloudflare account/secrets are not available, code checks can pass but the live end-to-end flow remains unverified.

- [ ] Document the setup and moderation steps, including the public Issue disclosure and how close/reopen/delete affects the site.
- [ ] Add the Worker deployment workflow; do not run it until required repository secrets and Cloudflare resources are configured.
- [ ] Run all Node checks with `node --test worker/test/*.test.js .github/scripts/review-issue-event.test.mjs tests/reviews-ui.test.js`.
- [ ] Validate static HTML/CSS/JS and confirm no secret values or fake reviews are committed.
- [ ] With Cloudflare configured, submit one test review for each category; verify open Issues stay hidden, closing reveals them, reopening hides them, deleting removes the photo, and filters/sorts work.
- [ ] Verify GitHub Pages deployment separately from Worker deployment; report any part blocked by missing account configuration.

---
