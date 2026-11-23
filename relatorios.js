// Relatórios semanais e mensais · Gestão Educacional Instituto Inova
// Usa as funções que o app.js expõe em window.GE.
const GE = window.GE;
const { h, brl, dataBR } = GE;

const st = { periodo: 'semana', de: '', ate: '', curso: '' };

const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
function intervalo() {
  const hoje = new Date(GE.hojeISO() + 'T12:00:00');
  const dow = (hoje.getDay() + 6) % 7; // segunda = 0
  const segunda = new Date(hoje); segunda.setDate(hoje.getDate() - dow);
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  switch (st.periodo) {
    case 'semana': return [iso(segunda), iso(add(segunda, 6)), 'Esta semana'];
    case 'semanaPassada': return [iso(add(segunda, -7)), iso(add(segunda, -1)), 'Semana passada'];
    case 'mes': return [iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1, 12)), iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 12)), 'Este mês'];
    case 'mesPassado': return [iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1, 12)), iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0, 12)), 'Mês passado'];
    default: return [st.de || GE.hojeISO(), st.ate || GE.hojeISO(), 'Período escolhido'];
  }
}

function calcular() {
  const [de, ate, rotulo] = intervalo();
  const dentro = (d) => d && d >= de && d <= ate;
  const fc = st.curso;
  const todas = GE.db.matricula.filter((m) => !fc || m.cursoId === fc);
  const ativas = todas.filter((m) => m.status !== 'cancelada');

  const novas = ativas.filter((m) => dentro(m.data));
  const vendido = novas.reduce((s, m) => s + GE.num(m.valorFinal), 0);
  const canceladas = todas.filter((m) => m.status === 'cancelada' && dentro((m.atualizadoEm || '').slice(0, 10)));

  const pagamentos = [];
  ativas.forEach((m) => (m.parcelas || []).forEach((p) => { if (dentro(p.pagoEm)) pagamentos.push({ m, p }); }));
  pagamentos.sort((a, b) => a.p.pagoEm.localeCompare(b.p.pagoEm));
  const recebido = pagamentos.reduce((s, { p }) => s + GE.num(p.valor), 0);
  const porForma = {};
  pagamentos.forEach(({ p }) => { const f = p.formaPag || 'Não informado'; porForma[f] = (porForma[f] || 0) + GE.num(p.valor); });

  const aVencer = [];
  ativas.forEach((m) => (m.parcelas || []).forEach((p) => { if (!p.pagoEm && dentro(p.venc)) aVencer.push({ m, p }); }));
  const previsto = aVencer.reduce((s, { p }) => s + GE.num(p.valor), 0);

  let atrasoTotal = 0, qtdAtraso = 0;
  ativas.forEach((m) => { const r = GE.resumoMatricula(m); if (r.atrasado > 0) { atrasoTotal += r.atrasado; qtdAtraso++; } });

  const porCurso = {};
  const somaCurso = (cid, k, v) => { porCurso[cid] = porCurso[cid] || { novas: 0, vendido: 0, recebido: 0 }; porCurso[cid][k] += v; };
  novas.forEach((m) => { somaCurso(m.cursoId, 'novas', 1); somaCurso(m.cursoId, 'vendido', GE.num(m.valorFinal)); });
  pagamentos.forEach(({ m, p }) => somaCurso(m.cursoId, 'recebido', GE.num(p.valor)));

  const leads = GE.db.lead.filter((l) => dentro((l.criadoEm || '').slice(0, 10)) && (!fc || l.cursoId === fc));
  const leadsMatriculados = leads.filter((l) => l.etapa === 'matriculado').length;
  const retornosFeitos = GE.db.retorno.filter((r) => r.feito && dentro((r.feitoEm || '').slice(0, 10))).length;

  return { de, ate, rotulo, novas, vendido, canceladas, pagamentos, recebido, porForma, aVencer, previsto, atrasoTotal, qtdAtraso, porCurso, leads, leadsMatriculados, retornosFeitos };
}

