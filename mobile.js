// Ajustes para celular · Gestão Educacional Instituto Inova
// Barra de navegação embaixo, botão "+" flutuante, tabelas viram cartões e menu "Mais".
const GE = window.GE;

const ICONES = {
  painel: '<path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/>',
  financeiro: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  cobrancas: '<path d="M12 22a2.5 2.5 0 0 0 2.4-2h-4.8a2.5 2.5 0 0 0 2.4 2zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/>',
  comercial: '<path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h7v-2.5c0-.9.4-1.7 1-2.4A9.7 9.7 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/>',
  mais: '<circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/>',
};
const PRINCIPAIS = [['painel', 'Painel'], ['financeiro', 'Financeiro'], ['cobrancas', 'Cobranças'], ['comercial', 'Comercial']];
const MAIS = [
  ['alunos', 'Alunos', 'Cadastro e situação de cada aluno'],
  ['cursos', 'Cursos e turmas', 'Planos, valores e turmas'],
  ['retornos', 'Retornos', 'Agenda de quem chamar de volta'],
  ['relatorios', 'Relatórios', 'Semana, mês, WhatsApp e PDF'],
  ['config', 'Configurações', 'Logo, Pix, mensagens e cópia'],
];

const svg = (k) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONES[k]}</svg>`;

function montar() {
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.innerHTML = PRINCIPAIS.map(([k, n]) => `<a href="#${k}" data-tab="${k}">${svg(k)}<span>${n}</span></a>`).join('')
    + `<button type="button" data-tab="mais" id="btnMais">${svg('mais')}<span>Mais</span></button>`;
  document.getElementById('app').appendChild(nav);

  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Novo');
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  fab.onclick = acaoFab;
  document.getElementById('app').appendChild(fab);

  document.getElementById('btnMais').onclick = () => {
    GE.abrirModal('Menu', `<div class="menu-mais">${MAIS.map(([k, n, d]) => `<a href="#${k}" onclick="GE.fecharModal()"><b>${n}</b><span>${d}</span></a>`).join('')}</div>`);
  };
}

function acaoFab() {
  const rota = (location.hash || '#painel').slice(1);
  if (rota === 'comercial') return G.editarLead();
  if (rota === 'retornos') return G.editarRetorno();
  if (rota === 'cursos') return G.editarCurso();
  if (rota === 'alunos') return G.editarAluno();
  return G.novaMatricula();
}

// tabelas: cada célula ganha o nome da coluna, para virar cartão no celular
function rotularTabelas(raiz) {
  raiz.querySelectorAll('table').forEach((t) => {
    if (t.dataset.rotulada) return;
    const nomes = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => {
      if (nomes[i] && !td.hasAttribute('colspan')) td.dataset.label = nomes[i];
      // embrulha o conteúdo para ele quebrar linha no cartão em vez de vazar para fora da tela
      if (td.hasAttribute('colspan') || (td.children.length === 1 && td.firstElementChild.classList.contains('v'))) return;
      const v = document.createElement('span');
      v.className = 'v';
      while (td.firstChild) v.appendChild(td.firstChild);
      td.appendChild(v);
    }));
    t.dataset.rotulada = '1';
    t.classList.add('cartoes');
  });
}

function marcarAtivo(rota) {
  const r = rota || (location.hash || '#painel').slice(1) || 'painel';
  const principal = PRINCIPAIS.some(([k]) => k === r);
  document.querySelectorAll('.bottom-nav [data-tab]').forEach((a) => a.classList.toggle('ativo', principal ? a.dataset.tab === r : a.dataset.tab === 'mais'));
  const fab = document.querySelector('.fab');
  if (fab) fab.classList.toggle('hidden', ['config', 'relatorios', 'cobrancas'].includes(r));
}

montar();
document.addEventListener('ge:render', (e) => { rotularTabelas(document.getElementById('view')); marcarAtivo(e.detail?.rota); });
new MutationObserver(() => rotularTabelas(document.getElementById('modalBody'))).observe(document.getElementById('modalBody'), { childList: true, subtree: true });
