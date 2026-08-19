/**
 * Endpoint de pontuação do jogo "Fábio, o Paredão" — versão Node.js / Express.
 * Use esta versão se a infraestrutura já roda Node em servidor próprio.
 * (Se for Netlify/Vercel, use o arquivo score-netlify.js.)
 *
 * Instalar:  npm i express
 * Rodar:     node score-express.js
 *
 * Variáveis de ambiente obrigatórias:
 *   FORM_URL       destino onde a pontuação é gravada (ver LEIA-ME)
 *   FIELD_NAME     identificador do campo nome
 *   FIELD_EMAIL    identificador do campo e-mail
 *   FIELD_SCORE    identificador do campo pontuação
 *   SECRET         segredo longo e aleatório, gerado pela Infra
 *   ALLOWED_ORIGIN endereço público do jogo (ex.: https://nense.com.br)
 */
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '8kb' }));

const LIMITE_ABSURDO = 5000;       // sem teto de jogo: barra só valores forjados
const MIN_MS_POR_DEFESA = 1500;    // cada defesa exige 1,5s de jogo real
const JANELA_TOKEN_MS = 2 * 60 * 60 * 1000;
const porIp = new Map();

const assina = (txt) => crypto.createHmac('sha256', process.env.SECRET).update(txt).digest('hex');

app.use((req, res, next) => {
  const origem = process.env.ALLOWED_ORIGIN || '*';
  res.set('Access-Control-Allow-Origin', origem);
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 1) Início da partida: token assinado com a hora do SERVIDOR
app.get('/api/score', (_req, res) => {
  const t = Date.now();
  res.json({ token: `${t}.${assina(String(t))}` });
});

// 2) Envio da pontuação
app.post('/api/score', async (req, res) => {
  const origem = process.env.ALLOWED_ORIGIN;
  if (origem && origem !== '*' && req.get('origin') !== origem) {
    return res.status(403).json({ erro: 'origem não autorizada' });
  }

  const nome = String(req.body?.nome || '').trim().slice(0, 40);
  const email = String(req.body?.email || '').trim().slice(0, 120);
  const pontuacao = Number(req.body?.pontuacao);

  if (nome.length < 2) return res.status(400).json({ erro: 'nome inválido' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ erro: 'email inválido' });
  if (!Number.isInteger(pontuacao) || pontuacao < 0 || pontuacao > LIMITE_ABSURDO) {
    return res.status(400).json({ erro: 'pontuação implausível' });
  }

  const [tsStr, assinatura] = String(req.body?.token || '').split('.');
  const ts = Number(tsStr);
  if (!ts || assina(String(ts)) !== assinatura) return res.status(400).json({ erro: 'token inválido' });

  const decorrido = Date.now() - ts;
  if (decorrido < 0 || decorrido > JANELA_TOKEN_MS) return res.status(400).json({ erro: 'token expirado' });
  if (pontuacao > 3 && decorrido < pontuacao * MIN_MS_POR_DEFESA) {
    return res.status(400).json({ erro: 'tempo incompatível com a pontuação' });
  }

  const ip = req.ip || 'sem-ip';
  const agora = Date.now();
  const hist = (porIp.get(ip) || []).filter(t => agora - t < 3600000);
  if (hist.length >= 10) return res.status(429).json({ erro: 'muitos envios' });
  hist.push(agora); porIp.set(ip, hist);

  const corpo = new URLSearchParams();
  corpo.append(process.env.FIELD_NAME, nome);
  corpo.append(process.env.FIELD_EMAIL, email);
  corpo.append(process.env.FIELD_SCORE, String(pontuacao));
  try {
    await fetch(process.env.FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo.toString()
    });
  } catch {
    return res.status(502).json({ erro: 'falha ao gravar' });
  }
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3000);
