// Ingressos dos eventos · Gestão Educacional Instituto Inova
// Cada matrícula de evento ganha um código único (INV-XXXXXX) e um link com QR code.
// Na porta, a tela "Entrada" lê o QR (ou o código digitado) e libera uma única vez,
// e só quando a matrícula estiver paga.
const GE = window.GE;
const { h, brl, dataBR } = GE;

const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0 e 1 para não confundir
const MSG_PADRAO = 'Olá, {nome}! Sua inscrição no {evento} está confirmada.\n\nEste é o seu ingresso, pessoal e intransferível:\n{link}\n\nCódigo: {codigo}{data}\n\nNa entrada, é só mostrar o QR code que aparece no link. Até lá!';
const CATEGORIA_EVENTO = 'Eventos e workshops';

// ---------- código do ingresso ----------
// sempre o mesmo código para a mesma matrícula, então dois aparelhos nunca geram códigos diferentes
function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function gerarCodigo(id) {
  for (let seed = 0; ; seed++) {
    let n = hash53(String(id), seed);
    let c = '';
    for (let i = 0; i < 6; i++) { c += ALFA[n % 32]; n = Math.floor(n / 32); }
    const cod = 'INV-' + c;
    if (!GE.db.matricula.some((m) => m.id !== id && m.ingresso?.codigo === cod)) return cod;
  }
}
function extrairCodigo(txt) {
  const s = String(txt || '').toUpperCase().replace(/\s+/g, '');
  const m = s.match(/INV-?([A-Z0-9]{6})(?![A-Z0-9])/) || s.match(/^([A-Z0-9]{6})$/);
  return m ? 'INV-' + m[1] : '';
}

const ehEvento = (m) => { const c = GE.porId('curso', m.cursoId); return !!c && GE.categoriaCurso(c) === CATEGORIA_EVENTO; };
const linkIngresso = (cod) => `${location.origin}/i/${cod}`;
const quando = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; };
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const nomeEvento = (m) => { const t = GE.porId('turma', m.turmaId); return t?.nome || GE.nomeCurso(m.cursoId); };

function situacao(m) {
  if (m.status === 'cancelada') return { k: 'cancelado', t: 'Matrícula cancelada', tag: 'atrasado' };
  if (m.ingresso?.usadoEm) return { k: 'usado', t: 'Entrou ' + quando(m.ingresso.usadoEm), tag: 'cancelada' };
  const r = GE.resumoMatricula(m);
  if (r.saldo > 0.009) return { k: 'pendente', t: 'Falta pagar ' + brl(r.saldo), tag: 'aberto' };
  return { k: 'ok', t: 'Pago, pode entrar', tag: 'pago' };
}

function mensagem(m) {
  const a = GE.porId('aluno', m.alunoId) || {};
  const t = GE.porId('turma', m.turmaId);
  let data = '';
  if (t?.data) data = `\nData: ${dataBR(t.data)}${t.horario ? ' às ' + t.horario : ''}`;
  if (t?.local) data += `\nLocal: ${t.local}`;
  return (GE.config().msgIngresso || MSG_PADRAO)
    .replaceAll('{nome}', (a.nome || '').split(' ')[0])
    .replaceAll('{evento}', nomeEvento(m))
    .replaceAll('{data}', data)
    .replaceAll('{link}', linkIngresso(m.ingresso.codigo))
    .replaceAll('{codigo}', m.ingresso.codigo);
}

// garante que toda matrícula de evento tenha o código guardado no banco (a página do ingresso procura por ele)
let garantindo = false;
async function garantirIngressos() {
  if (garantindo) return;
  garantindo = true;
  try {
    for (const m of GE.db.matricula) {
      if (m.ingresso?.codigo || !ehEvento(m)) continue;
      m.ingresso = { ...(m.ingresso || {}), codigo: gerarCodigo(m.id), criadoEm: new Date().toISOString() };
      await GE.salvar(m);
    }
  } catch (e) { console.warn('ingressos', e); } finally { garantindo = false; }
}

