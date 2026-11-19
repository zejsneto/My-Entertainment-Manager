# 🍿 My Entertainment Manager

Acervo pessoal de tudo que já assisti, joguei e li: filmes, filmes animados, séries, animações, jogos, livros, mangás e HQs.
Feito só com HTML, CSS e JavaScript (sem build), hospedado no GitHub Pages, com dados no Firebase (Firestore + Auth).

## Como rodar localmente

Os módulos ES (`import`/`export`) não funcionam abrindo o `index.html` direto (`file://`). Use qualquer servidor estático:

```bash
# na pasta do projeto
python -m http.server 8000
# abra http://localhost:8000
```

Para testar o layout sem mexer nos dados reais, abra `http://localhost:8000/?demo=1`.
Isso ativa o **modo demonstração**: carrega `data/demo-media.json`, aceita qualquer login e não salva nada no banco.
O mesmo modo entra sozinho se o Firebase não carregar (sem internet, por exemplo).

## Estrutura

```
index.html                  → estrutura da página e todas as janelas (<dialog>)
assets/
  css/
    tokens.css              → cores (tema escuro e claro), fontes, espaços, animações
    base.css                → reset, foco visível, utilitários
    layout.css              → cabeçalho, barra de ferramentas, rodapé, botão flutuante
    components.css          → botões, campos, chips, selos, toasts
    cards.css               → grade de cards verticais, pôster, skeleton, detalhes
    dialogs.css             → janelas, bottom sheet no celular, formulário
    dashboard.css           → painel de estatísticas
  js/
    main.js                 → ponto de entrada: liga tudo e controla o fluxo
    config/
      media-types.js        → ícone, cor e campos de cada tipo de mídia (fonte da verdade)
      firebase-config.js    → configuração pública do Firebase + UID da dona
      api-config.js         → endereço do Worker da API (vazio = busca e Steam desligadas)
    core/
      state.js              → estado central + pipeline de filtros/ordenação
      stats.js              → regras de negócio: progresso, conquistas, tempo estimado
      i18n.js               → traduções (pt/en)
      format.js             → datas, durações, números
      prefs.js              → preferências no localStorage
      image.js              → recorte e compressão de capas
      dom.js                → utilitários e proteção contra XSS
    services/
      backend.js            → toda a conversa com o Firebase (e o modo demo)
      api.js                → conversa com o Worker (busca de mídias e Steam)
    ui/
      library.js            → grade de cards
      media-view.js         → como cada mídia é descrita (stats do card, linhas dos detalhes)
      details.js            → janela de detalhes
      media-form.js         → formulário único de adicionar/editar
      media-search.js       → busca automática no formulário (TMDB, Steam, AniList, Google Books, Comic Vine)
      steam-sync.js         → janela de sincronização com a Steam
      toolbar.js            → chips, busca, ordenação, filtros aplicados
      filters.js            → filtros avançados
      dashboard.js          → gráficos e listas do dashboard
      achievements.js       → pontos de conquista
      profile.js            → perfil, login, compartilhar
      settings.js           → configurações, tema, backup, zona de perigo
      dialogs.js            → janelas, confirmação e toasts
worker/
  worker.js                 → servidor da API na Cloudflare (guarda as chaves)
  LEIA-ME.md                → passo a passo para ligar a busca e a Steam
  wrangler.toml             → opcional, para publicar pelo terminal
data/
  lang/pt.json, en.json     → textos da interface
  demo-media.json           → dados do modo demonstração
```

O fluxo é sempre o mesmo: **ação do usuário → `setState()` → `render()` → tela atualizada**.
A lista exibida sai de uma única função (`getVisibleMedias` em `core/state.js`), que aplica, nesta ordem:
tipos ativos nas Configurações → chip de tipo → filtros avançados → busca → ordenação.

## Busca automática e Steam

Veja `worker/LEIA-ME.md`. Resumo: publicar `worker/worker.js` na Cloudflare (grátis), cadastrar as chaves lá como Secrets e colar o endereço do Worker em `assets/js/config/api-config.js`.

| Tipo | Fonte | O que preenche |
|---|---|---|
| Filmes | TMDB (pt-BR) | título, capa, duração |
| Séries | TMDB (pt-BR) | título, capa, temporadas e episódios |
| Animações | TMDB (pt-BR) + AniList | título, capa, temporadas/episódios ou duração |
| Jogos | Loja da Steam | título, capa vertical, total de conquistas |
| Livros | Google Books | título, capa, páginas |
| Mangás | AniList | título, capa, volumes |
| HQs | Comic Vine (opcional) + Google Books | título, capa, edições |

Campos pessoais (nota, data, horas jogadas, lidos, assistidos, troféus obtidos) nunca são preenchidos pela busca, e tudo o que a busca preenche pode ser editado.

## Como adicionar um tipo de mídia novo

1. Em `assets/js/config/media-types.js`, inclua o tipo em `PRIMARY_TYPES`, `ALL_TYPES`, `TYPE_GROUPS` e `MEDIA_TYPES` (ícone e cor).
2. Em `assets/css/tokens.css`, crie a cor `--type-<nome>` nos dois temas.
3. Em `data/lang/*.json`, adicione o nome em `types` e `typesPlural`.
4. Se tiver campos próprios, crie um `<fieldset data-types="<nome>">` no formulário (`index.html`) e trate em `collectData`/`fillForm` (`media-form.js`) e em `getProgress` (`stats.js`).

## Segurança

- A `apiKey` do Firebase no código **não é segredo**; todo app web do Firebase a expõe.
- Quem protege os dados são as **Regras do Firestore**: leitura pública e escrita apenas para o UID da dona.
- Títulos e textos são escapados antes de entrar no HTML (`escapeHtml`) e URLs de capa são validadas (`safeImageSrc`).

## Referências de design usadas

WCAG 2.2 (contraste, alvo de toque, foco visível), WAI-ARIA Authoring Practices (diálogos), Material Design 3 (movimento, tema escuro, chips, FAB), Apple HIG (botões e ações destrutivas), Nielsen Norman Group (estados vazios, skeleton, bottom sheets, fechamento acidental de janelas), Baymard Institute (filtros aplicados), web.dev (lazy loading e `prefers-reduced-motion`), Refactoring UI (escalas de tipografia e espaço) e padrões de Letterboxd/Backloggd para a grade de pôsteres.
