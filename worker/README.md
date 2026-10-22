# API de avaliações (Cloudflare Worker)

O Worker mantém o token do GitHub fora do navegador, guarda fotos em um bucket R2 privado e fornece ao site apenas avaliações aprovadas. O conteúdo escrito no Issue é público enquanto aguarda a aprovação; fechar o Issue publica a avaliação no site, reabrir a oculta e excluir remove também a foto.

## Configuração inicial

1. Crie um bucket R2 chamado `estela-review-photos` na conta Cloudflare e confirme que o acesso público ao bucket está desativado. Em **Settings → Object Lifecycle Rules**, crie uma regra com prefixo `pending/` para expirar objetos após sete dias. A remoção pode ser processada pelo R2 até 24 horas depois do prazo; isso limpa uploads abandonados sem atingir fotos aprovadas em `approved/`.
2. Crie no painel Cloudflare um Worker chamado `estela-review-api`. O arquivo [wrangler.toml](wrangler.toml) liga o Worker ao bucket.
3. Crie um widget Turnstile para o domínio `soldieg.github.io`. Guarde a chave secreta para o Worker; a site key pública será colocada no HTML.
4. Crie um Fine-grained Personal Access Token do GitHub limitado ao repositório `soldieg/ESTELA`, com permissão **Issues: read and write**.
5. Em **Settings → Secrets and variables → Actions**, adicione estes Repository secrets:

   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `GITHUB_ISSUES_TOKEN`
   - `TURNSTILE_SECRET`
   - `PHOTO_CLEANUP_SECRET` (gere uma string aleatória forte; use o mesmo valor no Worker e no GitHub Actions)

   Para publicação, use um token Cloudflare limitado à edição do Worker existente e acesso necessário ao bucket ligado. Consulte a [documentação de permissões Cloudflare](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) e a [documentação de lifecycle do R2](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
6. Execute manualmente **Actions → Deploy review Worker → Run workflow** na branch `main`. Fotos aprovadas são movidas para `approved/` e não entram na regra de expiração.
7. Depois do deploy, copie a URL `https://estela-review-api.<subdominio-da-conta>.workers.dev`.
8. Em **Settings → Secrets and variables → Actions → Variables**, crie `REVIEW_WORKER_URL` com a URL do Worker, sem barra final. Essa variável permite ao Action mover ou excluir fotos.
9. Em `index.html`, `beleza.html`, `costura.html` e `avaliacoes.html`, preencha `reviews-api-url` com a URL do Worker e `turnstile-site-key` com a chave pública do widget. Publique essas alterações no GitHub Pages.

## Moderação e teste ponta a ponta

- Um formulário válido cria um Issue aberto `[AVALIAÇÃO] ...`; a pessoa que envia não precisa entrar no GitHub.
- O workflow adiciona os rótulos `estela-review` e `review-salao` ou `review-atelie`.
- Issue aberto fica fora do site e a foto continua em `pending/`. Ao fechar, o workflow move a foto para `approved/`; o site mostra a avaliação e a foto. Reabrir o Issue oculta texto e imagem. Excluir o Issue remove as duas possíveis cópias da foto.
- Para testar cada categoria: envie uma avaliação com e sem nome, confirme que ela não aparece enquanto aberta, feche o Issue e confira a listagem; depois reabra e confirme que some. Faça uma avaliação anônima e, se permitido, uma foto de teste.
- Avaliações e comentários dos Issues ficam públicos no GitHub antes da aprovação. O site só exibe Issues fechados com rótulo de avaliação e marcador válido.

## Desenvolvimento local

```powershell
cd worker
npm ci
npm test
```

Os testes da página e do workflow ficam na raiz:

```powershell
node --test worker/test/*.test.js .github/scripts/review-issue-event.test.mjs tests/reviews-ui.test.mjs
```

O Worker não pode ser testado ponta a ponta sem conta Cloudflare, bucket, widget Turnstile e segredos configurados.
