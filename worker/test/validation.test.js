import assert from "node:assert/strict";
import { test } from "node:test";

let validateReview;
let escapeIssueText;
try {
  ({ validateReview, escapeIssueText } = await import("../src/validation.js"));
} catch {
  // Keep the RED run an assertion failure until the production module exists.
}

function validForm(overrides = {}) {
  const form = new FormData();
  form.set("category", "salon");
  form.set("rating", "4");
  form.set("comment", "Gostei muito do atendimento.");
  form.set("name", "Ana");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

test("accepts salão reviews and normalizes the rating", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  const result = await validateReview(validForm());
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    category: "salon",
    rating: 4,
    name: "Ana",
    anonymous: false,
    comment: "Gostei muito do atendimento.",
    photo: null,
  });
});

test("accepts ateliê as the second allowed category", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  const result = await validateReview(validForm({ category: "atelier" }));
  assert.equal(result.ok, true);
  assert.equal(result.value.category, "atelier");
});

test("accepts every integer rating from zero through five", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  for (let rating = 0; rating <= 5; rating += 1) {
    const result = await validateReview(validForm({ rating: String(rating) }));
    assert.equal(result.ok, true, `rating ${rating} should be valid`);
    assert.equal(result.value.rating, rating);
  }
});

test("rejects ratings outside zero through five and non-integers", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  for (const rating of ["-1", "6", "1.5", "abc"]) {
    assert.equal((await validateReview(validForm({ rating }))).ok, false, `${rating} should fail`);
  }
});

test("rejects unknown categories", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  assert.equal((await validateReview(validForm({ category: "other" }))).ok, false);
});

test("rejects an empty comment", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  assert.equal((await validateReview(validForm({ comment: "   " }))).ok, false);
});

test("rejects comments longer than one thousand characters", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  assert.equal((await validateReview(validForm({ comment: "x".repeat(1001) }))).ok, false);
});

test("trims a provided display name", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  const result = await validateReview(validForm({ name: "  Ana  " }));
  assert.equal(result.value.name, "Ana");
});

test("rejects display names longer than sixty characters", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  assert.equal((await validateReview(validForm({ name: "x".repeat(61) }))).ok, false);
});

test("omits the typed name from anonymous reviews", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  const result = await validateReview(validForm({ name: "Segredo", anonymous: "on" }));
  assert.equal(result.ok, true);
  assert.equal(result.value.name, "");
  assert.equal(result.value.anonymous, true);
});

test("accepts a JPEG image with matching signature", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  const form = validForm();
  form.set("photo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "photo.jpg", { type: "image/jpeg" }));
  const result = await validateReview(form);
  assert.equal(result.ok, true);
  assert.equal(result.value.photo.type, "image/jpeg");
});

test("accepts PNG and WebP images with matching signatures", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "photo.png", { type: "image/png" });
  const webp = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])], "photo.webp", { type: "image/webp" });
  for (const photo of [png, webp]) {
    const form = validForm();
    form.set("photo", photo);
    assert.equal((await validateReview(form)).ok, true);
  }
});

test("rejects a forged image MIME type", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  const form = validForm();
  form.set("photo", new File(["not an image"], "photo.jpg", { type: "image/jpeg" }));
  assert.equal((await validateReview(form)).ok, false);
});

test("rejects SVG and image uploads larger than five megabytes", async () => {
  assert.equal(typeof validateReview, "function", "validateReview must be implemented");
  const svg = new File(["<svg></svg>"], "photo.svg", { type: "image/svg+xml" });
  const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "photo.jpg", { type: "image/jpeg" });
  for (const photo of [svg, oversized]) {
    const form = validForm();
    form.set("photo", photo);
    assert.equal((await validateReview(form)).ok, false);
  }
});

test("escapes markdown and HTML-looking visitor text", () => {
  assert.equal(typeof escapeIssueText, "function", "escapeIssueText must be implemented");
  const result = escapeIssueText("**oi** <script>alert(1)</script> [link](https://example.com)");
  assert.equal(result.includes("<script>"), false);
  assert.equal(result.includes("[link]"), false);
  assert.equal(result.includes("**oi**"), false);
});
