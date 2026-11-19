# Busca automática e Steam: como ligar

O site continua funcionando sem isto. Este guia liga duas coisas:

- **Busca automática** no formulário de adicionar/editar: preenche título, capa e totais (duração, temporadas, episódios, páginas, volumes, total de conquistas).
- **Sincronizar com a Steam**: importa ou atualiza seus jogos com horas, conquistas e platina automática.

Para isso existe um pequeno servidor gratuito na Cloudflare (o *Worker*, arquivo `worker.js`). Ele guarda as chaves das APIs. O site, que é público, nunca vê as chaves, e o Worker só atende quando quem pede está logada como dona do acervo.

Tempo total: uns 20 minutos, uma vez só.

---

## 1. Pegar as chaves

### TMDB (filmes, séries e animações) — obrigatório para esses tipos
1. Crie uma conta em themoviedb.org.
2. Vá em **Configurações → API** e peça uma chave (uso pessoal; pode descrever como "site pessoal de catálogo").
3. Copie o **"Token de Leitura da API"** (API Read Access Token, o texto longo que começa com `eyJ`). A "Chave da API" curta também funciona.

### Steam (jogos e sincronização) — obrigatório para jogos
1. Acesse steamcommunity.com/dev/apikey logada na sua conta.
2. Em "Nome do domínio", coloque o endereço do seu site (ex.: `zejsneto.github.io`). Copie a chave.
3. Descubra seu **SteamID64** (17 dígitos, começa com `7656119`): abra seu perfil na Steam; se a URL for `/profiles/7656119…`, é esse número. Se for um nome personalizado (`/id/seunome`), use um site como steamid.io para converter.
4. **Deixe seus jogos públicos**: Perfil → Editar perfil → Privacidade → **Detalhes de jogos: Público**. Sem isso a Steam não entrega a biblioteca.

### Opcionais
- **Google Books** (livros funcionam sem chave, mas com cota pequena): Google Cloud Console → ative a "Books API" → Credenciais → Criar chave de API.
- **Comic Vine** (melhora a busca de HQs): crie conta em comicvine.gamespot.com e pegue a chave na página da API. Sem ela, HQs usam só o Google Books.

---

## 2. Criar o Worker na Cloudflare

1. Crie uma conta gratuita em dash.cloudflare.com.
2. Vá em **Workers & Pages → Create → Create Worker** (modelo "Hello World"), dê um nome (ex.: `mem-api`) e clique em **Deploy**.
3. Clique em **Edit code**, apague o código de exemplo, cole **todo** o conteúdo de `worker/worker.js` e clique em **Deploy**.
4. Anote o endereço do Worker (algo como `https://mem-api.SEU-USUARIO.workers.dev`).

## 3. Configurar variáveis e chaves

No Worker, vá em **Settings → Variables and Secrets** e adicione:

| Nome | Tipo | Valor |
|---|---|---|
| `ALLOWED_ORIGINS` | Text | `https://zejsneto.github.io` (para testar no PC, acrescente `,http://localhost:8000`) |
| `FIREBASE_PROJECT_ID` | Text | `my-entertainment-manager` |
| `OWNER_UID` | Text | `5z1Csjq7NlNFU1F744kqBkX6WRB3` |
| `TMDB_TOKEN` | **Secret** | token do TMDB |
| `STEAM_KEY` | **Secret** | chave da Steam |
| `STEAM_ID` | **Secret** | seu SteamID64 |
| `GOOGLE_BOOKS_KEY` | **Secret** | (opcional) |
| `COMICVINE_KEY` | **Secret** | (opcional) |

Use o tipo **Secret** para as chaves: depois de salvas, nem você consegue vê-las de novo no painel (só substituir), e elas nunca aparecem no código.

Teste: abra `https://SEU-WORKER.workers.dev/health` no navegador. Deve aparecer `{"error":"origin_not_allowed"}`. Isso é o esperado: o Worker só responde ao seu site.

## 4. Ligar no site

Abra `assets/js/config/api-config.js` e cole o endereço do Worker:

```js
export const API_URL = 'https://mem-api.SEU-USUARIO.workers.dev';
```

Publique no GitHub. Pronto:
- No formulário de adicionar aparece **"Buscar dados automaticamente"**.
- No topo aparece o ícone da **Steam** (só para você, logada).

---

## Como funciona a segurança

- As chaves ficam só na Cloudflare, como Secrets.
- O site manda, junto de cada pedido, o token de login do Firebase. O Worker confere a assinatura desse token com as chaves públicas do Google e só aceita se o usuário for o seu UID. Quem descobrir o endereço do Worker não consegue usá-lo.
- O Worker só responde ao endereço do seu site (`ALLOWED_ORIGINS`).
- O que vai para o banco é o mesmo de sempre: título, capa (link), horas, conquistas. Seu SteamID e suas chaves não são salvos no Firestore nem aparecem no site.

## Limites (plano gratuito)

- 100 mil pedidos por dia, bem acima do que um uso pessoal gasta.
- Conquistas da Steam são lidas em lotes de 40 jogos. Importar 200 jogos leva uns 5 lotes e alguns segundos.

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| "Faça login de novo para usar a busca" | Saia e entre de novo no site. |
| "Este endereço não está liberado no Worker" | Confira `ALLOWED_ORIGINS` (sem barra no final, com `https://`). |
| "deixe Detalhes de jogos como público" | Ajuste a privacidade do perfil Steam (passo 1). |
| "O TMDB não está configurado" | Falta o Secret `TMDB_TOKEN`. |
| Capa de jogo não aparece | Alguns jogos não têm capa vertical na Steam; o site mostra o pôster gerado. Cole outra imagem no campo de link se quiser. |

## Opcional: publicar pela linha de comando

Quem preferir o terminal pode usar o `wrangler.toml` desta pasta:

```bash
npm install -g wrangler
cd worker
wrangler login
wrangler deploy
wrangler secret put TMDB_TOKEN
wrangler secret put STEAM_KEY
wrangler secret put STEAM_ID
```
