'use strict';

// Integração com o Acesso Hub (ver ACESSO-HUB-INTEGRACAO.md na raiz do projeto).
// HUB_SESSION_TOKEN precisa estar configurado como variável de ambiente na Vercel
// (Project Settings -> Environment Variables) - nunca commitado no repositório.

const HUB_BASE = 'https://hub.acessomarketing.com.br/api/trpc/';

async function chamarBatch(token, procedures, inputs) {
  const body = {};
  procedures.forEach((_, i) => {
    const v = inputs[i];
    body[i] = v === undefined ? { json: null, meta: { values: ['undefined'] } } : { json: v };
  });
  const url = HUB_BASE + procedures.join(',') + '?batch=1&input=' + encodeURIComponent(JSON.stringify(body));
  const r = await fetch(url, { headers: { Accept: 'application/json', Cookie: 'local_session_id=' + token } });
  if (!r.ok) throw new Error('Hub ' + r.status + ': ' + (await r.text()).slice(0, 220));
  const arr = await r.json();
  return arr.map((item, i) => {
    if (item && item.error) throw new Error('Hub [' + procedures[i] + ']: ' + (item.error.json && item.error.json.message));
    return item && item.result && item.result.data ? item.result.data.json : null;
  });
}

function tokenExpiryInfo(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (!payload.exp) return null;
    const expiresAt = new Date(payload.exp * 1000);
    const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86400000);
    return { expiresAt: expiresAt.toISOString(), daysLeft, warning: daysLeft <= 7 };
  } catch (e) {
    return null;
  }
}

function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Soma metaLeads/orcamento entre as campanhas de um cliente, respeitando a
// distincao null (sem linha no Hub, nao entra na soma) vs 0 (valor real).
// So retorna null no total se NENHUMA campanha do cliente tiver dado.
async function metasDoCliente(token, campaignIds, month) {
  let leadSum = null;
  let orcamentoSum = null;
  for (const campaignId of campaignIds) {
    const [stages, budget] = await chamarBatch(
      token,
      ['funnelStages.list', 'budget.forCampaigns'],
      [{ campaignId, month }, { campaignIds: [campaignId], month }]
    );
    const lead = Array.isArray(stages) ? stages.find(s => s.stageKey === 'lead') : null;
    if (lead) {
      leadSum = (leadSum || 0) + Math.round(Number(lead.projetado) || 0);
    }
    const b = budget && budget.byCampaign && budget.byCampaign[String(campaignId)];
    if (b) {
      orcamentoSum = (orcamentoSum || 0) + (Number(b.budgetCadastrado) || 0);
    }
  }
  return { metaLeads: leadSum, orcamento: orcamentoSum };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const token = process.env.HUB_SESSION_TOKEN;
  if (!token) {
    res.status(200).json({ ok: false, error: 'HUB_SESSION_TOKEN não configurado nas variáveis de ambiente da Vercel.' });
    return;
  }

  let clientNames = [];
  if (req.method === 'POST' && req.body && Array.isArray(req.body.names)) {
    clientNames = req.body.names;
  } else if (typeof req.query.names === 'string') {
    clientNames = req.query.names.split(',').map(s => s.trim()).filter(Boolean);
  }

  if (!clientNames.length) {
    res.status(200).json({ ok: false, error: 'Nenhum nome de cliente informado.' });
    return;
  }

  try {
    const [campaigns] = await chamarBatch(token, ['goals.listCampaigns'], [undefined]);
    const byClientName = new Map();
    (Array.isArray(campaigns) ? campaigns : []).forEach(c => {
      const key = String(c.clientName || '').trim().toLowerCase();
      if (!key) return;
      if (!byClientName.has(key)) byClientName.set(key, []);
      byClientName.get(key).push(c.id);
    });

    const month = currentMonth();
    const result = {};
    for (const name of clientNames) {
      const key = String(name).trim().toLowerCase();
      const campaignIds = byClientName.get(key);
      if (!campaignIds || !campaignIds.length) {
        result[name] = { matched: false, metaLeads: null, orcamento: null };
        continue;
      }
      const metas = await metasDoCliente(token, campaignIds, month);
      result[name] = { matched: true, campaignCount: campaignIds.length, ...metas };
    }

    res.status(200).json({
      ok: true,
      month,
      clients: result,
      tokenExpiry: tokenExpiryInfo(token),
    });
  } catch (err) {
    res.status(200).json({ ok: false, error: String((err && err.message) || err) });
  }
};
