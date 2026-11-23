// Página pública do ingresso: /i/INV-XXXXXX
const CFG = window.GE_CONFIG || {};
const raiz = document.getElementById('ing');
const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const num = (v) => {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

function lerCodigo() {
  const q = new URLSearchParams(location.search).get('c');
  const p = location.pathname.match(/\/i\/([^/?#]+)/);
  return decodeURIComponent(q || (p && p[1]) || '').toUpperCase().trim();
}

function aviso(titulo, texto) {
  raiz.className = 'msg';
  raiz.innerHTML = `<h1>${h(titulo)}</h1><p>${h(texto)}</p>`;
}

function situacao(m) {
  if (m.status === 'cancelada') return { k: 'cancelado', t: 'Ingresso cancelado' };
  if (m.ingresso?.usadoEm) {
    const d = new Date(m.ingresso.usadoEm);
    return { k: 'usado', t: `Já utilizado em ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` };
  }
  const pago = (m.parcelas || []).filter((p) => p.pagoEm).reduce((s, p) => s + num(p.valor), 0);
  if (num(m.valorFinal) - pago > 0.009) return { k: 'pendente', t: 'Aguardando confirmação do pagamento' };
  return { k: 'ok', t: 'Ingresso confirmado' };
}

function qrSvg(texto) {
  const q = window.qrcode(0, 'M');
  q.addData(texto);
  q.make();
  return q.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
}

async function main() {
  const codigo = lerCodigo();
  if (!/^INV-[A-Z0-9]{6}$/.test(codigo)) return aviso('Link incompleto', 'Abra de novo o link do ingresso que você recebeu.');
  if (!CFG.supabaseUrl || !CFG.supabaseKey) return aviso('Ingresso indisponível', 'Tente de novo em alguns minutos.');
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false } });

  const { data, error } = await sb.from('ge_registros').select('id,dados').eq('tipo', 'matricula').eq('dados->ingresso->>codigo', codigo).limit(1);
  if (error) throw error;
  if (!data.length) return aviso('Ingresso não encontrado', 'Confira se o link está completo. Se continuar, fale com o Instituto Inova.');
  const m = data[0].dados;

  const ids = [m.alunoId, m.cursoId, m.turmaId, 'config'].filter(Boolean);
  const { data: outros, error: e2 } = await sb.from('ge_registros').select('id,dados').in('id', ids);
  if (e2) throw e2;
  const por = Object.fromEntries((outros || []).map((r) => [r.id, r.dados]));
  const aluno = por[m.alunoId] || {};
  const curso = por[m.cursoId] || {};
  const turma = por[m.turmaId] || {};
  const cfg = por.config || {};

  const evento = turma.nome || curso.nome || 'Evento';
  const linhas = [];
  if (turma.data) {
    const d = new Date(turma.data + 'T12:00:00');
    const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    linhas.push(dia.charAt(0).toUpperCase() + dia.slice(1) + (turma.horario ? ` · ${turma.horario}` : ''));
  }
  if (turma.local) linhas.push(turma.local);
  const s = situacao(m);
  const logo = cfg.logo || '/logo-inova.png';
  document.title = `Ingresso · ${evento}`;

  raiz.className = 'ticket';
  raiz.innerHTML = `
    <div class="topo">
      <img class="logo" src="${h(logo)}" alt="" onerror="this.remove()">
      <div class="inst">${h(cfg.nomeInstituto || 'Instituto Inova')}</div>
      <div class="evento">${h(evento)}</div>
      ${linhas.length ? `<div class="quando">${linhas.map(h).join('<br>')}</div>` : ''}
    </div>
    <div class="corte"></div>
    <div class="corpo">
      <div class="rot">Participante</div>
      <div class="nome">${h(aluno.nome || '')}</div>
      <div class="qr ${s.k === 'ok' || s.k === 'pendente' ? '' : 'apagado'}">${qrSvg(`${location.origin}/i/${codigo}`)}</div>
      <div class="cod">${h(codigo)}</div>
      <span class="status ${s.k}">${h(s.t)}</span>
      <p class="dica">${s.k === 'pendente'
        ? 'Assim que o pagamento for confirmado, este ingresso passa a valer para a entrada.'
        : 'Mostre este QR code na entrada. O ingresso é pessoal e vale para uma única entrada. Se quiser, tire um print desta tela.'}</p>
    </div>`;
}

main().catch((e) => { console.error(e); aviso('Não consegui abrir o ingresso', 'Verifique a internet e recarregue a página.'); });