// ---------- bloco dentro da matrícula ----------
function bloco(m) {
  if (!ehEvento(m)) return '';
  if (!m.ingresso?.codigo) m.ingresso = { ...(m.ingresso || {}), codigo: gerarCodigo(m.id), criadoEm: new Date().toISOString() };
  const a = GE.porId('aluno', m.alunoId) || {};
  const s = situacao(m);
  const msg = mensagem(m);
  const cod = m.ingresso.codigo;
  const email = String(a.email || '').trim();
  const mailto = email ? `mailto:${email}?subject=${encodeURIComponent('Seu ingresso: ' + nomeEvento(m))}&body=${encodeURIComponent(msg)}` : '';
  const env = m.ingresso.enviadoEm ? `Enviado ${m.ingresso.enviadoPor === 'email' ? 'por e-mail' : 'no WhatsApp'} em ${quando(m.ingresso.enviadoEm)}.` : '';
  return `
  <div class="ing-box ${s.k}">
    <div class="ing-topo">
      <div><span class="ing-rot">Ingresso</span><b class="ing-cod">${h(cod)}</b></div>
      <span class="tag ${s.tag}">${h(s.t)}</span>
    </div>
    ${s.k === 'pendente' ? '<p class="ajuda">Pode enviar desde já, mas o ingresso só libera a entrada depois que tudo estiver pago.</p>' : ''}
    ${m.ingresso.liberadoSemPagamento ? '<p class="ajuda">Entrou liberado sem o pagamento completo.</p>' : ''}
    ${env ? `<p class="ajuda">${h(env)}</p>` : ''}
    ${!a.whatsapp && !email ? '<p class="ajuda">Cadastre o WhatsApp ou o e-mail do aluno para enviar o ingresso.</p>' : ''}
    <div class="acoes">
      ${a.whatsapp ? `<a class="btn small whats" target="_blank" rel="noopener" data-a="ing-whats" href="${h(GE.linkWhats(a.whatsapp, msg))}">Enviar no WhatsApp</a>` : ''}
      ${email ? `<a class="btn small" data-a="ing-email" href="${h(mailto)}">Enviar por e-mail</a>` : ''}
      <a class="btn small ghost" target="_blank" rel="noopener" href="${h(linkIngresso(cod))}">Ver ingresso</a>
      <button type="button" class="btn small ghost" data-a="ing-copiar">Copiar link</button>
      ${m.ingresso.usadoEm ? '<button type="button" class="btn small perigo" data-a="ing-desfaz">Desfazer entrada</button>' : ''}
    </div>
  </div>`;
}

async function acao(nome, m, { grava, redesenha }) {
  if (nome === 'ing-whats' || nome === 'ing-email') {
    // o link abre sozinho; aqui só anota que foi enviado
    m.ingresso = { ...m.ingresso, enviadoEm: new Date().toISOString(), enviadoPor: nome === 'ing-email' ? 'email' : 'whatsapp' };
    await grava('Ingresso marcado como enviado');
    redesenha();
  } else if (nome === 'ing-copiar') {
    const link = linkIngresso(m.ingresso.codigo);
    try { await navigator.clipboard.writeText(link); GE.toast('Link do ingresso copiado'); }
    catch { prompt('Copie o link do ingresso:', link); }
  } else if (nome === 'ing-desfaz') {
    if (!confirm('Desfazer a entrada? O ingresso volta a valer para entrar.')) return;
    const { usadoEm, liberadoSemPagamento, ...resto } = m.ingresso;
    m.ingresso = resto;
    await grava('Entrada desfeita');
    redesenha();
  }
}

// ================= TELA DE ENTRADA =================
const st = { evento: null };

function opcoesEventos() {
  const ops = [];
  GE.cursosOrdenados().filter((c) => GE.categoriaCurso(c) === CATEGORIA_EVENTO).forEach((c) => {
    GE.turmasDoCurso(c.id).forEach((t) => ops.push({ v: 't:' + t.id, nome: t.nome + (t.data ? ' · ' + dataBR(t.data) : ''), data: t.data || '' }));
    if (GE.matriculasAtivas().some((m) => m.cursoId === c.id && !m.turmaId)) ops.push({ v: 'c:' + c.id, nome: c.nome + ' (sem turma)', data: '' });
  });
  return ops;
}
function eventoPadrao(ops) {
  const hoje = GE.hojeISO();
  const prox = ops.filter((o) => o.data && o.data >= hoje).sort((a, b) => a.data.localeCompare(b.data))[0];
  return (prox || ops[0] || { v: '' }).v;
}
function pertence(m, sel) {
  if (!sel) return ehEvento(m);
  const [tipo, id] = sel.split(':');
  return tipo === 't' ? m.turmaId === id : m.cursoId === id && !m.turmaId;
}
const participantes = (sel) => GE.db.matricula.filter((m) => m.status !== 'cancelada' && pertence(m, sel));

