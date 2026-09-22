# HelpCampanha — Painel de Automação e Gestão

Painel para analista de desempenho de marketing, com duas áreas:

- **Backlog de Tarefas** — organização de tarefas com prioridade, status e data limite.
- **Clientes & Campanhas** — carteira de clientes com métricas de ROAS, CPA, investimento e status de saúde da conta.

Aplicação estática (`index.html`), sem build step. Os dados ficam salvos no `localStorage` do navegador.

## Rodar localmente

Basta abrir `index.html` no navegador, ou servir a pasta com qualquer servidor estático:

```bash
npx serve .
```

## Deploy na Vercel

1. Instale a CLI (se ainda não tiver): `npm i -g vercel`
2. Faça login: `vercel login`
3. Na pasta do projeto, rode: `vercel --prod`

Como é um projeto 100% estático, a Vercel detecta e publica automaticamente — não é necessário configurar build command nem output directory.

Alternativa: importe este repositório diretamente pelo painel da Vercel (vercel.com/new) conectando sua conta do GitHub.
