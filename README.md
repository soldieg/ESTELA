# ESTELA

Site público de Estela Roschel — Salão de beleza e Ateliê em Parelheiros, São Paulo.

As avaliações recebidas pelo site viram Issues públicos no GitHub para moderação. Somente avaliações fechadas e aprovadas aparecem no site. Veja [worker/README.md](worker/README.md) para configurar a API, o armazenamento privado das fotos e a publicação manual do Worker.

O formulário depende de configurar `reviews-api-url` e `turnstile-site-key` nos quatro HTMLs. Até essa configuração, a lista fica vazia, sem avaliações fictícias, e o envio permanece desativado.
