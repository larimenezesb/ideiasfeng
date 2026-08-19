# Jogo "Fábio, o Paredão" — pacote de publicação

Ativação do **Sócio Futebol** (Fluminense). O jogo é uma página única, sem framework e sem build.

---

## 1. O que precisa ser publicado

### Obrigatório

| Arquivo | O que é | Onde vai |
|---|---|---|
| `index.html` | O jogo inteiro (HTML + CSS + JS + fontes + logo, tudo embutido) | Servir como página estática, ex.: `https://nense.com.br/paredao/` |

Só isso já coloca o jogo no ar. Não precisa de Node, banco, CDN nem dependências.
Requisito único: **servir por HTTPS** (sem isso o ranking não carrega, o áudio não toca no
celular e o compartilhamento em story não abre).

### Recomendado (antifraude)

| Arquivo | O que é |
|---|---|
| `servidor/score-express.js` | Endpoint Node/Express — use se a Infra roda Node em servidor próprio |
| `servidor/score-netlify.js` | Mesma lógica em função serverless — use se for Netlify/Vercel |
| `netlify.toml` | Configuração, **somente** se a escolha for Netlify |

Escolher **um** dos dois arquivos de servidor, não os dois.

---

## 2. Por que o antifraude é necessário

O jogo roda no navegador do torcedor. Para gravar a pontuação, o endereço de destino precisa estar
no código da página — e qualquer pessoa lê esse código. Já aconteceu de enviarem uma pontuação de
99999999999999 direto para o destino, sem abrir o jogo.

O endpoint resolve isso porque:

- entrega um **token assinado (HMAC-SHA256) com a hora do servidor** no início da partida;
- ao receber a pontuação, exige que o tempo decorrido seja compatível (≥ 1,5s por defesa) — placar
  instantâneo é rejeitado;
- valida faixa de pontuação, nome e e-mail;
- aceita apenas requisições vindas da origem oficial (CORS restrito);
- limita a 10 envios por hora por IP;
- **mantém o destino de gravação apenas no servidor**, fora do código da página.

Não há teto de pontuação: o critério é tempo compatível, então quem jogar muito bem não é penalizado.

---

## 3. Variáveis de ambiente do endpoint

Nunca versionar estes valores em repositório.

| Variável | Valor |
|---|---|
| `FORM_URL` | `https://docs.google.com/forms/d/e/1FAIpQLScnnhK8aPXIJesGh_InuZ73HIgcgE2whmym9XdMPVb6wP3cfw/formResponse` |
| `FIELD_NAME` | `entry.1855828587` |
| `FIELD_EMAIL` | `entry.1633601896` |
| `FIELD_SCORE` | `entry.1337995518` |
| `SECRET` | gerar uma string longa e aleatória (ex.: `openssl rand -hex 32`) |
| `ALLOWED_ORIGIN` | origem pública do jogo, ex.: `https://nense.com.br` |

> Hoje o destino é um Google Forms que grava numa planilha. Se a Infra preferir gravar em banco
> próprio, basta trocar o trecho final do endpoint (o `fetch` para `FORM_URL`) pela escrita no banco —
> toda a validação continua valendo. Recomendado a médio prazo.

**Endpoints expostos:** `GET /api/score` (devolve o token) e `POST /api/score` (recebe
`{nome, email, pontuacao, duracao, token}`).

---

## 4. Ajustes no `index.html` antes de publicar

Abrir o arquivo e localizar o bloco `const CONFIG = {` (logo no início do `<script>`):

1. **Ligar o antifraude** — preencher com o caminho público do endpoint:
   ```js
   SCORE_ENDPOINT: '/api/score',
   ```
2. **Limpar as credenciais da página** — depois que o endpoint estiver no ar, esvaziar os quatro
   campos dentro de `RANKING`, pois quem grava passa a ser o servidor:
   ```js
   FORM_URL: '', FIELD_NAME: '', FIELD_EMAIL: '', FIELD_SCORE: '',
   ```
   ⚠️ **Manter `SHEET_CSV_URL` preenchido** — é a leitura pública do Top 10 (só nome parcial e
   pontuação) e não expõe e-mails.
3. **Métricas** — o **Google Tag Manager do Sócio Futebol já está instalado** no `<head>`, com os
   dois contêineres (`GTM-KRDKGDP` e `GTM-P6DV2R94`) apontando para `gtm.nense.com.br`, mais os
   `noscript` no início do `<body>`. Não é preciso mexer.
   Opcionalmente, para enviar ao GA4 sem passar pelo GTM, preencher:
   ```js
   ANALYTICS: { GA4_ID: 'G-XXXXXXXXXX' },
   ```

Nada mais no arquivo precisa ser editado.

### Eventos disponíveis no dataLayer (para configurar tags no GTM)

Cada ação relevante do jogo é empurrada para o `dataLayer` com o nome do evento em `event`:

`jogo_aberto`, `historia_iniciada`, `partida_iniciada`, `classificou`, `derrota`, `viu_cupom`,
**`clique_socio`** (conversão principal, com `origem`), `lendario_iniciado`, `lendario_fim`
(com `defesas`, `nivel`, `recorde`), `form_ranking_aberto`, **`cadastro_ranking`** (lead, com
`pontuacao`), `viu_ranking`, `compartilhou_x`, `compartilhou_story`, `pontuacao_rejeitada`.

Basta criar no GTM gatilhos do tipo "Evento personalizado" com esses nomes.

---

## 5. Integrações já configuradas

- **Botões "Seja Sócio Futebol"** → `https://nense.com.br/planos?utm_source=jogo_fabio&utm_medium=game&utm_campaign=aquisicao_socio`
- **Política de Privacidade** → `https://nense.com.br/politica-de-privacidade`
- **Ranking (leitura pública)** → CSV publicado com nome parcial (`L*****a`) e pontuação. E-mails
  ficam apenas na planilha privada.
- **Cupom** exibido na vitória: `CLASSIFICADOS` (20% OFF) — precisa existir no sistema de adesão.

---

## 6. Checklist de validação após publicar

- [ ] Página abre em HTTPS no celular e no desktop
- [ ] Som funciona após o primeiro toque (iPhone: conferir com o modo silencioso desligado)
- [ ] "Ver Ranking" carrega o Top 10
- [ ] Cadastro no ranking grava na planilha
- [ ] Pontuação forjada é rejeitada (`POST /api/score` sem token válido deve retornar 400)
- [ ] "Compartilhar no story" abre a folha de compartilhamento com a imagem
- [ ] Botão de sócio abre a página de planos com as UTMs preservadas
- [ ] Eventos aparecendo no GA4 em tempo real
