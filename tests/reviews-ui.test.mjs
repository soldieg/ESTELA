import assert from "node:assert/strict";
import { test } from "node:test";
import { filterAndSortReviews, renderReviewText } from "../assets/reviews.js";

const reviews = [
  { id: 1, category: "salon", rating: 5, createdAt: "2026-10-20T10:00:00Z", comment: "melhor" },
  { id: 2, category: "atelier", rating: 3, createdAt: "2026-10-22T10:00:00Z", comment: "bom" },
  { id: 3, category: "salon", rating: 5, createdAt: "2026-10-21T10:00:00Z", comment: "ótimo" },
];

test("filters by category and rating without changing the original list", () => {
  const result = filterAndSortReviews(reviews, { category: "salon", rating: "5", sort: "newest" });
  assert.deepEqual(result.map((review) => review.id), [3, 1]);
  assert.equal(reviews[0].id, 1);
});

test("sorts newest, oldest, and highest rated with newest ties first", () => {
  assert.deepEqual(filterAndSortReviews(reviews, { sort: "newest" }).map((r) => r.id), [2, 3, 1]);
  assert.deepEqual(filterAndSortReviews(reviews, { sort: "oldest" }).map((r) => r.id), [1, 3, 2]);
  assert.deepEqual(filterAndSortReviews(reviews, { sort: "highest" }).map((r) => r.id), [3, 1, 2]);
});

test("writes visitor text as text content, never as HTML", () => {
  const node = { textContent: "", innerHTML: "unchanged" };
  renderReviewText(node, "<img src=x onerror=alert(1)> **opinião**");
  assert.equal(node.textContent, "<img src=x onerror=alert(1)> **opinião**");
  assert.equal(node.innerHTML, "unchanged");
});
