export function filterAndSortReviews(reviews, { category = "all", rating = "all", sort = "newest" } = {}) {
  return [...reviews]
    .filter((review) => (category === "all" || review.category === category) && (rating === "all" || String(review.rating) === String(rating)))
    .sort((a, b) => {
      if (sort === "highest" && b.rating !== a.rating) return b.rating - a.rating;
      const delta = new Date(b.createdAt) - new Date(a.createdAt);
      return sort === "oldest" ? -delta : delta;
    });
}

export function renderReviewText(node, value) {
  node.textContent = String(value ?? "");
}

const categoryNames = { salon: "Salão de beleza", atelier: "Ateliê" };
const ratingNames = ["Muito insatisfeito", "Tive um problema", "Abaixo do esperado", "Bom", "Muito bom", "Excelente"];
const apiBase = typeof document === "undefined" ? "" : document.querySelector('meta[name="reviews-api-url"]')?.content.trim().replace(/\/$/, "");
const siteKey = typeof document === "undefined" ? "" : document.querySelector('meta[name="turnstile-site-key"]')?.content.trim();
let allReviews = [];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) renderReviewText(node, text);
  return node;
}

function reviewCard(review) {
  const article = element("article", "review-card");
  const top = element("div", "review-card-top");
  const name = element("strong", "review-name", review.anonymous ? "Anônimo" : review.name || "Cliente");
  const date = element("time", "review-date", new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(review.createdAt)));
  date.dateTime = review.createdAt;
  top.append(name, date);
  const rating = element("p", "review-stars", `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`);
  rating.setAttribute("aria-label", `${review.rating} de 5 estrelas — ${ratingNames[review.rating]}`);
  const category = element("p", "review-category", categoryNames[review.category] || "Avaliação");
  const comment = element("p", "review-comment", review.comment);
  article.append(top, rating, category, comment);
  if (review.photoUrl) {
    const photo = document.createElement("img");
    photo.className = "review-photo";
    photo.src = review.photoUrl;
    photo.alt = `Foto enviada por ${review.anonymous ? "cliente anônimo" : review.name || "cliente"}`;
    photo.loading = "lazy";
    article.append(photo);
  }
  return article;
}

function renderLists() {
  document.querySelectorAll("[data-review-list]").forEach((list) => {
    const category = list.dataset.reviewList || "all";
    const subset = filterAndSortReviews(allReviews, { category, sort: "newest" }).slice(0, 3);
    list.replaceChildren(...subset.map(reviewCard));
    const empty = list.parentElement.querySelector("[data-review-empty]");
    if (empty) empty.hidden = subset.length > 0;
  });
}

async function loadReviews() {
  const status = document.querySelector("[data-reviews-status]");
  if (!apiBase) {
    if (status) renderReviewText(status, "As avaliações aparecerão aqui quando o serviço de avaliações for configurado.");
    return;
  }
  try {
    const response = await fetch(`${apiBase}/api/reviews`);
    if (!response.ok) throw new Error("unavailable");
    const data = await response.json();
    allReviews = Array.isArray(data.reviews) ? data.reviews.filter((review) => {
      if (!review || !["salon", "atelier"].includes(review.category) || !Number.isInteger(review.rating) || review.rating < 0 || review.rating > 5 || typeof review.comment !== "string") return false;
      if (!review.photoUrl) return true;
      try { return new URL(review.photoUrl).origin === new URL(apiBase).origin && /^\/api\/reviews\/\d+\/photo$/.test(new URL(review.photoUrl).pathname); }
      catch { return false; }
    }) : [];
    renderLists();
    renderReviewPage();
    if (status) renderReviewText(status, "");
  } catch {
    if (status) renderReviewText(status, "Não foi possível carregar as avaliações agora.");
  }
}

function renderReviewPage() {
  const list = document.querySelector("[data-all-reviews]");
  if (!list) return;
  const filters = {
    category: document.querySelector("#filter-category").value,
    rating: document.querySelector("#filter-rating").value,
    sort: document.querySelector("#sort-reviews").value,
  };
  const filtered = filterAndSortReviews(allReviews, filters);
  list.replaceChildren(...filtered.map(reviewCard));
  const empty = document.querySelector("[data-review-empty]");
  if (empty) empty.hidden = filtered.length > 0;
}

function setupReviewPage() {
  const form = document.querySelector("#review-form");
  if (!form) return;
  const status = document.querySelector("#form-status");
  const name = form.querySelector('[name="name"]');
  const anonymous = form.querySelector('[name="anonymous"]');
  anonymous.addEventListener("change", () => { name.disabled = anonymous.checked; if (anonymous.checked) name.value = ""; });
  document.querySelectorAll("#filter-category, #filter-rating, #sort-reviews").forEach((control) => control.addEventListener("change", renderReviewPage));
  const requestedCategory = new URLSearchParams(location.search).get("categoria");
  if (["salon", "atelier"].includes(requestedCategory)) {
    document.querySelector("#filter-category").value = requestedCategory;
    form.elements.category.value = requestedCategory;
  }
  const apiStatus = document.querySelector("#form-config-status");
  const submit = form.querySelector('button[type="submit"]');
  if (!apiBase || !siteKey) {
    renderReviewText(apiStatus, "O envio será ativado depois da configuração do serviço de avaliações.");
    submit.disabled = true;
    form.querySelectorAll("input, select, textarea").forEach((field) => { field.disabled = true; });
    return;
  }
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  script.onload = () => window.turnstile.render("#turnstile-widget", {
    sitekey: siteKey,
    callback: (token) => { form.elements.turnstileToken.value = token; },
    "expired-callback": () => { form.elements.turnstileToken.value = ""; },
    "error-callback": () => { form.elements.turnstileToken.value = ""; },
  });
  script.onerror = () => renderReviewText(apiStatus, "Não foi possível carregar a verificação antispam. Tente novamente mais tarde.");
  document.head.append(script);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.elements.turnstileToken.value) { renderReviewText(status, "Confirme a verificação antispam antes de enviar."); return; }
    submit.disabled = true;
    renderReviewText(status, "Enviando sua avaliação…");
    try {
      const response = await fetch(`${apiBase}/api/reviews`, { method: "POST", body: new FormData(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "submission_failed");
      form.reset();
      name.disabled = false;
      window.turnstile.reset();
      renderReviewText(status, result.message || "Avaliação enviada para análise.");
    } catch (error) {
      const messages = { verification: "A verificação expirou. Tente novamente.", submission_failed: "Não foi possível enviar. Tente novamente mais tarde.", photo_storage: "Não foi possível guardar a foto. Tente novamente." };
      renderReviewText(status, messages[error.message] || "Não foi possível enviar sua avaliação. Confira os campos e tente novamente.");
      if (window.turnstile) window.turnstile.reset();
      form.elements.turnstileToken.value = "";
    } finally { submit.disabled = false; }
  });
}

if (typeof document !== "undefined") {
  setupReviewPage();
  loadReviews();
}
