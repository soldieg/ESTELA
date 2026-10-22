# ESTELA — avaliações moderadas pelo GitHub

**Status:** proposta para revisão; ainda não implementada.  
**Repositório:** `soldieg/ESTELA`, público; site estático no GitHub Pages.  
**Objetivo:** receber avaliações no próprio site, guardar cada envio como Issue público e exibir no site apenas as avaliações que Estela aprovar fechando o Issue.

## Decisões

- Categorias: **Salão de beleza** e **Ateliê**.
- Nota: inteiro de 0 a 5. Zero significa “muito insatisfeito/sem estrelas”; 1 “tive um problema”; 2 “abaixo do esperado”; 3 “bom”; 4 “muito bom”; 5 “excelente”. Cada opção será identificada por texto, além das estrelas, para acessibilidade.
- Nome opcional e opção “Enviar anonimamente”. No modo anônimo, o nome informado não é incluído no Issue nem mostrado no site.
- Comentário obrigatório; uma foto opcional.
- Issue aberto = aguardando moderação e não aparece no site. Issue fechado = aprovado e aparece. Reabrir remove a avaliação da vitrine. Issue excluído deixa de ser exibido.
- Issues e comentários são públicos desde a criação. “Anônimo” oculta o nome informado, mas não torna o Issue privado; Issues criados pela integração mostram a conta GitHub proprietária do token, não a conta do visitante.

## Componentes e fluxo

1. O formulário na página de avaliações envia os campos por HTTPS a um endpoint do Cloudflare Worker. O navegador nunca recebe o token do GitHub.
2. O Worker valida origem, campos permitidos, categoria, nota, tamanho do comentário e formato/tamanho da foto; valida também um token Turnstile no servidor para reduzir spam.
3. Se houver foto, o Worker guarda o arquivo num bucket privado Cloudflare R2, com identificador aleatório e validação de tipo/tamanho. O Issue guarda apenas os dados da avaliação e o identificador da foto.
4. O Worker usa um token GitHub de escopo mínimo, guardado como segredo, para criar um Issue com título `[AVALIAÇÃO] Salão` ou `[AVALIAÇÃO] Ateliê` e corpo estruturado. O token precisa apenas da permissão de escrita em Issues no repositório. O formulário confirma o recebimento e não revela a URL privada de moderação.
5. Um GitHub Action acionado em `issues.opened` adiciona um marcador de avaliação e a categoria. O endpoint público de listagem busca apenas Issues fechados que tenham o marcador; isso evita exibir Issues fechados que não sejam avaliações. O site oferece filtros por categoria e nota, ordenação por mais recentes, mais antigas e melhor avaliadas, e estados de carregamento/erro/nenhuma avaliação.
6. A foto só é entregue pelo Worker depois que o Issue correspondente estiver fechado e contiver o identificador da foto. Assim, a imagem não aparece antes da aprovação. A exclusão do Issue impede novas entregas da imagem; objetos órfãos precisam de uma regra de expiração no R2.
7. O conteúdo textual do Issue permanece público durante a moderação. Remover do site ao reabrir/excluir não apaga cópias ou capturas feitas por terceiros.

## Limites e tratamento de falhas

- Se Turnstile, GitHub ou armazenamento falhar, o Worker não confirma sucesso; a interface informa que o envio não foi concluído e permite tentar novamente.
- O token GitHub e o segredo Turnstile ficam em variáveis secretas do Worker; apenas a chave pública do widget Turnstile pode ir no HTML.
- A resposta da API pública será validada e armazenada em cache por período curto no Worker. O site renderiza texto como texto (não HTML), limita resultados e não incorpora campos arbitrários.
- Para o primeiro teste, limitar foto a JPEG, PNG ou WebP, uma imagem por envio, até 5 MB. SVG e outros formatos são recusados.
- O formulário informa antes do envio que avaliação, categoria, nota e nome informado (se houver) ficam visíveis publicamente no GitHub. A imagem só fica acessível no site após aprovação.

## Fora deste escopo

Não publicar avaliações por conta própria em X, não exigir conta GitHub do visitante, não coletar telefone/e-mail, não oferecer respostas do estabelecimento nem editar avaliação depois do envio. Não há avaliações fictícias de demonstração.

## Critérios de aceite

- Um envio válido pelo site cria um Issue aberto na categoria correta; nenhuma credencial aparece no HTML, JavaScript ou rede do navegador.
- Envio anônimo não inclui o nome digitado no conteúdo do Issue nem no site.
- Issues abertos não aparecem na vitrine nem liberam a foto; fechar um Issue válido o torna visível e libera a foto; reabrir ou excluir remove o conteúdo da vitrine.
- Filtros e ordenações respeitam categoria, nota e data, sem renderizar conteúdo do comentário como HTML.
- Entradas inválidas, excesso de tamanho, formato de foto recusado e falha de antirobô não criam Issue.
- O teste cobre o caminho aprovado, pendente, reaberto, excluído e envio inválido.

## Dependências para publicar e testar ponta a ponta

Será necessário um projeto Cloudflare Workers, bucket R2, widget Turnstile e seus segredos configurados fora do código. O código-fonte e a configuração sem segredos ficam versionados em `soldieg/ESTELA`. A disponibilidade e cobrança dos serviços externos devem ser confirmadas no momento da configuração.
