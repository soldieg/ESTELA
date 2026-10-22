document.querySelectorAll("[data-copy-address]").forEach((button) => {
  let toastTimer;
  button.addEventListener("click", async () => {
    const toast = button.parentElement.querySelector(".copy-toast");
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(button.dataset.copyAddress);
      } else {
        const field = document.createElement("textarea");
        field.value = button.dataset.copyAddress;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("copy failed");
      }
      toast.textContent = "Endereço copiado!";
    } catch {
      toast.textContent = "Não foi possível copiar. Selecione o destino manualmente.";
    }
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("is-visible");
      toast.textContent = "";
    }, 2200);
  });
});
