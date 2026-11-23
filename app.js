// Gestão Educacional · Instituto Inova
// Painel de cursos, matrículas, parcelas, cobranças, comercial e retornos.
// Os dados ficam no Supabase (quando config.js tem a URL e a chave) ou, sem isso, no próprio navegador.

const CFG = window.GE_CONFIG || {};
const USA_BANCO = !!(CFG.supabaseUrl && CFG.supabaseKey);
const LIVRE = !!CFG.acessoLivre; // sem login: quem tem o link entra
const CHAVE_LOCAL = 'ge_inova_db_v1';
const TIPOS = ['curso', 'turma', 'aluno', 'matricula', 'lead', 'retorno', 'config'];

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v) => {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const somaMeses = (iso, m) => {
  const [y, mo, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(y, mo - 1 + m, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
};
const diasAte = (iso) => Math.round((Date.parse(iso + 'T12:00:00') - Date.parse(hojeISO() + 'T12:00:00')) / 86400000);
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const foneBR = (s) => {
  const d = soDigitos(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || '';
};
const linkWhats = (fone, texto = '') => {
  let d = soDigitos(fone);
  if (!d) return '';
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
};
const normaliza = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------- armazenamento ----------
let sb = null;
const db = { curso: [], turma: [], aluno: [], matricula: [], lead: [], retorno: [], config: [] };

const Local = {
  async carregar() {
    try { return JSON.parse(localStorage.getItem(CHAVE_LOCAL) || '[]'); } catch { return []; }
  },
  async salvar(reg) { this._gravar(); },
  async apagar(id) { this._gravar(); },
  _gravar() {
    const tudo = TIPOS.flatMap((t) => db[t]);
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(tudo));
  },
};

const Banco = {
  async carregar() {
    const out = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from('ge_registros').select('id,tipo,dados').range(de, de + 999);
      if (error) throw error;
      data.forEach((r) => out.push({ ...r.dados, id: r.id, tipo: r.tipo }));
      if (data.length < 1000) break;
    }
    return out;
  },
  async salvar(reg) {
    const { error } = await sb.from('ge_registros').upsert({ id: reg.id, tipo: reg.tipo, dados: reg, atualizado_em: new Date().toISOString() });
    if (error) throw error;
  },
  async apagar(id) {
    const { error } = await sb.from('ge_registros').delete().eq('id', id);
    if (error) throw error;
  },
};
const Store = () => (USA_BANCO ? Banco : Local);

async function salvar(reg) {
  if (!reg.id) reg.id = uid();
  reg.atualizadoEm = new Date().toISOString();
  const lista = db[reg.tipo];
  const i = lista.findIndex((x) => x.id === reg.id);
  if (i >= 0) lista[i] = reg; else lista.push(reg);
  try { await Store().salvar(reg); }
  catch (e) { console.error(e); toast('Não consegui salvar. Verifique a internet e tente de novo.'); throw e; }
  return reg;
}
async function apagar(reg) {
  db[reg.tipo] = db[reg.tipo].filter((x) => x.id !== reg.id);
  try { await Store().apagar(reg.id); }
  catch (e) { console.error(e); toast('Não consegui apagar. Verifique a internet.'); throw e; }
}
const porId = (tipo, id) => db[tipo].find((x) => x.id === id);
const config = () => db.config.find((c) => c.id === 'config') || { id: 'config', tipo: 'config' };

// ---------- dados iniciais (catálogo do Instituto Inova) ----------
function catalogoInicial() {
  const p = (nome, valor, bonus = '') => ({ id: uid(), nome, valor, bonus });
  const c = (ordem, nome, modalidade, carga, vagas, descricao, planos) => { const x = { id: uid(), tipo: 'curso', ordem, nome, modalidade, carga, vagas, descricao, planos, ativo: true }; x.categoria = categoriaCurso(x); return x; };
  const cursos = [
    c(1, 'Workshop', 'Presencial', '', '', 'Workshop do dia 07/12.', [p('Ingresso', 197)]),
    c(2, 'Gestão de Empresas de Barbearia e Salão', 'Presencial', '16 horas (dois domingos intercalados)', 25, 'Curso presencial de 16 horas.', [
      p('Curso', 697),
      p('Curso + TV Inova', 997, 'Plataforma completa da TV Inova'),
      p('Curso + TV Inova + livros', 1297, 'Plataforma TV Inova + 30 livros da Coleção Inova'),
    ]),
    c(3, 'Formação em Design de Corte 3.0', 'Presencial', '3 meses de aulas (segundas, 18h30 às 22h10) + 32h de estágio', 14, 'Formação para barbeiros iniciantes.', [
      p('Completo', 3297, 'Kit (tesoura, 4 presilhas, borrifador, pente), mentoria semanal, TV Inova e 30 livros'),
      p('Sem kit e livros', 2897, 'Mentoria semanal e TV Inova'),
    ]),
    c(4, 'Aperfeiçoamento em Design de Corte 3.0', 'Presencial', '16 horas (dois dias)', '', 'Curso presencial para barbeiros.', [
      p('Curso + 3 livros', 1497, 'Boneco para prática + 3 livros (Atendimento, Vendas e Biossegurança)'),
      p('Curso + 6 cursos e 6 livros', 1697, 'Boneco + 6 cursos TV Inova + 6 livros'),
      p('Curso + plataforma, livros e mentoria', 1997, 'Boneco + plataforma completa + 30 livros + 4 mentorias de 2h'),
    ]),
    c(5, 'Atendimento e Vendas', 'Presencial', '8 horas', 25, 'Curso presencial de 8 horas.', [p('Plano único', 297, '3 cursos à escolha + 3 livros online')]),
    c(6, 'Gestão de Empresas de Barbearia e Salão Online', 'Online ao vivo', '16 horas (dois domingos intercalados)', '', 'Curso online ao vivo com mentoria de Júnior Inova.', [
      p('Curso ao vivo', 697),
      p('Curso + TV Inova', 997, 'Plataforma completa da TV Inova'),
      p('Curso + TV Inova + livros', 1297, 'Plataforma TV Inova + 30 livros da Coleção Inova'),
    ]),
    c(7, 'Cursos Online Avulsos', 'Online', 'Varia conforme o curso', '', 'Cada curso online vendido individualmente.', [p('Compra individual', 197, '3 livros da Coleção Inova à escolha')]),
    c(8, 'TV Inova e Coleção Inova', 'Online', '9 cursos online / 30 livros', '', 'Plataforma completa e livros, com bônus cruzado.', [
      p('Plataforma completa TV Inova', 1997, 'Bônus: 30 livros da Coleção Inova'),
      p('30 livros da Coleção Inova', 1437, 'Bônus: plataforma completa com os 9 cursos'),
    ]),
  ];
  const turmas = [{ id: uid(), tipo: 'turma', cursoId: cursos[0].id, nome: 'Workshop 07/12', data: '2026-12-07', horario: '', local: '', vagas: '', status: 'aberta', obs: '' }];
  return { cursos, turmas };
}

async function semearSePreciso() {
  const cfg = config();
  if (cfg.semeado || db.curso.length) return;
  const { cursos, turmas } = catalogoInicial();
  for (const c of cursos) await salvar(c);
  for (const t of turmas) await salvar(t);
  await salvar({
    ...cfg,
    tipo: 'config',
    id: 'config',
    semeado: true,
    nomeInstituto: 'Instituto Inova',
    pix: '',
    msgCobranca: 'Olá, {nome}! Tudo bem? Aqui é do Instituto Inova. Passando para lembrar da parcela {parcela} do {curso}, no valor de {valor}, com vencimento em {vencimento}.{pix} Qualquer dúvida, estou à disposição!',
    msgRetorno: 'Olá, {nome}! Tudo bem? Aqui é do Instituto Inova. Estou retornando sobre {assunto}.',
  });
}

// ---------- regras de negócio ----------
function statusParcela(p) {
  if (p.pagoEm) return 'pago';
  if (p.venc && p.venc < hojeISO()) return 'atrasado';
  return 'aberto';
}
function resumoMatricula(m) {
  const parcelas = m.parcelas || [];
  const pago = r2(parcelas.filter((p) => p.pagoEm).reduce((s, p) => s + num(p.valor), 0));
  const atrasado = r2(parcelas.filter((p) => statusParcela(p) === 'atrasado').reduce((s, p) => s + num(p.valor), 0));
  const total = r2(num(m.valorFinal));
  const saldo = r2(total - pago);
  let situacao = 'Em dia';
  if (m.status === 'cancelada') situacao = 'Cancelada';
  else if (saldo <= 0.009) situacao = 'Quitado';
  else if (atrasado > 0) situacao = 'Em atraso';
  return { total, pago, saldo, atrasado, situacao };
}
const tagSituacao = (s) => `<span class="tag ${{ Quitado: 'pago', 'Em atraso': 'atrasado', 'Em dia': 'aberto', Cancelada: 'cancelada' }[s] || ''}">${h(s)}</span>`;
const tagParcela = (p) => { const s = statusParcela(p); return `<span class="tag ${s}">${{ pago: 'Pago', atrasado: 'Atrasado', aberto: 'A vencer' }[s]}</span>`; };
const matriculasAtivas = () => db.matricula.filter((m) => m.status !== 'cancelada');
const nomeCurso = (id) => porId('curso', id)?.nome || 'Curso removido';
const nomeTurma = (id) => (id ? porId('turma', id)?.nome || '' : '');
const nomeAluno = (id) => porId('aluno', id)?.nome || 'Aluno removido';
const cursosOrdenados = () => [...db.curso].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || a.nome.localeCompare(b.nome));
const CATEGORIAS = ['Eventos e workshops', 'Cursos presenciais', 'Cursos online', 'Plataforma e livros', 'Outros'];
function categoriaCurso(c) {
  if (c.categoria) return c.categoria;
  if (/workshop|evento|palestra/i.test(c.nome)) return 'Eventos e workshops';
  if (/tv inova|cole[cç][aã]o|livro/i.test(c.nome)) return 'Plataforma e livros';
  if (/online/i.test(c.modalidade || '')) return 'Cursos online';
  if (/presencial|h[ií]brido/i.test(c.modalidade || '')) return 'Cursos presenciais';
  return 'Outros';
}
function cursosPorCategoria(soAtivos = false, incluir = '') {
  const grupos = [];
  CATEGORIAS.forEach((cat) => {
    const lista = cursosOrdenados().filter((c) => categoriaCurso(c) === cat && (!soAtivos || c.ativo !== false || c.id === incluir));
    if (lista.length) grupos.push([cat, lista]);
  });
  return grupos;
}
const opcoesCursos = (sel) => cursosPorCategoria().map(([cat, l]) => `<optgroup label="${h(cat)}">${l.map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${h(c.nome)}</option>`).join('')}</optgroup>`).join('');
const turmasDoCurso = (cid) => db.turma.filter((t) => t.cursoId === cid).sort((a, b) => (a.data || '9').localeCompare(b.data || '9'));
const inscritosTurma = (tid) => matriculasAtivas().filter((m) => m.turmaId === tid);
const inscritosCurso = (cid) => matriculasAtivas().filter((m) => m.cursoId === cid);

function todasParcelasAbertas() {
  const out = [];
  for (const m of matriculasAtivas()) {
    (m.parcelas || []).forEach((p) => { if (!p.pagoEm) out.push({ m, p }); });
  }
  return out.sort((a, b) => (a.p.venc || '9').localeCompare(b.p.venc || '9'));
}

function msgCobranca(m, p) {
  const cfg = config();
  const aluno = porId('aluno', m.alunoId) || {};
  const tpl = cfg.msgCobranca || 'Olá, {nome}! Lembrete da parcela {parcela} do {curso}, valor {valor}, vencimento {vencimento}.{pix}';
  const turma = nomeTurma(m.turmaId);
  return tpl
    .replaceAll('{nome}', (aluno.nome || '').split(' ')[0])
    .replaceAll('{parcela}', p.n === 0 ? 'de entrada' : `${p.n}/${(m.parcelas || []).filter((x) => x.n > 0).length}`)
    .replaceAll('{curso}', nomeCurso(m.cursoId) + (turma ? ` (${turma})` : ''))
    .replaceAll('{valor}', brl(p.valor))
    .replaceAll('{vencimento}', dataBR(p.venc))
    .replaceAll('{pix}', cfg.pix ? ` Chave Pix: ${cfg.pix}.` : '');
}

// ---------- modal ----------
function abrirModal(titulo, html, aoMontar) {
  $('#modalTitle').textContent = titulo;
  $('#modalBody').innerHTML = html;
  $('#modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (aoMontar) aoMontar($('#modalBody'));
  const f = $('#modalBody input:not([type=hidden]):not([readonly]), #modalBody select');
  if (f && window.matchMedia('(min-width:700px)').matches) f.focus();
}
function fecharModal() {
  $('#modal').classList.add('hidden');
  document.body.style.overflow = '';
}
$('#modalClose').onclick = fecharModal;
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') fecharModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });
const dadosForm = (form) => Object.fromEntries(new FormData(form).entries());

// ---------- roteamento ----------
const ROTAS = { painel: vPainel, cursos: vCursos, comercial: vComercial, alunos: vAlunos, financeiro: vFinanceiro, cobrancas: vCobrancas, retornos: vRetornos, config: vConfig };
const estado = { filtroCursoPainel: '', fin: { busca: '', curso: '', situacao: '', status: 'ativa' }, alunosBusca: '', cobr: 'atrasadas', ret: 'pendentes' };

function render() {
  const rota = (location.hash || '#painel').slice(1).split('?')[0];
  const fn = ROTAS[rota] || vPainel;
  $$('#tabs a').forEach((a) => a.classList.toggle('ativo', a.dataset.tab === (ROTAS[rota] ? rota : 'painel')));
  $('#view').innerHTML = fn();
  const ativo = $('#tabs a.ativo');
  if (ativo) ativo.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  document.dispatchEvent(new CustomEvent('ge:render', { detail: { rota } }));
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

function aplicarMarca() {
  const cfg = config();
  const logo = cfg.logo ? `<img src="${h(cfg.logo)}" alt="Logo">` : '<span class="mono">I</span>';
  $('#brandLogo').innerHTML = logo;
  $('#loginLogo').innerHTML = logo;
  $('#brandSub').textContent = cfg.nomeInstituto || 'Instituto Inova';
}

// ================= PAINEL =================
function vPainel() {
  const fc = estado.filtroCursoPainel;
  const mats = matriculasAtivas().filter((m) => !fc || m.cursoId === fc);
  let vendido = 0, recebido = 0, atrasado = 0, aReceber = 0, qtdAtraso = 0;
  mats.forEach((m) => {
    const r = resumoMatricula(m);
    vendido += r.total; recebido += r.pago; atrasado += r.atrasado;
    aReceber += Math.max(0, r.saldo - r.atrasado);
    if (r.atrasado > 0) qtdAtraso++;
  });
  const hoje = hojeISO();
  const abertas = todasParcelasAbertas().filter(({ m }) => !fc || m.cursoId === fc);
  const proximas = abertas.filter(({ p }) => p.venc && diasAte(p.venc) <= 7).slice(0, 8);
  const retHoje = db.retorno.filter((r) => !r.feito && r.data && r.data <= hoje).sort((a, b) => a.data.localeCompare(b.data));
  const etapas = { novo: 0, contato: 0, negociando: 0, matriculado: 0, perdido: 0 };
  db.lead.forEach((l) => { etapas[l.etapa] = (etapas[l.etapa] || 0) + 1; });
  const mesAtual = hoje.slice(0, 7);
  const recebidoMes = mats.reduce((s, m) => s + (m.parcelas || []).filter((p) => p.pagoEm && p.pagoEm.slice(0, 7) === mesAtual).reduce((a, p) => a + num(p.valor), 0), 0);

  const cursosComDados = cursosOrdenados().filter((c) => (!fc || c.id === fc) && (inscritosCurso(c.id).length || turmasDoCurso(c.id).some((t) => t.status !== 'encerrada')));
  const cardsTurmas = cursosComDados.map((c) => {
    const turmas = turmasDoCurso(c.id).filter((t) => t.status !== 'encerrada');
    const blocos = [];
    turmas.forEach((t) => blocos.push(cardTurma(c, t, inscritosTurma(t.id))));
    const semTurmaReal = inscritosCurso(c.id).filter((m) => !m.turmaId || !porId('turma', m.turmaId));
    if (semTurmaReal.length) blocos.push(cardTurma(c, null, semTurmaReal));
    return blocos.join('');
  }).join('');

  return `
  <div class="sec-head">
    <div><h1>Painel gerencial</h1><p class="muted">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p></div>
    <div class="acoes">
      <select onchange="G.filtroPainel(this.value)" class="btn" style="font-weight:600">
        <option value="">Todos os cursos</option>
        ${opcoesCursos(fc)}
      </select>
      <button class="btn primary" onclick="G.novaMatricula()">+ Nova matrícula</button>
    </div>
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="rot">Matrículas</div><div class="val">${mats.length}</div><div class="det">${new Set(mats.map((m) => m.alunoId)).size} alunos</div></div>
    <div class="card kpi"><div class="rot">Total vendido</div><div class="val">${brl(vendido)}</div><div class="det">valor das matrículas ativas</div></div>
    <div class="card kpi ok"><div class="rot">Recebido</div><div class="val">${brl(recebido)}</div><div class="det">${brl(recebidoMes)} neste mês</div></div>
    <div class="card kpi"><div class="rot">A receber</div><div class="val">${brl(aReceber)}</div><div class="det">parcelas ainda no prazo</div></div>
    <div class="card kpi ${atrasado > 0 ? 'alerta' : ''}"><div class="rot">Em atraso</div><div class="val">${brl(atrasado)}</div><div class="det">${qtdAtraso} aluno(s) com parcela vencida</div></div>
  </div>

  <h3 style="color:var(--verde);margin:4px 0 10px">Turmas e inscrições</h3>
  <div class="grid tres" style="margin-bottom:18px">
    ${cardsTurmas || `<div class="card vazio">Nenhuma turma aberta ainda. <a href="#cursos">Crie uma turma em Cursos</a>.</div>`}
  </div>

  <div class="grid duas">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3>Cobranças da semana</h3><a href="#cobrancas" class="btn small ghost">Ver todas</a></div>
      <div class="lista mini-lista" style="margin-top:10px">
        ${proximas.length ? proximas.map(({ m, p }) => itemCobranca(m, p, true)).join('') : '<p class="muted">Nenhuma parcela vencida ou vencendo nos próximos 7 dias.</p>'}
      </div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3>Retornos para hoje</h3><a href="#retornos" class="btn small ghost">Agenda</a></div>
      <div class="lista mini-lista" style="margin-top:10px">
        ${retHoje.length ? retHoje.slice(0, 8).map(itemRetorno).join('') : '<p class="muted">Nenhum retorno pendente para hoje.</p>'}
      </div>
      <div class="sep"></div>
      <h3>Funil comercial</h3>
      <div class="linha-val" style="margin-top:8px;flex-wrap:wrap;gap:6px">
        ${ETAPAS.map((e) => `<span class="tag ${e.id === 'perdido' ? 'cancelada' : e.id === 'matriculado' ? 'pago' : ''}">${e.nome}: ${etapas[e.id] || 0}</span>`).join('')}
      </div>
    </div>
  </div>`;
}

function cardTurma(c, t, mats) {
  const vagas = num(t ? t.vagas || c.vagas : c.vagas);
  let vendido = 0, pago = 0;
  mats.forEach((m) => { const r = resumoMatricula(m); vendido += r.total; pago += r.pago; });
  const pctVagas = vagas ? Math.min(100, (mats.length / vagas) * 100) : 0;
  const pctPago = vendido ? Math.min(100, (pago / vendido) * 100) : 0;
  let quando = '';
  if (t?.data) {
    const d = diasAte(t.data);
    quando = d > 0 ? `faltam ${d} dia${d > 1 ? 's' : ''}` : d === 0 ? 'é hoje!' : 'já começou';
  }
  return `<div class="card turma" ${t ? `style="cursor:pointer" onclick="G.verTurma('${t.id}')"` : ''}>
    <div class="topo">
      <div><div class="nome">${h(t ? t.nome : c.nome)}</div><div class="muted" style="font-size:13px">${t ? h(c.nome) + ' · ' : 'Sem turma definida · '}${t?.data ? dataBR(t.data) : ''}</div></div>
      ${quando ? `<span class="tag azul">${quando}</span>` : ''}
    </div>
    <div class="linha-val"><span>Inscritos</span><b>${mats.length}${vagas ? ' / ' + vagas + ' vagas' : ''}</b></div>
    ${vagas ? `<div class="barra"><i style="width:${pctVagas}%"></i></div>` : ''}
    <div class="linha-val"><span>Recebido</span><b>${brl(pago)} de ${brl(vendido)}</b></div>
    <div class="barra ouro"><i style="width:${pctPago}%"></i></div>
  </div>`;
}

function itemCobranca(m, p, compacto = false) {
  const aluno = porId('aluno', m.alunoId) || {};
  const link = linkWhats(aluno.whatsapp, msgCobranca(m, p));
  const d = p.venc ? diasAte(p.venc) : null;
  const quando = d === null ? 'sem vencimento' : d < 0 ? `venceu há ${-d} dia${d < -1 ? 's' : ''}` : d === 0 ? 'vence hoje' : `vence em ${d} dia${d > 1 ? 's' : ''}`;
  return `<div class="item">
    <div class="info" style="cursor:pointer" onclick="G.verMatricula('${m.id}')">
      <div class="t">${h(aluno.nome || 'Aluno')} · ${brl(p.valor)}</div>
      <div class="s">${h(nomeCurso(m.cursoId))}${compacto ? '' : ' · ' + (p.n === 0 ? 'Entrada' : 'Parcela ' + p.n)} · ${dataBR(p.venc)} (${quando})</div>
    </div>
    <div class="acoes">
      ${tagParcela(p)}
      ${link ? `<a class="btn small whats" target="_blank" rel="noopener" href="${link}">WhatsApp</a>` : ''}
      <button class="btn small" onclick="G.pagarParcela('${m.id}','${p.id}')">Recebi</button>
    </div>
  </div>`;
}

// ================= CURSOS =================
function vCursos() {
  const grupos = cursosPorCategoria();
  return `
  <div class="sec-head">
    <div><h1>Cursos e turmas</h1><p class="muted">Os planos e valores de cada curso, e as turmas com data e vagas.</p></div>
    <div class="acoes"><button class="btn" onclick="G.editarCurso()">+ Novo curso</button></div>
  </div>
  <div class="atalhos-cat">${grupos.map(([cat, l]) => `<a href="javascript:void(0)" onclick="document.getElementById('cat-${normaliza(cat).replace(/[^a-z]+/g, '-')}').scrollIntoView({behavior:'smooth'})">${h(cat)} <b>${l.length}</b></a>`).join('')}</div>
  ${grupos.map(([cat, cursos]) => `<h2 class="cat-secao" id="cat-${normaliza(cat).replace(/[^a-z]+/g, '-')}">${h(cat)}</h2>
  <div class="grid tres">
    ${cursos.map((c) => {
      const turmas = turmasDoCurso(c.id);
      return `<div class="card curso-card" style="${c.ativo === false ? 'opacity:.6' : ''}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div><h3>${h(c.nome)}</h3><div class="muted" style="font-size:13px">${h(c.modalidade || '')}${c.carga ? ' · ' + h(c.carga) : ''}${c.vagas ? ' · ' + h(c.vagas) + ' vagas' : ''}</div></div>
          <button class="btn small ghost" onclick="G.editarCurso('${c.id}')">Editar</button>
        </div>
        <div class="planos">
          ${(c.planos || []).map((p) => `<div class="plano"><div><div>${h(p.nome)}</div>${p.bonus ? `<div class="b">${h(p.bonus)}</div>` : ''}</div><div class="p">${brl(p.valor)}</div></div>`).join('') || '<p class="muted">Sem planos cadastrados.</p>'}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0">
          <b style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Turmas</b>
          <button class="btn small" onclick="G.editarTurma(null,'${c.id}')">+ Turma</button>
        </div>
        <div class="turmas-mini">
          ${turmas.map((t) => {
            const ins = inscritosTurma(t.id).length;
            const vagas = t.vagas || c.vagas;
            return `<div class="turma-mini" onclick="G.verTurma('${t.id}')"><span><b>${h(t.nome)}</b><br><span class="muted" style="font-size:12px">${t.data ? dataBR(t.data) : 'sem data'}${t.status === 'encerrada' ? ' · encerrada' : ''}</span></span><span class="tag">${ins}${vagas ? '/' + vagas : ''} inscritos</span></div>`;
          }).join('') || '<p class="muted" style="font-size:13px;margin:0">Nenhuma turma. Crie uma para organizar as inscrições por data.</p>'}
        </div>
        <button class="btn small primary full" style="margin-top:12px" onclick="G.novaMatricula({cursoId:'${c.id}'})">+ Matricular neste curso</button>
      </div>`;
    }).join('')}
  </div>`).join('')}`;
}

function editarCurso(id) {
  const c = id ? structuredClone(porId('curso', id)) : { tipo: 'curso', nome: '', modalidade: 'Presencial', carga: '', vagas: '', descricao: '', planos: [{ id: uid(), nome: 'Plano único', valor: 0, bonus: '' }], ativo: true, ordem: db.curso.length + 1 };
  const linhaPlano = (p) => `<div class="form plano-linha" data-id="${p.id}" style="grid-template-columns:2fr 1fr auto;align-items:end;margin-bottom:8px">
      <label>Plano<input name="pn" value="${h(p.nome)}" required></label>
      <label>Valor (R$)<input name="pv" value="${h(String(p.valor).replace('.', ','))}" inputmode="decimal" required></label>
      <button type="button" class="btn small perigo" onclick="this.parentElement.nextElementSibling.remove();this.parentElement.remove()">Tirar</button>
    </div>
    <label class="bonus-linha" style="margin:-2px 0 12px">O que inclui (bônus)<input name="pb" value="${h(p.bonus || '')}"></label>`;
  abrirModal(id ? 'Editar curso' : 'Novo curso', `
    <form id="fCurso">
      <div class="form">
        <label class="inteira">Nome do curso<input name="nome" value="${h(c.nome)}" required></label>
        <label>Categoria<select name="categoria">${CATEGORIAS.map((k) => `<option ${categoriaCurso(c) === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label>Modalidade<select name="modalidade">${['Presencial', 'Online', 'Online ao vivo', 'Híbrido'].map((m) => `<option ${c.modalidade === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label>Vagas por turma<input name="vagas" value="${h(c.vagas)}" inputmode="numeric" placeholder="ex.: 25"></label>
        <label class="inteira">Carga horária<input name="carga" value="${h(c.carga)}"></label>
        <label class="inteira">Descrição<textarea name="descricao">${h(c.descricao)}</textarea></label>
        <label class="inteira"><span>Mostrar o curso</span><select name="ativo"><option value="1">Ativo</option><option value="0" ${c.ativo === false ? 'selected' : ''}>Pausado</option></select></label>
      </div>
      <div class="sep"></div>
      <b style="color:var(--verde)">Planos e valores</b>
      <div id="planos" style="margin-top:10px">${(c.planos || []).map(linhaPlano).join('')}</div>
      <button type="button" class="btn small" id="addPlano">+ Plano</button>
      <div class="form-acoes">
        ${id ? '<button type="button" class="btn perigo esq" id="delCurso">Apagar curso</button>' : ''}
        <button type="button" class="btn ghost" onclick="G.fechar()">Cancelar</button>
        <button class="btn primary">Salvar</button>
      </div>
    </form>`, (el) => {
    $('#addPlano', el).onclick = () => $('#planos', el).insertAdjacentHTML('beforeend', linhaPlano({ id: uid(), nome: '', valor: '', bonus: '' }));
    if (id) $('#delCurso', el).onclick = async () => {
      if (inscritosCurso(id).length || db.matricula.some((m) => m.cursoId === id)) return toast('Este curso tem matrículas. Pause o curso em vez de apagar.');
      if (!confirm('Apagar este curso e as turmas dele?')) return;
      for (const t of turmasDoCurso(id)) await apagar(t);
      await apagar(porId('curso', id)); fecharModal(); render(); toast('Curso apagado');
    };
    $('#fCurso', el).onsubmit = async (e) => {
      e.preventDefault();
      const f = dadosForm(e.target);
      const planos = $$('.plano-linha', el).map((row) => ({
        id: row.dataset.id,
        nome: $('[name=pn]', row).value.trim(),
        valor: num($('[name=pv]', row).value),
        bonus: $('[name=pb]', row.nextElementSibling).value.trim(),
      })).filter((p) => p.nome);
      Object.assign(c, { nome: f.nome.trim(), categoria: f.categoria, modalidade: f.modalidade, vagas: f.vagas ? num(f.vagas) : '', carga: f.carga, descricao: f.descricao, ativo: f.ativo === '1', planos });
      await salvar(c); fecharModal(); render(); toast('Curso salvo');
    };
  });
}

function editarTurma(id, cursoId) {
  const t = id ? structuredClone(porId('turma', id)) : { tipo: 'turma', cursoId, nome: '', data: '', horario: '', local: '', vagas: '', status: 'aberta', obs: '' };
  const curso = porId('curso', t.cursoId);
  abrirModal(id ? 'Editar turma' : 'Nova turma', `
    <form id="fTurma"><div class="form">
      <label class="inteira">Curso<select name="cursoId">${cursosOrdenados().map((c) => `<option value="${c.id}" ${c.id === t.cursoId ? 'selected' : ''}>${h(c.nome)}</option>`).join('')}</select></label>
      <label class="inteira">Nome da turma<input name="nome" value="${h(t.nome)}" required placeholder="ex.: Turma Janeiro 2027"></label>
      <label>Data de início<input type="date" name="data" value="${h(t.data)}"></label>
      <label>Horário<input name="horario" value="${h(t.horario)}" placeholder="ex.: 9h às 18h"></label>
      <label>Vagas<input name="vagas" value="${h(t.vagas)}" inputmode="numeric" placeholder="${h(curso?.vagas || 'sem limite')}"></label>
      <label>Situação<select name="status"><option value="aberta">Inscrições abertas</option><option value="encerrada" ${t.status === 'encerrada' ? 'selected' : ''}>Encerrada</option></select></label>
      <label class="inteira">Local<input name="local" value="${h(t.local)}"></label>
      <label class="inteira">Observações<textarea name="obs">${h(t.obs)}</textarea></label>
    </div>
    <div class="form-acoes">
      ${id ? '<button type="button" class="btn perigo esq" id="delTurma">Apagar turma</button>' : ''}
      <button type="button" class="btn ghost" onclick="G.fechar()">Cancelar</button>
      <button class="btn primary">Salvar</button>
    </div></form>`, (el) => {
    if (id) $('#delTurma', el).onclick = async () => {
      if (db.matricula.some((m) => m.turmaId === id)) return toast('Esta turma tem matrículas. Marque como encerrada em vez de apagar.');
      if (!confirm('Apagar esta turma?')) return;
      await apagar(porId('turma', id)); fecharModal(); render(); toast('Turma apagada');
    };
    $('#fTurma', el).onsubmit = async (e) => {
      e.preventDefault();
      const f = dadosForm(e.target);
      Object.assign(t, { cursoId: f.cursoId, nome: f.nome.trim(), data: f.data, horario: f.horario, vagas: f.vagas ? num(f.vagas) : '', status: f.status, local: f.local, obs: f.obs });
      await salvar(t);
      // mantém o curso das matrículas alinhado à turma
      for (const m of db.matricula.filter((m) => m.turmaId === t.id && m.cursoId !== t.cursoId)) { m.cursoId = t.cursoId; await salvar(m); }
      fecharModal(); render(); toast('Turma salva');
    };
  });
}

function verTurma(id) {
  const t = porId('turma', id); if (!t) return;
  const c = porId('curso', t.cursoId) || {};
  const mats = inscritosTurma(id).sort((a, b) => nomeAluno(a.alunoId).localeCompare(nomeAluno(b.alunoId)));
  let tot = 0, pago = 0;
  const linhas = mats.map((m) => {
    const r = resumoMatricula(m); tot += r.total; pago += r.pago;
    const a = porId('aluno', m.alunoId) || {};
    return `<tr class="clicavel" onclick="G.verMatricula('${m.id}')"><td>${h(a.nome)}<div class="muted" style="font-size:12px">${h(foneBR(a.whatsapp))}</div></td><td>${h(m.planoNome || '')}</td><td class="num">${brl(r.pago)} / ${brl(r.total)}</td><td>${tagSituacao(r.situacao)}</td></tr>`;
  }).join('');
  const vagas = t.vagas || c.vagas;
  abrirModal(t.nome, `
    <div class="resumo">
      <b>${h(c.nome)}</b><br>
      ${t.data ? 'Início: ' + dataBR(t.data) : 'Sem data'}${t.horario ? ' · ' + h(t.horario) : ''}${t.local ? ' · ' + h(t.local) : ''}<br>
      Inscritos: <b>${mats.length}${vagas ? ' de ' + vagas + ' vagas' : ''}</b> · Recebido: <b>${brl(pago)}</b> de ${brl(tot)}
    </div>
    <div class="acoes" style="margin:14px 0">
      <button class="btn primary small" onclick="G.novaMatricula({turmaId:'${id}'})">+ Inscrever aluno</button>
      <button class="btn small" onclick="G.editarTurma('${id}')">Editar turma</button>
      <button class="btn small" onclick="G.csvTurma('${id}')">Baixar lista (Excel)</button>
    </div>
    <div class="tabela-wrap"><table><thead><tr><th>Aluno</th><th>Plano</th><th class="num">Pago</th><th>Situação</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="4" class="vazio">Ninguém inscrito ainda.</td></tr>'}</tbody></table></div>`);
}

// ================= COMERCIAL =================
const ETAPAS = [
  { id: 'novo', nome: 'Novos' },
  { id: 'contato', nome: 'Em contato' },
  { id: 'negociando', nome: 'Negociando' },
  { id: 'matriculado', nome: 'Matriculados' },
  { id: 'perdido', nome: 'Perdidos' },
];
function vComercial() {
  const col = (e) => {
    const leads = db.lead.filter((l) => (l.etapa || 'novo') === e.id).sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    return `<div class="coluna"><h4>${e.nome}<span>${leads.length}</span></h4>
      ${leads.map((l) => `<div class="lead" onclick="G.editarLead('${l.id}')" style="${e.id === 'perdido' ? 'border-left-color:#aaa' : e.id === 'matriculado' ? 'border-left-color:var(--ok)' : ''}">
        <div class="n">${h(l.nome)}</div>
        <div class="s">${h(l.cursoId ? nomeCurso(l.cursoId) : 'Interesse não definido')}</div>
        <div class="s">${h(foneBR(l.whatsapp))}${l.origem ? ' · ' + h(l.origem) : ''}</div>
      </div>`).join('') || '<p class="muted" style="font-size:13px;margin:4px">—</p>'}
    </div>`;
  };
  return `
  <div class="sec-head">
    <div><h1>Comercial</h1><p class="muted">Interessados em cada curso, do primeiro contato até a matrícula.</p></div>
    <div class="acoes"><button class="btn primary" onclick="G.editarLead()">+ Novo interessado</button></div>
  </div>
  <div class="kanban">${ETAPAS.map(col).join('')}</div>`;
}

function editarLead(id) {
  const l = id ? structuredClone(porId('lead', id)) : { tipo: 'lead', nome: '', whatsapp: '', cursoId: '', etapa: 'novo', origem: '', obs: '', criadoEm: new Date().toISOString() };
  const link = linkWhats(l.whatsapp, `Olá, ${(l.nome || '').split(' ')[0]}! Tudo bem? Aqui é do Instituto Inova.`);
  abrirModal(id ? l.nome : 'Novo interessado', `
    <form id="fLead"><div class="form">
      <label class="inteira">Nome<input name="nome" value="${h(l.nome)}" required></label>
      <label>WhatsApp<input name="whatsapp" value="${h(l.whatsapp)}" inputmode="tel" placeholder="(61) 99999-9999"></label>
      <label>Origem<input name="origem" value="${h(l.origem)}" list="origens" placeholder="Instagram, indicação…"></label>
      <datalist id="origens"><option>Instagram</option><option>Indicação</option><option>WhatsApp</option><option>Barbearia</option><option>Evento</option><option>Tráfego pago</option></datalist>
      <label>Interesse<select name="cursoId"><option value="">—</option>${opcoesCursos(l.cursoId)}</select></label>
      <label>Etapa<select name="etapa">${ETAPAS.map((e) => `<option value="${e.id}" ${l.etapa === e.id ? 'selected' : ''}>${e.nome}</option>`).join('')}</select></label>
      <label class="inteira">Anotações<textarea name="obs">${h(l.obs)}</textarea></label>
    </div>
    <div class="form-acoes">
      ${id ? '<button type="button" class="btn perigo esq" id="delLead">Apagar</button>' : ''}
      ${id && link ? `<a class="btn whats" target="_blank" rel="noopener" href="${link}">WhatsApp</a>` : ''}
      ${id ? `<button type="button" class="btn" id="retLead">Agendar retorno</button>` : ''}
      ${id && l.etapa !== 'matriculado' ? `<button type="button" class="btn ouro" id="matLead">Matricular</button>` : ''}
      <button class="btn primary">Salvar</button>
    </div></form>`, (el) => {
    const ler = () => { const f = dadosForm($('#fLead', el)); Object.assign(l, { nome: f.nome.trim(), whatsapp: f.whatsapp, origem: f.origem, cursoId: f.cursoId, etapa: f.etapa, obs: f.obs }); };
    $('#fLead', el).onsubmit = async (e) => { e.preventDefault(); ler(); await salvar(l); fecharModal(); render(); toast('Salvo'); };
    if (id) {
      $('#delLead', el).onclick = async () => { if (!confirm('Apagar este interessado?')) return; await apagar(porId('lead', id)); fecharModal(); render(); };
      $('#retLead', el).onclick = async () => { ler(); await salvar(l); editarRetorno(null, { nome: l.nome, whatsapp: l.whatsapp, leadId: l.id, motivo: l.cursoId ? 'o ' + nomeCurso(l.cursoId) : '' }); };
      const mb = $('#matLead', el);
      if (mb) mb.onclick = async () => { ler(); await salvar(l); novaMatricula({ lead: l }); };
    }
  });
}

// ================= ALUNOS =================
function vAlunos() {
  const q = normaliza(estado.alunosBusca);
  const alunos = [...db.aluno].filter((a) => !q || normaliza(a.nome + ' ' + a.whatsapp + ' ' + a.email + ' ' + a.cpf).includes(q)).sort((a, b) => a.nome.localeCompare(b.nome));
  const linhas = alunos.map((a) => {
    const mats = db.matricula.filter((m) => m.alunoId === a.id && m.status !== 'cancelada');
    let tot = 0, pago = 0, atraso = 0;
    mats.forEach((m) => { const r = resumoMatricula(m); tot += r.total; pago += r.pago; atraso += r.atrasado; });
    return `<tr class="clicavel" onclick="G.verAluno('${a.id}')">
      <td><b>${h(a.nome)}</b>${a.cidade ? `<div class="muted" style="font-size:12px">${h(a.cidade)}</div>` : ''}</td>
      <td>${h(foneBR(a.whatsapp))}</td>
      <td>${mats.map((m) => h(nomeCurso(m.cursoId))).join('<br>') || '<span class="muted">—</span>'}</td>
      <td class="num">${brl(tot)}</td><td class="num">${brl(pago)}</td>
      <td>${mats.length ? (atraso > 0 ? '<span class="tag atrasado">Em atraso</span>' : tot - pago <= 0.009 ? '<span class="tag pago">Quitado</span>' : '<span class="tag aberto">Em dia</span>') : ''}</td>
    </tr>`;
  }).join('');
  return `
  <div class="sec-head">
    <div><h1>Alunos</h1><p class="muted">${db.aluno.length} aluno(s) cadastrados.</p></div>
    <div class="acoes"><button class="btn" onclick="G.editarAluno()">+ Novo aluno</button><button class="btn primary" onclick="G.novaMatricula()">+ Nova matrícula</button></div>
  </div>
  <div class="filtros"><input type="search" placeholder="Buscar por nome, WhatsApp, e-mail ou CPF" value="${h(estado.alunosBusca)}" oninput="G.buscaAlunos(this.value)" id="buscaAlunos"></div>
  <div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>WhatsApp</th><th>Cursos</th><th class="num">Total</th><th class="num">Pago</th><th>Situação</th></tr></thead>
  <tbody>${linhas || '<tr><td colspan="6" class="vazio">Nenhum aluno encontrado.</td></tr>'}</tbody></table></div>`;
}

function formAlunoCampos(a) {
  return `
    <label class="inteira">Nome completo<input name="nome" value="${h(a.nome)}" required></label>
    <label>WhatsApp<input name="whatsapp" value="${h(a.whatsapp)}" inputmode="tel" placeholder="(61) 99999-9999"></label>
    <label>E-mail<input name="email" type="email" value="${h(a.email)}"></label>
    <label>CPF<input name="cpf" value="${h(a.cpf)}" inputmode="numeric"></label>
    <label>Cidade<input name="cidade" value="${h(a.cidade)}"></label>
    <label class="inteira">Instagram<input name="instagram" value="${h(a.instagram)}" placeholder="@"></label>`;
}
function editarAluno(id, aoSalvar) {
  const a = id ? structuredClone(porId('aluno', id)) : { tipo: 'aluno', nome: '', whatsapp: '', email: '', cpf: '', cidade: '', instagram: '', obs: '', criadoEm: new Date().toISOString() };
  abrirModal(id ? 'Editar aluno' : 'Novo aluno', `
    <form id="fAluno"><div class="form">${formAlunoCampos(a)}
      <label class="inteira">Observações<textarea name="obs">${h(a.obs)}</textarea></label></div>
      <div class="form-acoes">
        ${id ? '<button type="button" class="btn perigo esq" id="delAluno">Apagar aluno</button>' : ''}
        <button type="button" class="btn ghost" onclick="G.fechar()">Cancelar</button><button class="btn primary">Salvar</button>
      </div></form>`, (el) => {
    if (id) $('#delAluno', el).onclick = async () => {
      if (db.matricula.some((m) => m.alunoId === id)) return toast('Este aluno tem matrículas. Cancele ou apague as matrículas primeiro.');
      if (!confirm('Apagar este aluno?')) return;
      await apagar(porId('aluno', id)); fecharModal(); render();
    };
    $('#fAluno', el).onsubmit = async (e) => {
      e.preventDefault();
      const f = dadosForm(e.target);
      Object.assign(a, { nome: f.nome.trim(), whatsapp: f.whatsapp, email: f.email, cpf: f.cpf, cidade: f.cidade, instagram: f.instagram, obs: f.obs });
      await salvar(a); fecharModal(); render(); toast('Aluno salvo');
      if (aoSalvar) aoSalvar(a);
    };
  });
}
function verAluno(id) {
  const a = porId('aluno', id); if (!a) return;
  const mats = db.matricula.filter((m) => m.alunoId === id).sort((x, y) => (y.data || '').localeCompare(x.data || ''));
  const link = linkWhats(a.whatsapp, `Olá, ${a.nome.split(' ')[0]}! Tudo bem? Aqui é do Instituto Inova.`);
  abrirModal(a.nome, `
    <div class="resumo">
      ${a.whatsapp ? 'WhatsApp: <b>' + h(foneBR(a.whatsapp)) + '</b><br>' : ''}${a.email ? 'E-mail: ' + h(a.email) + '<br>' : ''}${a.cpf ? 'CPF: ' + h(a.cpf) + '<br>' : ''}${a.cidade ? 'Cidade: ' + h(a.cidade) + '<br>' : ''}${a.instagram ? 'Instagram: ' + h(a.instagram) + '<br>' : ''}${a.obs ? '<span class="muted">' + h(a.obs) + '</span>' : ''}
    </div>
    <div class="acoes" style="margin:14px 0">
      ${link ? `<a class="btn whats small" target="_blank" rel="noopener" href="${link}">WhatsApp</a>` : ''}
      <button class="btn small" onclick="G.editarAluno('${id}')">Editar dados</button>
      <button class="btn small" onclick="G.editarRetorno(null,{nome:${h(JSON.stringify(a.nome))},whatsapp:${h(JSON.stringify(a.whatsapp || ''))},alunoId:'${id}'})">Agendar retorno</button>
      <button class="btn primary small" onclick="G.novaMatricula({alunoId:'${id}'})">+ Matrícula</button>
    </div>
    <b style="color:var(--verde)">Matrículas</b>
    <div class="lista" style="margin-top:8px">
      ${mats.map((m) => { const r = resumoMatricula(m); return `<div class="item" style="cursor:pointer" onclick="G.verMatricula('${m.id}')"><div class="info"><div class="t">${h(nomeCurso(m.cursoId))}</div><div class="s">${h(nomeTurma(m.turmaId) || 'Sem turma')} · ${h(m.planoNome || '')} · ${brl(r.pago)} de ${brl(r.total)}</div></div>${tagSituacao(r.situacao)}</div>`; }).join('') || '<p class="muted">Nenhuma matrícula.</p>'}
    </div>`);
}

// ================= MATRÍCULAS =================
function novaMatricula(pre = {}) {
  const turmaPre = pre.turmaId ? porId('turma', pre.turmaId) : null;
  const cursoIni = turmaPre?.cursoId || pre.lead?.cursoId || pre.cursoId || estado.filtroCursoPainel || '';
  const alunosOrd = [...db.aluno].sort((a, b) => a.nome.localeCompare(b.nome));
  const hoje = hojeISO();
  abrirModal('Nova matrícula', `
    <form id="fMat">
      <div class="passo"><span>1</span> Aluno</div>
      <div class="form">
        <label class="inteira">Quem está se matriculando?
          <select name="alunoId" id="selAluno">
            <option value="__novo">+ Cadastrar novo aluno</option>
            ${alunosOrd.map((a) => `<option value="${a.id}" ${pre.alunoId === a.id ? 'selected' : ''}>${h(a.nome)}${a.whatsapp ? ' · ' + h(foneBR(a.whatsapp)) : ''}</option>`).join('')}
          </select>
        </label>
        <div class="inteira form" id="novoAluno" style="padding:12px;background:#f7faf9;border-radius:12px">
          <label class="inteira">Nome completo<input name="an" value="${h(pre.lead?.nome || '')}"></label>
          <label>WhatsApp<input name="aw" value="${h(pre.lead?.whatsapp || '')}" inputmode="tel" placeholder="(61) 99999-9999"></label>
          <label>CPF<input name="ac" inputmode="numeric"></label>
        </div>
      </div>
      <div class="passo"><span>2</span> Curso</div>
      <input type="hidden" name="cursoId" id="selCurso" value="${h(cursoIni)}">
      <div class="escolha-cursos">
        ${cursosPorCategoria(true, cursoIni).map(([cat, lista]) => `<div class="cat-titulo">${h(cat)}</div><div class="chips">${lista.map((c) => `<button type="button" class="chip-curso" data-curso="${c.id}"><b>${h(c.nome)}</b><small>${(c.planos || []).length > 1 ? 'a partir de ' + brl(Math.min(...c.planos.map((p) => num(p.valor)))) : (c.planos || [])[0] ? brl(c.planos[0].valor) : ''}</small></button>`).join('')}</div>`).join('')}
      </div>
      <div id="blocoPlano">
        <div class="passo"><span>3</span> Plano e turma</div>
        <input type="hidden" name="planoId" id="selPlano">
        <div class="planos-escolha" id="planosEscolha"></div>
        <div class="form" style="margin-top:12px">
          <label id="lblTurma">Turma<select name="turmaId" id="selTurma"></select></label>
          <label>Valor do plano (R$)<input name="valor" id="inValor" inputmode="decimal"></label>
        </div>
      </div>
      <p class="muted" id="avisoCurso" style="margin:8px 0 0">Toque no curso acima para ver os planos.</p>
      <div class="passo"><span>4</span> Pagamento</div>
      <div class="form">
        <label>Desconto (R$)<input name="desconto" id="inDesc" inputmode="decimal" value="0"></label>
        <label>Forma de pagamento<select name="forma">${FORMAS.map((f) => `<option>${f}</option>`).join('')}</select></label>
        <label>Data da matrícula<input type="date" name="data" value="${hoje}"></label>
        <label>Entrada paga hoje (R$)<input name="entrada" id="inEntrada" inputmode="decimal" value="0"><span class="ajuda">Se pagou tudo à vista, coloque o valor total aqui.</span></label>
        <label>Parcelas do restante<select name="nparc" id="inParc">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select></label>
        <label>1º vencimento<input type="date" name="venc1" id="inVenc" value="${somaMeses(hoje, 1)}"></label>
        <label>Vendedor(a)<input name="vendedor" placeholder="opcional"></label>
        <label class="inteira">Observações<textarea name="obs"></textarea></label>
      </div>
      <div class="resumo" id="resumoMat" style="margin-top:14px"></div>
      <div class="form-acoes"><button type="button" class="btn ghost" onclick="G.fechar()">Cancelar</button><button class="btn primary">Salvar matrícula</button></div>
    </form>`, (el) => {
    const selA = $('#selAluno', el), selC = $('#selCurso', el), selT = $('#selTurma', el), selP = $('#selPlano', el);
    const mostraNovo = () => { $('#novoAluno', el).style.display = selA.value === '__novo' ? '' : 'none'; $('[name=an]', el).required = selA.value === '__novo'; };
    selA.onchange = mostraNovo; mostraNovo();
    const carregaCurso = () => {
      const c = porId('curso', selC.value);
      $$('.chip-curso', el).forEach((b) => b.classList.toggle('ativo', b.dataset.curso === selC.value));
      $('#blocoPlano', el).style.display = c ? '' : 'none';
      $('#avisoCurso', el).style.display = c ? 'none' : '';
      if (!c) { selP.value = ''; $('#inValor', el).value = ''; atualiza(); return; }
      const turmas = turmasDoCurso(c.id).filter((t) => t.status !== 'encerrada' || t.id === pre.turmaId);
      selT.innerHTML = `<option value="">Sem turma definida</option>` + turmas.map((t) => `<option value="${t.id}" ${t.id === pre.turmaId ? 'selected' : ''}>${h(t.nome)}${t.data ? ' · ' + dataBR(t.data) : ''}</option>`).join('');
      if (!pre.turmaId && turmas.length === 1) selT.value = turmas[0].id;
      $('#lblTurma', el).style.display = turmas.length ? '' : 'none';
      const planos = c.planos || [];
      $('#planosEscolha', el).innerHTML = planos.map((p) => `<button type="button" class="plano-op" data-plano="${p.id}"><span><b>${h(p.nome)}</b>${p.bonus ? `<small>${h(p.bonus)}</small>` : ''}</span><strong>${brl(p.valor)}</strong></button>`).join('') + '<button type="button" class="plano-op" data-plano=""><span><b>Outro valor</b><small>Digite o valor combinado</small></span><strong>R$ —</strong></button>';
      selP.value = planos.length ? planos[0].id : '';
      carregaPlano();
    };
    el.addEventListener('click', (e) => {
      const bc = e.target.closest('.chip-curso');
      if (bc) { selC.value = bc.dataset.curso; pre.turmaId = null; carregaCurso(); $('#blocoPlano', el).scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
      const bp = e.target.closest('.plano-op');
      if (bp) { selP.value = bp.dataset.plano; carregaPlano(); if (!bp.dataset.plano) $('#inValor', el).focus(); }
    });
    const carregaPlano = () => {
      const c = porId('curso', selC.value) || { planos: [] };
      const p = (c.planos || []).find((x) => x.id === selP.value);
      $$('.plano-op', el).forEach((b) => b.classList.toggle('ativo', b.dataset.plano === selP.value));
      $('#inValor', el).value = p ? String(p.valor).replace('.', ',') : '';
      atualiza();
    };
    const atualiza = () => {
      const total = r2(num($('#inValor', el).value) - num($('#inDesc', el).value));
      const ent = Math.min(num($('#inEntrada', el).value), total);
      const resto = r2(total - ent);
      const n = Number($('#inParc', el).value);
      $('#resumoMat', el).innerHTML = `Valor final: <b>${brl(total)}</b>` + (ent > 0 ? ` · Entrada hoje: <b>${brl(ent)}</b>` : '') + (resto > 0 ? ` · Restante: <b>${n}x de ${brl(resto / n)}</b> a partir de ${dataBR($('#inVenc', el).value)}` : ' · <b>Quitado na matrícula</b>');
    };
    ['#inValor', '#inDesc', '#inEntrada', '#inParc', '#inVenc'].forEach((s) => $(s, el).addEventListener('input', atualiza));
    carregaCurso();

    $('#fMat', el).onsubmit = async (e) => {
      e.preventDefault();
      const f = dadosForm(e.target);
      if (!f.cursoId) return toast('Escolha o curso.');
      const total = r2(num(f.valor) - num(f.desconto));
      if (total < 0) return toast('O desconto é maior que o valor.');
      let alunoId = f.alunoId;
      if (alunoId === '__novo') {
        if (!f.an.trim()) return toast('Digite o nome do aluno.');
        const a = await salvar({ tipo: 'aluno', nome: f.an.trim(), whatsapp: f.aw, cpf: f.ac, email: '', cidade: '', instagram: '', obs: '', criadoEm: new Date().toISOString() });
        alunoId = a.id;
      }
      const c = porId('curso', f.cursoId);
      const plano = (c.planos || []).find((p) => p.id === f.planoId);
      const ent = r2(Math.min(num(f.entrada), total));
      const parcelas = [];
      if (ent > 0) parcelas.push({ id: uid(), n: 0, valor: ent, venc: f.data, pagoEm: f.data, formaPag: f.forma });
      const resto = r2(total - ent);
      if (resto > 0) {
        const n = Number(f.nparc) || 1;
        const base = Math.floor((resto / n) * 100) / 100;
        for (let i = 0; i < n; i++) {
          const valor = i === n - 1 ? r2(resto - base * (n - 1)) : base;
          parcelas.push({ id: uid(), n: i + 1, valor, venc: somaMeses(f.venc1 || f.data, i), pagoEm: '', formaPag: '' });
        }
      }
      const m = await salvar({
        tipo: 'matricula', alunoId, cursoId: f.cursoId, turmaId: f.turmaId, planoId: f.planoId, planoNome: plano ? plano.nome : 'Valor personalizado',
        valorPlano: num(f.valor), desconto: num(f.desconto), valorFinal: total, forma: f.forma, status: 'ativa', data: f.data, vendedor: f.vendedor, obs: f.obs, parcelas,
      });
      if (pre.lead) { const l = porId('lead', pre.lead.id); if (l) { l.etapa = 'matriculado'; l.alunoId = alunoId; await salvar(l); } }
      fecharModal(); render(); toast('Matrícula salva!');
      verMatricula(m.id);
    };
  });
}
const FORMAS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Boleto', 'Transferência', 'Link de pagamento'];

function verMatricula(id) {
  const m = structuredClone(porId('matricula', id)); if (!m) return;
  const a = porId('aluno', m.alunoId) || {};
  const desenha = () => {
    const r = resumoMatricula(m);
    const somaParc = r2((m.parcelas || []).reduce((s, p) => s + num(p.valor), 0));
    const difer = r2(somaParc - num(m.valorFinal));
    return `
    <div class="resumo">
      <b>${h(a.nome || '')}</b> · ${h(foneBR(a.whatsapp))}<br>
      ${h(nomeCurso(m.cursoId))}${m.turmaId ? ' · ' + h(nomeTurma(m.turmaId)) : ''}<br>
      Plano: ${h(m.planoNome || '')} · ${brl(m.valorPlano)}${num(m.desconto) ? ' − desconto ' + brl(m.desconto) : ''} = <b>${brl(m.valorFinal)}</b><br>
      Pago: <b>${brl(r.pago)}</b> · Falta: <b>${brl(Math.max(0, r.saldo))}</b> · ${tagSituacao(r.situacao)}
      ${Math.abs(difer) > 0.009 ? `<br><span style="color:var(--vermelho)">Atenção: a soma das parcelas (${brl(somaParc)}) está diferente do valor final.</span>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px"><b style="color:var(--verde)">Parcelas</b><button class="btn small" data-a="addp">+ Parcela</button></div>
    <div class="tabela-wrap"><table><thead><tr><th>#</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
    ${(m.parcelas || []).map((p) => `<tr>
      <td>${p.n === 0 ? 'Entrada' : p.n}</td>
      <td><input type="date" value="${h(p.venc)}" data-p="${p.id}" data-k="venc" style="border:1px solid var(--linha);border-radius:8px;padding:5px"></td>
      <td class="num"><input value="${h(String(p.valor).replace('.', ','))}" data-p="${p.id}" data-k="valor" inputmode="decimal" style="width:90px;text-align:right;border:1px solid var(--linha);border-radius:8px;padding:5px"></td>
      <td>${tagParcela(p)}${p.pagoEm ? `<div class="muted" style="font-size:11px">${dataBR(p.pagoEm)}${p.formaPag ? ' · ' + h(p.formaPag) : ''}</div>` : ''}</td>
      <td class="num">${p.pagoEm ? `<button class="btn small ghost" data-a="desfaz" data-p="${p.id}">Desfazer</button>` : `<button class="btn small" data-a="paga" data-p="${p.id}">Recebi</button>`}
        ${!p.pagoEm && a.whatsapp ? `<a class="btn small whats" target="_blank" rel="noopener" href="${linkWhats(a.whatsapp, msgCobranca(m, p))}">Cobrar</a>` : ''}
        <button class="btn small perigo" data-a="delp" data-p="${p.id}" title="Tirar parcela">×</button></td>
    </tr>`).join('') || '<tr><td colspan="5" class="vazio">Sem parcelas.</td></tr>'}
    </tbody></table></div>
    <div class="form" style="margin-top:14px">
      <label>Turma<select data-k="turmaId"><option value="">Sem turma definida</option>${turmasDoCurso(m.cursoId).map((t) => `<option value="${t.id}" ${t.id === m.turmaId ? 'selected' : ''}>${h(t.nome)}</option>`).join('')}</select></label>
      <label>Valor final (R$)<input data-k="valorFinal" value="${h(String(m.valorFinal).replace('.', ','))}" inputmode="decimal"></label>
      <label class="inteira">Observações<textarea data-k="obs">${h(m.obs || '')}</textarea></label>
    </div>
    <div class="form-acoes">
      ${m.status === 'cancelada' ? '<button class="btn esq" data-a="reativar">Reativar matrícula</button>' : '<button class="btn perigo esq" data-a="cancelar">Cancelar matrícula</button>'}
      <button class="btn perigo" data-a="apagar">Apagar</button>
      <button class="btn primary" data-a="salvar">Salvar alterações</button>
    </div>`;
  };
  abrirModal('Matrícula', desenha(), (el) => {
    const redesenha = () => { el.innerHTML = desenha(); };
    const lerCampos = () => {
      $$('[data-p][data-k]', el).forEach((inp) => { const p = m.parcelas.find((x) => x.id === inp.dataset.p); if (p) p[inp.dataset.k] = inp.dataset.k === 'valor' ? num(inp.value) : inp.value; });
      $$('[data-k]:not([data-p])', el).forEach((inp) => { m[inp.dataset.k] = inp.dataset.k === 'valorFinal' ? num(inp.value) : inp.value; });
    };
    const grava = async (msg) => { lerCampos(); await salvar(structuredClone(m)); render(); toast(msg); };
    el.onclick = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const acao = b.dataset.a; const pid = b.dataset.p;
      const p = pid && m.parcelas.find((x) => x.id === pid);
      if (acao === 'paga') {
        lerCampos();
        const forma = prompt('Como foi pago? (Pix, Cartão, Dinheiro…)', m.forma || 'Pix');
        if (forma === null) return;
        p.pagoEm = hojeISO(); p.formaPag = forma;
        await grava('Pagamento registrado'); redesenha();
      } else if (acao === 'desfaz') {
        lerCampos(); p.pagoEm = ''; p.formaPag = ''; await grava('Pagamento desfeito'); redesenha();
      } else if (acao === 'delp') {
        if (!confirm('Tirar esta parcela?')) return;
        lerCampos(); m.parcelas = m.parcelas.filter((x) => x.id !== pid); redesenha();
      } else if (acao === 'addp') {
        lerCampos();
        const ult = m.parcelas[m.parcelas.length - 1];
        const r = resumoMatricula(m);
        const somaParc = r2(m.parcelas.reduce((s, x) => s + num(x.valor), 0));
        m.parcelas.push({ id: uid(), n: Math.max(0, ...m.parcelas.map((x) => x.n)) + 1, valor: Math.max(0, r2(num(m.valorFinal) - somaParc)), venc: ult?.venc ? somaMeses(ult.venc, 1) : hojeISO(), pagoEm: '', formaPag: '' });
        redesenha();
      } else if (acao === 'cancelar') {
        if (!confirm('Cancelar esta matrícula? Ela sai dos totais e das cobranças, mas fica guardada.')) return;
        m.status = 'cancelada'; await grava('Matrícula cancelada'); redesenha();
      } else if (acao === 'reativar') {
        m.status = 'ativa'; await grava('Matrícula reativada'); redesenha();
      } else if (acao === 'apagar') {
        if (!confirm('Apagar esta matrícula de vez? Isso não tem volta.')) return;
        await apagar(porId('matricula', id)); fecharModal(); render(); toast('Matrícula apagada');
      } else if (acao === 'salvar') {
        await grava('Matrícula salva'); fecharModal();
      }
    };
  });
}

async function pagarParcela(mid, pid) {
  const m = porId('matricula', mid); if (!m) return;
  const p = m.parcelas.find((x) => x.id === pid); if (!p) return;
  const forma = prompt(`Registrar pagamento de ${brl(p.valor)} de ${nomeAluno(m.alunoId)}.\nComo foi pago?`, m.forma || 'Pix');
  if (forma === null) return;
  p.pagoEm = hojeISO(); p.formaPag = forma;
  await salvar(m); render(); toast('Pagamento registrado');
}

// ================= FINANCEIRO =================
function filtrarMatriculas() {
  const { busca, curso, situacao, status } = estado.fin;
  const q = normaliza(busca);
  return db.matricula.filter((m) => {
    if (status === 'ativa' && m.status === 'cancelada') return false;
    if (status === 'cancelada' && m.status !== 'cancelada') return false;
    if (curso && m.cursoId !== curso) return false;
    const r = resumoMatricula(m);
    if (situacao && r.situacao !== situacao) return false;
    if (q && !normaliza(nomeAluno(m.alunoId) + ' ' + nomeCurso(m.cursoId) + ' ' + nomeTurma(m.turmaId)).includes(q)) return false;
    return true;
  }).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}
function vFinanceiro() {
  const f = estado.fin;
  const mats = filtrarMatriculas();
  let tot = 0, pago = 0, atraso = 0;
  const linhas = mats.map((m) => {
    const r = resumoMatricula(m); tot += r.total; pago += r.pago; atraso += r.atrasado;
    return `<tr class="clicavel" onclick="G.verMatricula('${m.id}')">
      <td>${dataBR(m.data)}</td>
      <td><b>${h(nomeAluno(m.alunoId))}</b></td>
      <td>${h(nomeCurso(m.cursoId))}<div class="muted" style="font-size:12px">${h(nomeTurma(m.turmaId))}${m.planoNome ? ' · ' + h(m.planoNome) : ''}</div></td>
      <td class="num">${brl(r.total)}</td><td class="num">${brl(r.pago)}</td><td class="num">${brl(Math.max(0, r.saldo))}</td>
      <td>${tagSituacao(r.situacao)}</td>
    </tr>`;
  }).join('');
  // recebimentos por mês (últimos 6 meses)
  const meses = {};
  db.matricula.forEach((m) => (m.parcelas || []).forEach((p) => { if (p.pagoEm) { const k = p.pagoEm.slice(0, 7); meses[k] = (meses[k] || 0) + num(p.valor); } }));
  const chaves = Object.keys(meses).sort().slice(-6);
  const maxMes = Math.max(1, ...chaves.map((k) => meses[k]));
  const nomeMes = (k) => new Date(k + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  return `
  <div class="sec-head">
    <div><h1>Financeiro</h1><p class="muted">Todas as matrículas, quanto cada aluno já pagou e quanto falta.</p></div>
    <div class="acoes"><button class="btn" onclick="G.csvFinanceiro()">Baixar planilha</button><button class="btn primary" onclick="G.novaMatricula()">+ Nova matrícula</button></div>
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="rot">Vendido (filtro)</div><div class="val">${brl(tot)}</div><div class="det">${mats.length} matrícula(s)</div></div>
    <div class="card kpi ok"><div class="rot">Recebido</div><div class="val">${brl(pago)}</div></div>
    <div class="card kpi"><div class="rot">Falta receber</div><div class="val">${brl(Math.max(0, tot - pago))}</div></div>
    <div class="card kpi ${atraso > 0 ? 'alerta' : ''}"><div class="rot">Em atraso</div><div class="val">${brl(atraso)}</div></div>
  </div>
  ${chaves.length ? `<div class="card" style="margin-bottom:16px"><h3>Recebido por mês</h3><div style="display:flex;gap:10px;align-items:flex-end;height:140px;margin-top:12px">
    ${chaves.map((k) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end"><span style="font-size:11px;font-weight:600;color:var(--verde)">${brl(meses[k]).replace(',00', '')}</span><div style="width:100%;max-width:56px;background:linear-gradient(180deg,var(--verde-3),var(--verde));border-radius:8px 8px 3px 3px;height:${Math.max(4, (meses[k] / maxMes) * 100)}%"></div><span style="font-size:12px;color:var(--muted)">${nomeMes(k)}</span></div>`).join('')}
  </div></div>` : ''}
  <div class="filtros">
    <input type="search" placeholder="Buscar aluno, curso ou turma" value="${h(f.busca)}" oninput="G.filtroFin('busca',this.value)" id="buscaFin">
    <select onchange="G.filtroFin('curso',this.value)"><option value="">Todos os cursos</option>${opcoesCursos(f.curso)}</select>
    <select onchange="G.filtroFin('situacao',this.value)"><option value="">Qualquer situação</option>${['Em dia', 'Em atraso', 'Quitado'].map((s) => `<option ${f.situacao === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <select onchange="G.filtroFin('status',this.value)"><option value="ativa" ${f.status === 'ativa' ? 'selected' : ''}>Matrículas ativas</option><option value="cancelada" ${f.status === 'cancelada' ? 'selected' : ''}>Canceladas</option><option value="" ${f.status === '' ? 'selected' : ''}>Todas</option></select>
  </div>
  <div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Aluno</th><th>Curso</th><th class="num">Valor</th><th class="num">Pago</th><th class="num">Falta</th><th>Situação</th></tr></thead>
  <tbody>${linhas || '<tr><td colspan="7" class="vazio">Nenhuma matrícula encontrada.</td></tr>'}</tbody></table></div>`;
}

// ================= COBRANÇAS =================
function vCobrancas() {
  const abertas = todasParcelasAbertas();
  const grupos = {
    atrasadas: abertas.filter(({ p }) => statusParcela(p) === 'atrasado'),
    semana: abertas.filter(({ p }) => p.venc && diasAte(p.venc) >= 0 && diasAte(p.venc) <= 7),
    todas: abertas,
  };
  const lista = grupos[estado.cobr] || grupos.atrasadas;
  const soma = (l) => brl(l.reduce((s, { p }) => s + num(p.valor), 0));
  return `
  <div class="sec-head">
    <div><h1>Cobranças</h1><p class="muted">Parcelas em aberto. O botão WhatsApp já abre a mensagem pronta${config().pix ? ' com a chave Pix' : ''}.</p></div>
  </div>
  <div class="grid kpis">
    <div class="card kpi ${grupos.atrasadas.length ? 'alerta' : ''}"><div class="rot">Atrasadas</div><div class="val">${soma(grupos.atrasadas)}</div><div class="det">${grupos.atrasadas.length} parcela(s)</div></div>
    <div class="card kpi"><div class="rot">Vencem em 7 dias</div><div class="val">${soma(grupos.semana)}</div><div class="det">${grupos.semana.length} parcela(s)</div></div>
    <div class="card kpi"><div class="rot">Total em aberto</div><div class="val">${soma(grupos.todas)}</div><div class="det">${grupos.todas.length} parcela(s)</div></div>
  </div>
  <div class="filtros"><div class="seg">
    ${[['atrasadas', 'Atrasadas'], ['semana', 'Próximos 7 dias'], ['todas', 'Todas em aberto']].map(([k, n]) => `<button class="${estado.cobr === k ? 'ativo' : ''}" onclick="G.abaCobr('${k}')">${n}</button>`).join('')}
  </div></div>
  <div class="lista">${lista.map(({ m, p }) => itemCobranca(m, p)).join('') || '<div class="card vazio">Nada por aqui. 🎉</div>'}</div>
  ${!config().pix ? '<p class="muted" style="margin-top:14px">Dica: cadastre sua chave Pix em <a href="#config">Configurações</a> para ela ir junto na mensagem de cobrança.</p>' : ''}`;
}

// ================= RETORNOS =================
function itemRetorno(r) {
  const cfg = config();
  const texto = (cfg.msgRetorno || 'Olá, {nome}!').replaceAll('{nome}', (r.nome || '').split(' ')[0]).replaceAll('{assunto}', r.motivo || 'nossa conversa');
  const link = linkWhats(r.whatsapp, texto);
  const d = r.data ? diasAte(r.data) : null;
  const quando = d === null ? '' : d < 0 ? `atrasado ${-d} dia${d < -1 ? 's' : ''}` : d === 0 ? 'hoje' : dataBR(r.data);
  return `<div class="item" style="${r.feito ? 'opacity:.6' : ''}">
    <div class="info" style="cursor:pointer" onclick="G.editarRetorno('${r.id}')"><div class="t">${h(r.nome)}${r.hora ? ' · ' + h(r.hora) : ''}</div><div class="s">${h(r.motivo || 'Retorno')}${quando ? ' · ' + quando : ''}</div></div>
    <div class="acoes">
      ${d !== null && d < 0 && !r.feito ? '<span class="tag atrasado">Atrasado</span>' : ''}
      ${link && !r.feito ? `<a class="btn small whats" target="_blank" rel="noopener" href="${link}">WhatsApp</a>` : ''}
      ${r.feito ? `<span class="tag pago">Feito</span>` : `<button class="btn small" onclick="G.retornoFeito('${r.id}')">Feito</button>`}
    </div>
  </div>`;
}
function vRetornos() {
  const hoje = hojeISO();
  const pend = db.retorno.filter((r) => !r.feito).sort((a, b) => (a.data || '9').localeCompare(b.data || '9') || (a.hora || '').localeCompare(b.hora || ''));
  const feitos = db.retorno.filter((r) => r.feito).sort((a, b) => (b.feitoEm || '').localeCompare(a.feitoEm || '')).slice(0, 50);
  const atras = pend.filter((r) => r.data && r.data < hoje), hj = pend.filter((r) => r.data === hoje), prox = pend.filter((r) => !r.data || r.data > hoje);
  const bloco = (t, l) => (l.length ? `<h3 style="color:var(--verde);margin:16px 0 8px">${t} <span class="muted" style="font-weight:500">(${l.length})</span></h3><div class="lista">${l.map(itemRetorno).join('')}</div>` : '');
  return `
  <div class="sec-head">
    <div><h1>Retornos</h1><p class="muted">Agenda de quem você precisa chamar de volta: interessados, alunos e cobranças combinadas.</p></div>
    <div class="acoes"><button class="btn primary" onclick="G.editarRetorno()">+ Agendar retorno</button></div>
  </div>
  <div class="filtros"><div class="seg">
    <button class="${estado.ret === 'pendentes' ? 'ativo' : ''}" onclick="G.abaRet('pendentes')">Pendentes (${pend.length})</button>
    <button class="${estado.ret === 'feitos' ? 'ativo' : ''}" onclick="G.abaRet('feitos')">Feitos</button>
  </div></div>
  ${estado.ret === 'feitos'
    ? bloco('Feitos recentemente', feitos) || '<div class="card vazio">Nenhum retorno feito ainda.</div>'
    : (bloco('Atrasados', atras) + bloco('Hoje', hj) + bloco('Próximos', prox)) || '<div class="card vazio">Nenhum retorno agendado.</div>'}`;
}
function editarRetorno(id, pre = {}) {
  const r = id ? structuredClone(porId('retorno', id)) : { tipo: 'retorno', nome: '', whatsapp: '', data: somaDias(1), hora: '', motivo: '', feito: false, ...pre };
  abrirModal(id ? 'Retorno' : 'Agendar retorno', `
    <form id="fRet"><div class="form">
      <label class="inteira">Nome<input name="nome" value="${h(r.nome)}" required></label>
      <label>WhatsApp<input name="whatsapp" value="${h(r.whatsapp)}" inputmode="tel"></label>
      <label>Assunto<input name="motivo" value="${h(r.motivo)}" placeholder="ex.: o Workshop de 07/12"></label>
      <label>Data<input type="date" name="data" value="${h(r.data)}" required></label>
      <label>Hora<input type="time" name="hora" value="${h(r.hora)}"></label>
    </div>
    <div class="form-acoes">
      ${id ? '<button type="button" class="btn perigo esq" id="delRet">Apagar</button>' : ''}
      ${id ? `<button type="button" class="btn" id="togRet">${r.feito ? 'Marcar como pendente' : 'Marcar como feito'}</button>` : ''}
      <button class="btn primary">Salvar</button>
    </div></form>`, (el) => {
    $('#fRet', el).onsubmit = async (e) => { e.preventDefault(); const f = dadosForm(e.target); Object.assign(r, { nome: f.nome.trim(), whatsapp: f.whatsapp, motivo: f.motivo, data: f.data, hora: f.hora }); await salvar(r); fecharModal(); render(); toast('Retorno agendado'); };
    if (id) {
      $('#delRet', el).onclick = async () => { if (!confirm('Apagar este retorno?')) return; await apagar(porId('retorno', id)); fecharModal(); render(); };
      $('#togRet', el).onclick = async () => { r.feito = !r.feito; r.feitoEm = r.feito ? new Date().toISOString() : ''; await salvar(r); fecharModal(); render(); };
    }
  });
}
function somaDias(n) { const d = new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }

// ================= CONFIGURAÇÕES =================
function vConfig() {
  const cfg = config();
  const temLocal = USA_BANCO && (localStorage.getItem(CHAVE_LOCAL) || '[]').length > 2;
  return `
  <div class="sec-head"><div><h1>Configurações</h1><p class="muted">Marca, Pix, mensagens prontas e cópia de segurança.</p></div></div>
  <div class="grid duas">
    <div class="card">
      <h3>Marca</h3>
      <form id="fMarca" class="form" style="margin-top:12px" onsubmit="G.salvarConfig(event)">
        <label class="inteira">Nome que aparece no topo<input name="nomeInstituto" value="${h(cfg.nomeInstituto || 'Instituto Inova')}"></label>
        <div class="inteira" style="display:flex;gap:14px;align-items:center">
          <div class="brand-logo" style="width:72px;height:72px;background:var(--verde)">${cfg.logo ? `<img src="${h(cfg.logo)}" alt="Logo">` : '<span class="mono">I</span>'}</div>
          <div class="acoes"><label class="btn small" style="cursor:pointer;flex-direction:row;color:var(--verde)">Escolher logo<input type="file" accept="image/*" style="display:none" onchange="G.carregarLogo(this)"></label>${cfg.logo ? '<button type="button" class="btn small ghost" onclick="G.tirarLogo()">Tirar logo</button>' : ''}</div>
        </div>
        <label class="inteira">Chave Pix (vai na mensagem de cobrança)<input name="pix" value="${h(cfg.pix || '')}" placeholder="CNPJ, e-mail, telefone ou chave aleatória"></label>
        <label class="inteira">Mensagem de cobrança<textarea name="msgCobranca" style="min-height:110px">${h(cfg.msgCobranca || '')}</textarea><span class="ajuda">Use {nome}, {parcela}, {curso}, {valor}, {vencimento} e {pix}. O painel troca pelos dados do aluno.</span></label>
        <label class="inteira">Mensagem de retorno<textarea name="msgRetorno">${h(cfg.msgRetorno || '')}</textarea><span class="ajuda">Use {nome} e {assunto}.</span></label>
        <div class="inteira form-acoes" style="margin-top:0"><button class="btn primary">Salvar</button></div>
      </form>
    </div>
    <div class="grid" style="align-content:start">
      <div class="card">
        <h3>Onde os dados ficam</h3>
        <p class="muted" style="margin:8px 0 0">${USA_BANCO ? 'No banco de dados online (Supabase). Você vê as mesmas informações no celular e no computador.' : 'Somente neste navegador, por enquanto. Se limpar o navegador ou trocar de aparelho, os dados não aparecem lá. Baixe a cópia de segurança com frequência.'}</p>
        ${temLocal ? '<button class="btn ouro small" style="margin-top:10px" onclick="G.enviarLocal()">Enviar dados deste aparelho para o banco</button>' : ''}
      </div>
      <div class="card">
        <h3>Cópia de segurança</h3>
        <p class="muted" style="margin:8px 0 12px">Baixa um arquivo com tudo (cursos, alunos, matrículas, parcelas, comercial e retornos).</p>
        <div class="acoes">
          <button class="btn" onclick="G.backup()">Baixar cópia</button>
          <label class="btn ghost" style="cursor:pointer;flex-direction:row">Restaurar de um arquivo<input type="file" accept="application/json,.json" style="display:none" onchange="G.restaurar(this)"></label>
          <button class="btn" onclick="G.csvFinanceiro(true)">Planilha de matrículas</button>
        </div>
      </div>
      ${USA_BANCO && !LIVRE ? `<div class="card" id="equipeCard"><h3>Equipe com acesso</h3><p class="muted" style="margin:8px 0">Quem pode entrar no painel.</p><div id="equipeLista" class="lista mini-lista"><p class="muted">Carregando…</p></div>
        <form class="acoes" style="margin-top:10px" onsubmit="G.addEquipe(event)"><input name="email" type="email" required placeholder="e-mail da pessoa" style="flex:1;padding:9px 12px;border:1px solid var(--linha);border-radius:10px"><button class="btn small primary">Dar acesso</button></form>
        <p class="ajuda" style="margin-top:6px">A pessoa precisa primeiro criar a senha em "Primeiro acesso" na tela de entrada. Depois você libera aqui.</p></div>` : ''}
    </div>
  </div>`;
}
async function carregarEquipe() {
  const el = $('#equipeLista'); if (!el || !sb) return;
  const { data, error } = await sb.from('ge_admins').select('email,criado_em').order('criado_em');
  el.innerHTML = error ? '<p class="muted">Não consegui carregar.</p>' : data.map((a) => `<div class="item"><div class="info"><div class="t">${h(a.email)}</div></div></div>`).join('') || '<p class="muted">—</p>';
}

function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const csv = (linhas) => '﻿' + linhas.map((l) => l.map((c) => { const s = String(c ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
const valorCsv = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');

function redimensionarImagem(file, max = 320) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const esc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = erro;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- API usada pelos botões ----------
window.G = {
  fechar: fecharModal,
  filtroPainel(v) { estado.filtroCursoPainel = v; render(); },
  novaMatricula, verMatricula, pagarParcela, editarCurso, editarTurma, verTurma, editarLead, editarAluno, verAluno, editarRetorno,
  buscaAlunos(v) { estado.alunosBusca = v; render(); const i = $('#buscaAlunos'); i.focus(); i.setSelectionRange(v.length, v.length); },
  filtroFin(k, v) { estado.fin[k] = v; render(); if (k === 'busca') { const i = $('#buscaFin'); i.focus(); i.setSelectionRange(v.length, v.length); } },
  abaCobr(k) { estado.cobr = k; render(); },
  abaRet(k) { estado.ret = k; render(); },
  async retornoFeito(id) { const r = porId('retorno', id); r.feito = true; r.feitoEm = new Date().toISOString(); await salvar(r); render(); toast('Retorno marcado como feito'); },
  async salvarConfig(e) {
    e.preventDefault();
    const f = dadosForm(e.target);
    await salvar({ ...config(), tipo: 'config', id: 'config', nomeInstituto: f.nomeInstituto, pix: f.pix.trim(), msgCobranca: f.msgCobranca, msgRetorno: f.msgRetorno });
    aplicarMarca(); render(); toast('Configurações salvas');
  },
  async carregarLogo(inp) {
    const file = inp.files[0]; if (!file) return;
    try { const logo = await redimensionarImagem(file); await salvar({ ...config(), tipo: 'config', id: 'config', logo, semLogo: false }); aplicarMarca(); render(); toast('Logo atualizada'); }
    catch { toast('Não consegui abrir essa imagem.'); }
  },
  async tirarLogo() { const c = { ...config(), semLogo: true }; delete c.logo; await salvar(c); aplicarMarca(); render(); },
  backup() {
    const tudo = TIPOS.flatMap((t) => db[t]);
    baixar(`backup-gestao-inova-${hojeISO()}.json`, JSON.stringify({ app: 'gestao-educacional-inova', versao: 1, geradoEm: new Date().toISOString(), registros: tudo }, null, 1), 'application/json');
  },
  async restaurar(inp) {
    const file = inp.files[0]; if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      const regs = (j.registros || []).filter((r) => r.id && TIPOS.includes(r.tipo));
      if (!regs.length) return toast('Arquivo sem dados reconhecidos.');
      if (!confirm(`Restaurar ${regs.length} registros deste arquivo? Os itens com o mesmo código serão substituídos; os demais continuam.`)) return;
      for (const r of regs) await salvar(r);
      aplicarMarca(); render(); toast('Cópia restaurada');
    } catch (e) { console.error(e); toast('Não consegui ler esse arquivo.'); }
  },
  async enviarLocal() {
    const regs = JSON.parse(localStorage.getItem(CHAVE_LOCAL) || '[]');
    if (!confirm(`Enviar ${regs.length} registros deste aparelho para o banco online?`)) return;
    for (const r of regs) if (r.id && TIPOS.includes(r.tipo) && !(r.tipo === 'config' && r.id === 'config' && db.config.length)) await salvar(r);
    localStorage.setItem(CHAVE_LOCAL + '_enviado', localStorage.getItem(CHAVE_LOCAL));
    localStorage.removeItem(CHAVE_LOCAL);
    render(); toast('Dados enviados para o banco');
  },
  async addEquipe(e) {
    e.preventDefault();
    const email = new FormData(e.target).get('email').trim();
    const { data, error } = await sb.rpc('ge_adicionar_admin', { p_email: email });
    if (error) return toast('Não consegui dar acesso: ' + error.message);
    toast(data ? 'Acesso liberado!' : 'Esse e-mail ainda não criou senha no painel.');
    e.target.reset(); carregarEquipe();
  },
  csvTurma(id) {
    const t = porId('turma', id);
    const linhas = [['Aluno', 'WhatsApp', 'E-mail', 'CPF', 'Plano', 'Valor', 'Pago', 'Falta', 'Situação']];
    inscritosTurma(id).forEach((m) => { const a = porId('aluno', m.alunoId) || {}; const r = resumoMatricula(m); linhas.push([a.nome, foneBR(a.whatsapp), a.email, a.cpf, m.planoNome, valorCsv(r.total), valorCsv(r.pago), valorCsv(Math.max(0, r.saldo)), r.situacao]); });
    baixar(`lista-${normaliza(t.nome).replace(/[^a-z0-9]+/g, '-')}.csv`, csv(linhas), 'text/csv;charset=utf-8');
  },
  csvFinanceiro(todas = false) {
    const mats = todas ? db.matricula : filtrarMatriculas();
    const linhas = [['Data', 'Aluno', 'WhatsApp', 'Curso', 'Turma', 'Plano', 'Valor do plano', 'Desconto', 'Valor final', 'Pago', 'Falta', 'Em atraso', 'Situação', 'Forma', 'Vendedor']];
    mats.forEach((m) => { const a = porId('aluno', m.alunoId) || {}; const r = resumoMatricula(m); linhas.push([dataBR(m.data), a.nome, foneBR(a.whatsapp), nomeCurso(m.cursoId), nomeTurma(m.turmaId), m.planoNome, valorCsv(m.valorPlano), valorCsv(m.desconto), valorCsv(r.total), valorCsv(r.pago), valorCsv(Math.max(0, r.saldo)), valorCsv(r.atrasado), r.situacao, m.forma, m.vendedor]); });
    baixar(`matriculas-inova-${hojeISO()}.csv`, csv(linhas), 'text/csv;charset=utf-8');
  },
};

// ---------- funções para os módulos extras (relatórios, celular) ----------
window.GE = {
  db, estado, rotas: ROTAS, config, render, toast, abrirModal, fecharModal, salvar,
  h, brl, num, r2, dataBR, hojeISO, diasAte, linkWhats, foneBR,
  opcoesCursos, categoriaCurso, cursosPorCategoria, resumoMatricula, statusParcela, nomeCurso, nomeTurma, nomeAluno, porId, cursosOrdenados, matriculasAtivas,
};

// guarda a logo da Barbearia Inova dentro dos dados, para não depender de outro site
async function guardarLogoPadrao() {
  if (config().logo || config().semLogo) return;
  try {
    const resp = await fetch('/logo-inova.png');
    if (!resp.ok) return;
    const blob = await resp.blob();
    const logo = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
    await salvar({ ...config(), tipo: 'config', id: 'config', logo });
    aplicarMarca(); render();
  } catch (e) { console.warn('logo', e); }
}

// ---------- entrada / login ----------
async function carregarTudo() {
  const regs = await Store().carregar();
  TIPOS.forEach((t) => (db[t] = []));
  regs.forEach((r) => { if (db[r.tipo]) db[r.tipo].push(r); });
  await semearSePreciso();
}

async function iniciarApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#modoDados').textContent = USA_BANCO ? '● Online' : '● Só neste aparelho';
  $('#btnSair').classList.toggle('hidden', !USA_BANCO || LIVRE);
  try { await carregarTudo(); }
  catch (e) { console.error(e); $('#view').innerHTML = `<div class="card vazio">Não consegui carregar os dados. Verifique a internet e recarregue a página.<br><small>${h(e.message || '')}</small></div>`; return; }
  aplicarMarca();
  render();
  guardarLogoPadrao();
  // atualiza a cada 60s se estiver online (outra pessoa pode ter lançado algo)
  if (USA_BANCO) setInterval(async () => { if (!$('#modal').classList.contains('hidden') || document.hidden) return; try { await carregarTudo(); render(); } catch {} }, 60000);
  const obs = new MutationObserver(() => { if ((location.hash || '').startsWith('#config')) carregarEquipe(); });
  obs.observe($('#view'), { childList: true });
}

async function iniciar() {
  if (!USA_BANCO) return iniciarApp();
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  if (LIVRE) return iniciarApp();
  const msg = $('#loginMsg');
  const entrarSeLiberado = async () => {
    const { data, error } = await sb.rpc('ge_reivindicar_dono');
    if (error) { msg.className = 'login-msg'; msg.textContent = /function|schema cache|ge_reivindicar/i.test(error.message) ? 'O banco ainda não foi preparado. Rode o arquivo banco-supabase.sql no Supabase (SQL Editor) e tente de novo.' : 'Erro ao verificar acesso: ' + error.message; return false; }
    if (!data) { msg.className = 'login-msg'; msg.textContent = 'Seu acesso ainda não foi liberado. Peça para o responsável liberar seu e-mail em Configurações.'; await sb.auth.signOut(); return false; }
    await iniciarApp(); return true;
  };
  const { data: { session } } = await sb.auth.getSession();
  if (session && await entrarSeLiberado()) return;
  $('#login').classList.remove('hidden');
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = dadosForm(e.target);
    msg.className = 'login-msg'; msg.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.senha });
    if (error) { msg.textContent = /confirm/i.test(error.message) ? 'Confirme seu e-mail pelo link que enviamos e tente de novo.' : 'E-mail ou senha incorretos.'; return; }
    msg.textContent = '';
    await entrarSeLiberado();
  };
  $('#btnCriarAcesso').onclick = async () => {
    const f = dadosForm($('#loginForm'));
    if (!f.email || !f.senha || f.senha.length < 6) { msg.className = 'login-msg'; msg.textContent = 'Digite seu e-mail e uma senha com pelo menos 6 caracteres, depois clique aqui.'; return; }
    const { data, error } = await sb.auth.signUp({ email: f.email.trim(), password: f.senha, options: { emailRedirectTo: location.origin } });
    if (error) { msg.className = 'login-msg'; msg.textContent = 'Não consegui criar: ' + error.message; return; }
    if (data.session) { msg.textContent = ''; await entrarSeLiberado(); return; }
    msg.className = 'login-msg ok'; msg.textContent = 'Pronto! Abra seu e-mail, clique no link de confirmação e depois volte aqui para entrar.';
  };
  $('#btnSair').onclick = async () => { await sb.auth.signOut(); location.reload(); };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