function vEntrada() {
  const ops = opcoesEventos();
  if (st.evento === null || (st.evento && !ops.some((o) => o.v === st.evento))) st.evento = eventoPadrao(ops);
  const lista = participantes(st.evento).map((m) => ({ m, a: GE.porId('aluno', m.alunoId) || {}, s: situacao(m) }))
    .sort((x, y) => (x.a.nome || '').localeCompare(y.a.nome || ''));
  const entraram = lista.filter((x) => x.s.k === 'usado').length;
  const pendentes = lista.filter((x) => x.s.k === 'pendente').length;
  return `
  <div class="sec-head"><div><h1>Entrada</h1><p class="muted">Confira os ingressos na porta do evento.</p></div></div>
  <div class="card ent-topo">
    <label class="ent-evento">Evento<select onchange="GI.evento(this.value)">
      ${ops.map((o) => `<option value="${o.v}" ${o.v === st.evento ? 'selected' : ''}>${h(o.nome)}</option>`).join('')}
      <option value="" ${st.evento === '' ? 'selected' : ''}>Todos os eventos</option>
    </select></label>
    <div class="ent-numeros">
      <div><b>${entraram}</b><span>entraram</span></div>
      <div><b>${lista.length}</b><span>inscritos</span></div>
      <div class="${pendentes ? 'alerta' : ''}"><b>${pendentes}</b><span>falta pagar</span></div>
    </div>
    <button type="button" class="btn primary full ent-ler" onclick="GI.abrirLeitor()">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      Ler QR code
    </button>
    <form class="ent-codigo" onsubmit="GI.conferirDigitado(event)">
      <input name="cod" placeholder="ou digite o código" autocapitalize="characters" autocomplete="off" spellcheck="false">
      <button class="btn">Conferir</button>
    </form>
  </div>
  <div class="card" style="margin-top:14px">
    <div class="ent-lista-cab"><h3>Inscritos</h3><input type="search" placeholder="Buscar pelo nome" oninput="GI.filtrar(this.value)"></div>
    <div class="lista mini-lista" id="entLista">
      ${lista.map(({ m, a, s }) => `
      <div class="item" data-busca="${h(normaliza([a.nome, a.whatsapp, m.ingresso?.codigo].join(' ')))}">
        <div class="info"><div class="t">${h(a.nome || 'Aluno removido')}</div><div class="s">${h(m.ingresso?.codigo || '')}${st.evento ? '' : ' · ' + h(nomeEvento(m))}</div></div>
        ${s.k === 'usado' ? `<span class="tag cancelada">Entrou ${hora(m.ingresso.usadoEm)}</span>` : `${s.k === 'pendente' ? `<span class="tag aberto">${h(s.t)}</span>` : ''}<button type="button" class="btn small ${s.k === 'ok' ? 'primary' : ''}" onclick="GI.conferirMatricula('${m.id}')">Dar entrada</button>`}
      </div>`).join('') || '<p class="muted vazio">Nenhum inscrito neste evento ainda.</p>'}
    </div>
  </div>`;
}
const normaliza = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- conferência ----------
async function conferirCodigo(txt) {
  const cod = extrairCodigo(txt);
  if (!cod) return mostrar({ k: 'erro', titulo: 'Não é um ingresso', det: 'Este QR code ou código não é de um ingresso do Instituto Inova.' });
  const acha = () => GE.db.matricula.find((m) => m.ingresso?.codigo === cod);
  let m = acha();
  if (!m) { try { await GE.recarregarTudo(); } catch (e) { console.warn(e); } m = acha(); }
  if (!m) return mostrar({ k: 'erro', titulo: 'Ingresso não encontrado', det: `Não existe ingresso com o código ${cod}.` });
  return conferirMatricula(m.id);
}

