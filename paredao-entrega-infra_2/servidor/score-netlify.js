// Função serverless que recebe a pontuação do jogo, valida e grava no Google Forms.
// Deploy: Netlify (gratuito). Variáveis de ambiente necessárias (Site settings → Environment variables):
//   FORM_URL      = https://docs.google.com/forms/d/e/SEU_ID/formResponse
//   FIELD_NAME    = entry.1855828587
//   FIELD_EMAIL   = entry.1633601896
//   FIELD_SCORE   = entry.1337995518
//   SECRET        = uma frase secreta longa e aleatória (você inventa)
//   ALLOWED_ORIGIN= https://seudominio.com   (o endereço onde o jogo está hospedado)

const crypto = require('crypto');

const LIMITE_ABSURDO = 5000;      // sem teto de pontuação: barra só valores digitados na marra
const MIN_MS_POR_DEFESA = 1500;      // cada defesa exige pelo menos 1,5s de jogo real
const JANELA_TOKEN_MS = 2 * 60 * 60 * 1000;
const memoria = new Map();           // controle simples de repetição por IP

function assina(payload, secret){
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
function cabecalhos(origin){
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json'
  };
}

exports.handler = async (event) => {
  const origem = process.env.ALLOWED_ORIGIN || '*';
  const H = cabecalhos(origem);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  const secret = process.env.SECRET;
  if (!secret) return { statusCode: 500, headers: H, body: JSON.stringify({erro:'SECRET não configurado'}) };

  // 1) Início da partida: entrega um token assinado com a hora do SERVIDOR
  if (event.httpMethod === 'GET') {
    const t = Date.now();
    return { statusCode: 200, headers: H, body: JSON.stringify({ token: t + '.' + assina(String(t), secret) }) };
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: '{}' };

  // Só aceita chamadas vindas do site oficial do jogo
  const reqOrigin = (event.headers.origin || event.headers.Origin || '');
  if (origem !== '*' && reqOrigin !== origem) {
    return { statusCode: 403, headers: H, body: JSON.stringify({erro:'origem não autorizada'}) };
  }

  let dados;
  try { dados = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: H, body: JSON.stringify({erro:'json inválido'}) }; }

  const nome = String(dados.nome || '').trim().slice(0, 40);
  const email = String(dados.email || '').trim().slice(0, 120);
  const pontuacao = Number(dados.pontuacao);

  if (nome.length < 2) return { statusCode: 400, headers: H, body: JSON.stringify({erro:'nome inválido'}) };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { statusCode: 400, headers: H, body: JSON.stringify({erro:'email inválido'}) };
  if (!Number.isInteger(pontuacao) || pontuacao < 0 || pontuacao > LIMITE_ABSURDO) {
    return { statusCode: 400, headers: H, body: JSON.stringify({erro:'pontuação implausível'}) };
  }

  // 2) Valida o token: ele prova quando a partida começou, segundo o servidor
  const [tsStr, assinatura] = String(dados.token || '').split('.');
  const ts = Number(tsStr);
  if (!ts || assina(String(ts), secret) !== assinatura) {
    return { statusCode: 400, headers: H, body: JSON.stringify({erro:'token inválido'}) };
  }
  const decorrido = Date.now() - ts;
  if (decorrido < 0 || decorrido > JANELA_TOKEN_MS) {
    return { statusCode: 400, headers: H, body: JSON.stringify({erro:'token expirado'}) };
  }
  // 3) Tempo mínimo compatível com a pontuação — impede placar instantâneo
  if (pontuacao > 3 && decorrido < pontuacao * MIN_MS_POR_DEFESA) {
    return { statusCode: 400, headers: H, body: JSON.stringify({erro:'tempo incompatível com a pontuação'}) };
  }

  // 4) Limite por IP: no máximo 10 envios por hora
  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'sem-ip';
  const agora = Date.now();
  const registro = (memoria.get(ip) || []).filter(t => agora - t < 60 * 60 * 1000);
  if (registro.length >= 10) {
    return { statusCode: 429, headers: H, body: JSON.stringify({erro:'muitos envios'}) };
  }
  registro.push(agora); memoria.set(ip, registro);

  // 5) Grava no formulário (a URL fica só aqui no servidor, nunca no navegador)
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
  } catch (e) {
    return { statusCode: 502, headers: H, body: JSON.stringify({erro:'falha ao gravar'}) };
  }

  return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
};
