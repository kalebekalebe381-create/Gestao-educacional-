# Gestão Educacional · Instituto Inova

Painel de cursos, matrículas, parcelas, cobranças, comercial e retornos do Instituto Inova.

- Site estático (HTML, CSS e JavaScript puro), sem etapa de build.
- Os dados ficam no Supabase (tabela `ge_registros`), configurado em `config.js`.
- Publicado na Vercel no projeto `gestao-educacional-inova`. Cada envio para a branch `main` publica o site.

## Arquivos

- `index.html`: estrutura da página.
- `app.js`: o painel (cursos, alunos, matrículas, financeiro, cobranças, retornos, configurações).
- `relatorios.js`: relatórios semanais e mensais.
- `mobile.js` e `mobile.css`: ajustes para celular (barra inferior, botão +, tabelas em cartões).
- `styles.css`: visual geral.
- `config.js`: endereço e chave pública do Supabase.