function textoWhats(r) {
  const cfg = GE.config();
  const linhas = [
    `*Relatório ${cfg.nomeInstituto || 'Instituto Inova'}*`,
    `${r.rotulo}: ${dataBR(r.de)} a ${dataBR(r.ate)}${st.curso ? '\nCurso: ' + GE.nomeCurso(st.curso) : ''}`,
    '',
    `📝 Novas matrículas: ${r.novas.length} (${brl(r.vendido)})`,
    `💰 Recebido: ${brl(r.recebido)}`,
    ...Object.entries(r.porForma).map(([f, v]) => `   • ${f}: ${brl(v)}`),
    `📅 Parcelas que vencem no período: ${brl(r.previsto)} (${r.aVencer.length})`,
    `⚠️ Em atraso hoje: ${brl(r.atrasoTotal)} (${r.qtdAtraso} aluno${r.qtdAtraso === 1 ? '' : 's'})`,
    `🙋 Novos interessados: ${r.leads.length}${r.leads.length ? ` (${r.leadsMatriculados} já matriculado${r.leadsMatriculados === 1 ? '' : 's'})` : ''}`,
  ];
  if (r.canceladas.length) linhas.push(`❌ Cancelamentos: ${r.canceladas.length}`);
  const cursos = Object.entries(r.porCurso);
  if (cursos.length) {
    linhas.push('', '*Por curso*');
    cursos.forEach(([cid, v]) => linhas.push(`• ${GE.nomeCurso(cid)}: ${v.novas} matrícula${v.novas === 1 ? '' : 's'}, recebido ${brl(v.recebido)}`));
  }
  return linhas.join('\n');
}

