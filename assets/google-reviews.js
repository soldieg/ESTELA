const googleReviewSource = "https://www.google.com/maps/place/Salao+De+Manicure+Da+Estela/@-23.8289086,-46.7301332,17z/data=!4m8!3m7!1s0x94ce4965434d6dcd:0x17b5057b20aff41b!8m2!3d-23.8289649!4d-46.730163!9m1!1b1!16s%2Fg%2F11hcds3b78";
const googleReviews = [
  { name: "Dayane Gavioli Silva", rating: 5, date: "3 meses atrás", text: "Vamos mensalmente na Estela, ela faz as unhas num preço bom e muito bem feito" },
  { name: "Kelly Publio", rating: 5, date: "3 anos atrás", text: "Maravilhoso o atendimento e a qualidade do trabalho, sem falar que a Estela é a simpatia em pessoa! Super recomendo." },
  { name: "Iara Maria Gomes da Silva", rating: 5, date: "2 anos atrás", text: "Adoro sou muito bem tratada e acolhida\nBjs" },
  { name: "Tamires Ramos", rating: 5, date: "6 anos atrás", text: "Pessoa simpática dmais." },
  { name: "Vitoria Oliveira", rating: 5, date: "5 anos atrás", text: "Amei o atendimento" },
  { name: "Bruna Madrona", rating: 5, date: "7 anos atrás" },
  { name: "Welington Madrona", rating: 5, date: "7 anos atrás" },
  { name: "Guilherme Lima", rating: 4, date: "7 anos atrás" },
];

function createGoogleReview(review) {
  const card = document.createElement("article");
  card.className = "review-card google-review-card";

  const header = document.createElement("div");
  header.className = "review-card-top";
  const name = document.createElement("span");
  name.className = "review-name";
  name.textContent = review.name;
  const date = document.createElement("span");
  date.className = "review-date";
  date.textContent = review.date;
  header.append(name, date);

  const stars = document.createElement("p");
  stars.className = "review-stars";
  stars.setAttribute("aria-label", `${review.rating} de 5 estrelas`);
  stars.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;

  const comment = document.createElement("p");
  comment.className = review.text ? "review-comment" : "review-comment review-no-comment";
  comment.textContent = review.text || "Avaliação sem comentário escrito.";

  const source = document.createElement("a");
  source.className = "review-google-source";
  source.href = googleReviewSource;
  source.target = "_blank";
  source.rel = "noopener";
  source.textContent = "Google ↗";

  card.append(header, stars, comment, source);
  return card;
}

document.querySelectorAll("[data-google-reviews]").forEach((container) => {
  googleReviews.forEach((review) => container.append(createGoogleReview(review)));
});

document.querySelectorAll("[data-review-carousel]").forEach((carousel) => {
  const track = carousel.querySelector("[data-google-reviews]");
  const previous = carousel.querySelector("[data-review-prev]");
  const next = carousel.querySelector("[data-review-next]");
  const updateControls = () => {
    previous.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
  };

  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  previous.addEventListener("click", () => track.scrollBy({ left: -track.clientWidth * 0.85, behavior }));
  next.addEventListener("click", () => track.scrollBy({ left: track.clientWidth * 0.85, behavior }));
  track.addEventListener("scroll", updateControls, { passive: true });
  window.addEventListener("resize", updateControls);
  updateControls();
});
