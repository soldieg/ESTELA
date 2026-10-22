document.querySelectorAll("[data-copy-address]").forEach((button) => {
  button.addEventListener("click", async () => {
    const status = button.querySelector(".copy-status");
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
      status.textContent = "Endereço copiado!";
    } catch {
      status.textContent = "Não foi possível copiar. Selecione o endereço manualmente.";
    }
  });
});