async function conferirMatricula(id, forcar = false) {
  let m;
  try { m = await GE.recarregar('matricula', id); }
  catch (e) { console.warn(e); return mostrar({ k: 'erro', titulo: 'Sem internet', det: 'Não consegui conferir agora. Verifique a internet e tente de novo.' }); }
  if (!m) return mostrar({ k: 'erro', titulo: 'Ingresso não encontrado', det: 'Esta matrícula foi apagada.' });
  const a = GE.porId('aluno', m.alunoId) || {};
  const base = { nome: a.nome || 'Aluno removido', evento: nomeEvento(m), cod: m.ingresso?.codigo || '' };
  if (m.status === 'cancelada') return mostrar({ ...base, k: 'erro', titulo: 'Matrícula cancelada', det: 'Este ingresso não vale mais.' });
  if (st.evento && !pertence(m, st.evento)) return mostrar({ ...base, k: 'erro', titulo: 'Ingresso de outro evento', det: `Este ingresso é do ${nomeEvento(m)}.` });
  if (m.ingresso?.usadoEm) return mostrar({ ...base, k: 'erro', titulo: 'Já entrou', det: `Este ingresso já foi usado em ${quando(m.ingresso.usadoEm)}.` });
  const r = GE.resumoMatricula(m);
  if (r.saldo > 0.009 && !forcar) {
    return mostrar({ ...base, k: 'aviso', titulo: 'Pagamento pendente', det: `Falta pagar ${brl(r.saldo)}. O ingresso só vale depois de pago.`, id: m.id });
  }
  m.ingresso = { ...(m.ingresso || {}), codigo: m.ingresso?.codigo || gerarCodigo(m.id), usadoEm: new Date().toISOString() };
  if (r.saldo > 0.009) m.ingresso.liberadoSemPagamento = true;
  try { await GE.salvar(m); }
  catch { return mostrar({ ...base, k: 'erro', titulo: 'Não registrou', det: 'Sem internet. A entrada não foi marcada, tente de novo.' }); }
  if (navigator.vibrate) navigator.vibrate(120);
  GE.render();
  return mostrar({ ...base, k: 'ok', titulo: 'Liberado', det: r.saldo > 0.009 ? 'Liberado sem o pagamento completo.' : 'Pagamento confirmado. Pode entrar.' });
}

// ---------- tela cheia: câmera e resultado ----------
let leitor = null;

function montarOverlay(comCamera) {
  fecharOverlay();
  const ov = document.createElement('div');
  ov.className = 'ent-overlay' + (comCamera ? '' : ' sem-cam');
  ov.id = 'entOverlay';
  ov.innerHTML = `
    ${comCamera ? `<div class="ent-cam"><video id="entVideo" playsinline muted autoplay></video><div class="ent-mira"></div><p class="ent-dica" id="entDica">Aponte a câmera para o QR code do ingresso</p></div>` : ''}
    <div class="ent-res hidden" id="entRes"></div>
    <button type="button" class="ent-fechar" aria-label="Fechar" onclick="GI.fecharLeitor()">×</button>`;
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  leitor = { comCamera, pausado: false, parado: false, ultimo: '', ultimoEm: 0 };
  return ov;
}

function fecharOverlay() {
  if (leitor) {
    leitor.parado = true;
    clearTimeout(leitor.timer);
    leitor.stream?.getTracks().forEach((t) => t.stop());
    leitor = null;
  }
  document.getElementById('entOverlay')?.remove();
  document.body.style.overflow = '';
}

function carregarJsQR() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = '/vendor/jsQR.js';
    s.onload = ok; s.onerror = erro;
    document.head.appendChild(s);
  });
}

async function abrirLeitor() {
  montarOverlay(true);
  const atual = leitor;
  const video = document.getElementById('entVideo');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('sem câmera');
    atual.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    if (atual.parado) { atual.stream.getTracks().forEach((t) => t.stop()); return; }
    video.srcObject = atual.stream;
    await video.play().catch(() => {});
  } catch (e) {
    console.warn('camera', e);
    if (atual.parado) return;
    document.getElementById('entDica').textContent = 'Não consegui abrir a câmera. Libere o acesso à câmera no navegador, ou feche e digite o código.';
    return;
  }
  try {
    if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) atual.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch { /* usa o jsQR */ }
  if (!atual.detector) {
    try { await carregarJsQR(); }
    catch { document.getElementById('entDica').textContent = 'Não consegui carregar o leitor. Verifique a internet ou digite o código.'; return; }
  }
  atual.canvas = document.createElement('canvas');
  atual.ctx = atual.canvas.getContext('2d', { willReadFrequently: true });
  varrer(atual, video);
}