function csvRelatorio(r) {
  const vc = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
  const linhas = [['Tipo', 'Data', 'Aluno', 'Curso', 'Plano/Parcela', 'Valor', 'Forma']];
  r.novas.forEach((m) => linhas.push(['Matrícula', dataBR(m.data), GE.nomeAluno(m.alunoId), GE.nomeCurso(m.cursoId), m.planoNome, vc(m.valorFinal), m.forma]));
  r.pagamentos.forEach(({ m, p }) => linhas.push(['Pagamento', dataBR(p.pagoEm), GE.nomeAluno(m.alunoId), GE.nomeCurso(m.cursoId), p.n === 0 ? 'Entrada' : 'Parcela ' + p.n, vc(p.valor), p.formaPag]));
  r.aVencer.forEach(({ m, p }) => linhas.push(['A vencer', dataBR(p.venc), GE.nomeAluno(m.alunoId), GE.nomeCurso(m.cursoId), p.n === 0 ? 'Entrada' : 'Parcela ' + p.n, vc(p.valor), '']));
  return '﻿' + linhas.map((l) => l.map((c) => { const s = String(c ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
}

function vRelatorios() {
  const r = calcular();
  const cursosLinhas = Object.entries(r.porCurso).sort((a, b) => b[1].recebido + b[1].vendido - (a[1].recebido + a[1].vendido));
  const formas = Object.entries(r.porForma).sort((a, b) => b[1] - a[1]);
  const maxForma = Math.max(1, ...formas.map(([, v]) => v));
  const per = [['semana', 'Esta semana'], ['semanaPassada', 'Semana passada'], ['mes', 'Este mês'], ['mesPassado', 'Mês passado'], ['livre', 'Escolher datas']];
  return `
  <div class="sec-head">
    <div><h1>Relatórios</h1><p class="muted">Resumo da semana ou do mês para acompanhar e enviar.</p></div>
    <div class="acoes">
      <button class="btn whats" onclick="GER.whats()">Enviar no WhatsApp</button>
      <button class="btn" onclick="GER.copiar()">Copiar texto</button>
      <button class="btn" onclick="window.print()">PDF / Imprimir</button>
      <button class="btn" onclick="GER.planilha()">Planilha</button>
    </div>
  </div>
  <div class="filtros">
    <div class="seg">${per.map(([k, n]) => `<button class="${st.periodo === k ? 'ativo' : ''}" onclick="GER.periodo('${k}')">${n}</button>`).join('')}</div>
    ${st.periodo === 'livre' ? `<input type="date" value="${h(r.de)}" onchange="GER.data('de',this.value)"><input type="date" value="${h(r.ate)}" onchange="GER.data('ate',this.value)">` : ''}
    <select onchange="GER.curso(this.value)"><option value="">Todos os cursos</option>${GE.opcoesCursos(st.curso)}</select>
  </div>

  <div class="relatorio">
    <div class="rel-cab">
      <div class="rel-logo">${GE.config().logo ? `<img src="${h(GE.config().logo)}" alt="">` : ''}</div>
      <div><h2>Relatório · ${h(r.rotulo)}</h2><div class="muted">${dataBR(r.de)} a ${dataBR(r.ate)}${st.curso ? ' · ' + h(GE.nomeCurso(st.curso)) : ''}</div></div>
    </div>
    <div class="grid kpis">
      <div class="card kpi"><div class="rot">Novas matrículas</div><div class="val">${r.novas.length}</div><div class="det">${brl(r.vendido)} vendidos</div></div>
      <div class="card kpi ok"><div class="rot">Recebido</div><div class="val">${brl(r.recebido)}</div><div class="det">${r.pagamentos.length} pagamento(s)</div></div>
      <div class="card kpi"><div class="rot">Vence no período</div><div class="val">${brl(r.previsto)}</div><div class="det">${r.aVencer.length} parcela(s) em aberto</div></div>
      <div class="card kpi ${r.atrasoTotal > 0 ? 'alerta' : ''}"><div class="rot">Em atraso hoje</div><div class="val">${brl(r.atrasoTotal)}</div><div class="det">${r.qtdAtraso} aluno(s)</div></div>
      <div class="card kpi"><div class="rot">Novos interessados</div><div class="val">${r.leads.length}</div><div class="det">${r.leadsMatriculados} matriculado(s) · ${r.retornosFeitos} retorno(s) feitos</div></div>
    </div>

    <div class="grid duas" style="margin-bottom:16px">
      <div class="card">
        <h3>Por curso</h3>
        <div class="tabela-wrap" style="box-shadow:none;margin-top:10px"><table><thead><tr><th>Curso</th><th class="num">Matrículas</th><th class="num">Vendido</th><th class="num">Recebido</th></tr></thead><tbody>
        ${cursosLinhas.map(([cid, v]) => `<tr><td>${h(GE.nomeCurso(cid))}</td><td class="num">${v.novas}</td><td class="num">${brl(v.vendido)}</td><td class="num">${brl(v.recebido)}</td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Sem movimento no período.</td></tr>'}
        </tbody></table></div>
      </div>
      <div class="card">
        <h3>Recebido por forma de pagamento</h3>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
        ${formas.map(([f, v]) => `<div><div class="linha-val"><span>${h(f)}</span><b>${brl(v)}</b></div><div class="barra ouro"><i style="width:${(v / maxForma) * 100}%"></i></div></div>`).join('') || '<p class="muted">Nenhum pagamento no período.</p>'}
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>Matrículas do período</h3>
      <div class="tabela-wrap" style="box-shadow:none;margin-top:10px"><table><thead><tr><th>Data</th><th>Aluno</th><th>Curso</th><th>Plano</th><th class="num">Valor</th></tr></thead><tbody>
      ${r.novas.sort((a, b) => (a.data || '').localeCompare(b.data || '')).map((m) => `<tr class="clicavel" onclick="G.verMatricula('${m.id}')"><td>${dataBR(m.data)}</td><td>${h(GE.nomeAluno(m.alunoId))}</td><td>${h(GE.nomeCurso(m.cursoId))}</td><td>${h(m.planoNome || '')}</td><td class="num">${brl(m.valorFinal)}</td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhuma matrícula no período.</td></tr>'}
      </tbody></table></div>
    </div>

    <div class="card">
      <h3>Pagamentos recebidos</h3>
      <div class="tabela-wrap" style="box-shadow:none;margin-top:10px"><table><thead><tr><th>Data</th><th>Aluno</th><th>Curso</th><th>Parcela</th><th>Forma</th><th class="num">Valor</th></tr></thead><tbody>
      ${r.pagamentos.map(({ m, p }) => `<tr class="clicavel" onclick="G.verMatricula('${m.id}')"><td>${dataBR(p.pagoEm)}</td><td>${h(GE.nomeAluno(m.alunoId))}</td><td>${h(GE.nomeCurso(m.cursoId))}</td><td>${p.n === 0 ? 'Entrada' : p.n}</td><td>${h(p.formaPag || '')}</td><td class="num">${brl(p.valor)}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum pagamento no período.</td></tr>'}
      </tbody></table></div>
    </div>
  </div>`;
}

window.GER = {
  periodo(k) { st.periodo = k; if (k === 'livre' && !st.de) { const [de, ate] = intervalo(); st.de = de; st.ate = ate; } GE.render(); },
  data(k, v) { st[k] = v; GE.render(); },
  curso(v) { st.curso = v; GE.render(); },
  whats() { window.open('https://wa.me/?text=' + encodeURIComponent(textoWhats(calcular())), '_blank', 'noopener'); },
  async copiar() {
    const t = textoWhats(calcular());
    try { await navigator.clipboard.writeText(t); GE.toast('Texto copiado! É só colar no WhatsApp ou e-mail.'); }
    catch { prompt('Copie o texto abaixo:', t); }
  },
  planilha() {
    const r = calcular();
    const blob = new Blob([csvRelatorio(r)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `relatorio-inova-${r.de}-a-${r.ate}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },
};

GE.rotas.relatorios = vRelatorios;