async function varrer(atual, video) {
  if (atual.parado) return;
  try {
    if (!atual.pausado && video.readyState >= 2 && video.videoWidth) {
      let txt = '';
      if (atual.detector) {
        const r = await atual.detector.detect(video);
        txt = r[0]?.rawValue || '';
      } else {
        const esc = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * esc), hh = Math.round(video.videoHeight * esc);
        atual.canvas.width = w; atual.canvas.height = hh;
        atual.ctx.drawImage(video, 0, 0, w, hh);
        const r = window.jsQR(atual.ctx.getImageData(0, 0, w, hh).data, w, hh, { inversionAttempts: 'dontInvert' });
        txt = r?.data || '';
      }
      const repetido = txt && txt === atual.ultimo && Date.now() - atual.ultimoEm < 8000;
      if (txt && !repetido && !atual.parado) {
        atual.pausado = true;
        atual.ultimo = txt;
        await conferirCodigo(txt);
      }
    }
  } catch (e) { console.warn('leitura', e); }
  if (!atual.parado) atual.timer = setTimeout(() => varrer(atual, video), 140);
}

function mostrar(r) {
  if (!leitor) montarOverlay(false);
  const res = document.getElementById('entRes');
  const icone = { ok: '✓', erro: '✕', aviso: '!' }[r.k];
  res.className = `ent-res ${r.k}`;
  res.innerHTML = `
    <div class="ent-icone">${icone}</div>
    <div class="ent-titulo">${h(r.titulo)}</div>
    ${r.nome ? `<div class="ent-nome">${h(r.nome)}</div>` : ''}
    ${r.evento ? `<div class="ent-evt">${h(r.evento)}${r.cod ? ' · ' + h(r.cod) : ''}</div>` : ''}
    <p class="ent-det">${h(r.det || '')}</p>
    <div class="ent-botoes">
      ${r.k === 'aviso' && r.id ? `<button type="button" class="btn" onclick="GI.abrirMatricula('${r.id}')">Abrir matrícula</button><button type="button" class="btn" onclick="GI.conferirMatricula('${r.id}', true)">Liberar mesmo assim</button>` : ''}
      <button type="button" class="btn primary" onclick="GI.proximo()">${leitor.comCamera ? 'Ler o próximo' : 'Fechar'}</button>
    </div>`;
  document.getElementById('entDica')?.classList.add('hidden');
}

function proximo() {
  if (!leitor?.comCamera) return fecharLeitor();
  document.getElementById('entRes').className = 'ent-res hidden';
  document.getElementById('entDica')?.classList.remove('hidden');
  leitor.ultimoEm = Date.now();
  leitor.pausado = false;
}

function fecharLeitor() { fecharOverlay(); GE.render(); }

// ---------- ligações ----------
window.GI = {
  MSG_PADRAO, bloco, acao, gerarCodigo, extrairCodigo,
  evento(v) { st.evento = v; GE.render(); },
  filtrar(v) {
    const q = normaliza(v.trim());
    document.querySelectorAll('#entLista .item').forEach((el) => el.classList.toggle('hidden', !!q && !el.dataset.busca.includes(q)));
  },
  conferirDigitado(e) {
    e.preventDefault();
    const inp = e.target.elements.cod;
    const v = inp.value;
    inp.value = '';
    inp.blur();
    if (v.trim()) conferirCodigo(v);
  },
  conferirMatricula, abrirLeitor, fecharLeitor, proximo,
  abrirMatricula(id) { fecharOverlay(); GE.verMatricula(id); },
};

GE.rotas.entrada = vEntrada;
document.addEventListener('ge:render', (e) => {
  garantirIngressos();
  if (e.detail?.rota !== 'entrada' && leitor) fecharOverlay();
});
window.addEventListener('hashchange', () => { if (leitor) fecharOverlay(); });
