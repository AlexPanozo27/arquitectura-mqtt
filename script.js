/* Arquitectura MQTT · infograma interactivo
   Todo corre en el navegador: no hay servidor ni dependencias.
   Contiene un broker MQTT simulado (topics, comodines, QoS, retenidos,
   testamento, sesiones persistentes y permisos) usado por los laboratorios. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 20) : ms));
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function clock() {
  return new Date().toLocaleTimeString('es-BO', { hour12: false });
}
function addLog(ul, text, cls) {
  const li = document.createElement('li');
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = clock();
  const m = document.createElement('span');
  if (cls) m.className = cls;
  m.textContent = text;
  li.append(t, m);
  ul.appendChild(li);
  while (ul.children.length > 80) ul.removeChild(ul.firstChild);
  ul.scrollTop = ul.scrollHeight;
}
function hexNoise(n) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(' ');
}

/* ---------- Reglas de topics (según la especificación MQTT) ---------- */
function filterError(f) {
  if (!f) return 'Escribe un filtro. No puede estar vacío.';
  const p = f.split('/');
  for (let i = 0; i < p.length; i++) {
    const s = p[i];
    if (s.includes('#')) {
      if (s !== '#') return 'El comodín # debe ocupar un nivel completo.';
      if (i !== p.length - 1) return 'El comodín # solo puede ir en el último nivel.';
    }
    if (s.includes('+') && s !== '+') return 'El comodín + debe ocupar un nivel completo.';
  }
  return null;
}
function topicMatches(filter, topic) {
  const f = filter.split('/');
  const t = topic.split('/');
  if (t[0].startsWith('$') && (f[0] === '#' || f[0] === '+')) return false;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

/* ---------- Motor de diagramas con paquetes animados ---------- */
class Net {
  constructor(host, opts) {
    this.nodes = {};
    this.svg = el('svg', {
      viewBox: `0 0 ${opts.w} ${opts.h}`,
      role: 'img',
      'aria-label': opts.label || 'Diagrama de red MQTT',
      class: 'net' + (opts.dark ? ' net--dark' : '') + (opts.large ? ' net--lg' : ''),
    });
    host.appendChild(this.svg);
    this.gLinks = el('g', {}, this.svg);
    this.gNodes = el('g', {}, this.svg);
    this.gPk = el('g', {}, this.svg);
    opts.nodes.forEach((n) => this.addNode(n));
    const b = opts.nodes.find((n) => n.role === 'broker');
    this.links = {};
    opts.nodes.forEach((n) => {
      if (n === b) return;
      this.links[n.id] = el('line', { x1: n.x, y1: n.y, x2: b.x, y2: b.y, class: 'net-link' }, this.gLinks);
    });
  }
  addNode(n) {
    const g = el('g', { class: `net-node net-${n.role}`, transform: `translate(${n.x},${n.y})` }, this.gNodes);
    if (n.role === 'broker') {
      el('circle', { class: 'ring', r: 48 }, g);
      el('circle', { class: 'core', r: 46 }, g);
      el('text', { class: 't', y: 2 }, g).textContent = n.label;
      el('text', { class: 's', y: 20 }, g).textContent = n.sub || 'MQTT';
      this.nodes[n.id] = { x: n.x, y: n.y, g };
      return;
    }
    const w = n.w || 138;
    const h = n.h || 52;
    el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 12 }, g);
    el('text', { class: 't', y: n.sub ? -3 : 5 }, g).textContent = n.label;
    if (n.sub) el('text', { class: 's', y: 14 }, g).textContent = n.sub;
    const badge = el('g', { class: 'net-badge', transform: `translate(${w / 2 - 4},${-h / 2 + 2})`, display: 'none' }, g);
    el('circle', { r: 12 }, badge);
    el('text', { y: 4 }, badge);
    this.nodes[n.id] = { x: n.x, y: n.y, g, badge };
  }
  cls(id, name, on) {
    this.nodes[id].g.classList.toggle('is-' + name, !!on);
  }
  flash(id) {
    this.cls(id, 'flash', true);
    setTimeout(() => this.cls(id, 'flash', false), reduce ? 20 : 520);
  }
  badge(id, text) {
    const b = this.nodes[id].badge;
    if (!b) return;
    if (text === null || text === undefined || text === '') {
      b.setAttribute('display', 'none');
      return;
    }
    b.setAttribute('display', 'block');
    $('text', b).textContent = text;
  }
  fly(a, b, o = {}) {
    const A = this.nodes[a];
    const B = this.nodes[b];
    const g = el('g', { class: 'pk ' + (o.cls || 'pk-pub') }, this.gPk);
    el('circle', { r: 7 }, g);
    if (o.label) el('text', { y: -13 }, g).textContent = o.label;
    const end = o.lose ? 0.55 : 1;
    const dur = reduce ? 1 : o.dur || 620;
    const t0 = performance.now();
    return new Promise((res) => {
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) * end;
        g.setAttribute('transform', `translate(${A.x + (B.x - A.x) * e},${A.y + (B.y - A.y) * e})`);
        if (p < 1) return requestAnimationFrame(step);
        if (o.lose) {
          g.textContent = '';
          const x = el('text', { class: 'net-x' }, g);
          x.textContent = '✕';
          setTimeout(() => { g.remove(); res(); }, reduce ? 10 : 380);
        } else {
          g.remove();
          res();
        }
      };
      requestAnimationFrame(step);
    });
  }
}

/* ---------- Barra: sección activa ---------- */
(function navSpy() {
  const links = $$('.bar nav a');
  const secs = links.map((a) => $(a.getAttribute('href')));
  function update() {
    let cur = -1;
    secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < 140) cur = i; });
    links.forEach((a, i) => (i === cur ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
})();

/* ---------- Portada: la idea en un clic ---------- */
(function hero() {
  const host = $('#hero-net');
  const net = new Net(host, {
    w: 560, h: 330, dark: true, large: true,
    label: 'Dos sensores publican en el broker y el broker reparte a tres suscriptores',
    nodes: [
      { id: 't', role: 'pub', label: 'Sensor', sub: 'temperatura', x: 88, y: 90, w: 150, h: 58 },
      { id: 'h', role: 'pub', label: 'Sensor', sub: 'humedad', x: 88, y: 240, w: 150, h: 58 },
      { id: 'b', role: 'broker', label: 'Broker', x: 280, y: 165 },
      { id: 'panel', role: 'sub', label: 'Panel', sub: 'suscriptor', x: 472, y: 55, w: 150, h: 58 },
      { id: 'alarma', role: 'sub', label: 'Alarma', sub: 'suscriptor', x: 472, y: 165, w: 150, h: 58 },
      { id: 'bd', role: 'sub', label: 'Base de datos', sub: 'suscriptor', x: 472, y: 275, w: 150, h: 58 },
    ],
  });
  const cap = $('#hero-caption');
  const btns = [$('#hero-btn-t'), $('#hero-btn-h')];
  const subs = { panel: 'invernadero/sala1/+', alarma: 'invernadero/+/temperatura', bd: 'invernadero/#' };
  const names = { panel: 'Panel', alarma: 'Alarma', bd: 'Base de datos' };
  let busy = false;

  async function publish(src, topic, value) {
    if (busy) return;
    busy = true;
    btns.forEach((b) => (b.disabled = true));
    Object.keys(subs).forEach((id) => { net.cls(id, 'miss', false); });
    cap.innerHTML = `<b>1.</b> El sensor publica <code>${value}</code> en el topic <code>${topic}</code>. No sabe quién lo leerá.`;
    await net.fly(src, 'b', { cls: 'pk-pub', label: 'PUBLISH' });
    net.flash('b');
    cap.innerHTML = '<b>2.</b> El broker compara el topic con el filtro de cada suscriptor.';
    await sleep(700);
    const hit = Object.keys(subs).filter((id) => topicMatches(subs[id], topic));
    const miss = Object.keys(subs).filter((id) => !hit.includes(id));
    miss.forEach((id) => net.cls(id, 'miss', true));
    cap.innerHTML = '<b>3.</b> Coinciden: ' + hit.map((i) => names[i]).join(', ') + '. Cada uno recibe su copia.' +
      (miss.length ? ` ${names[miss[0]]} no pidió ese tema, así que no recibe nada.` : '');
    await Promise.all(hit.map((id) => net.fly('b', id, { cls: 'pk-sub' })));
    hit.forEach((id) => net.flash(id));
    busy = false;
    btns.forEach((b) => (b.disabled = false));
  }
  $('#hero-btn-t').addEventListener('click', () => publish('t', 'invernadero/sala1/temperatura', '24.5'));
  $('#hero-btn-h').addEventListener('click', () => publish('h', 'invernadero/sala1/humedad', '62'));
})();

/* ---------- 1. La idea: contar conexiones ---------- */
(function idea() {
  const n = $('#idea-n'), m = $('#idea-m'), view = $('#idea-view');
  const svg = el('svg', { viewBox: '0 0 420 300', role: 'img', 'aria-label': 'Conexiones entre dispositivos y aplicaciones' });
  view.appendChild(svg);
  const mode = () => $('input[name="idea-mode"]:checked').value;
  const ys = (k) => Array.from({ length: k }, (_, i) => (k === 1 ? 150 : 28 + (i * 244) / (k - 1)));
  function draw() {
    const N = +n.value, M = +m.value;
    $('#idea-n-v').textContent = N;
    $('#idea-m-v').textContent = M;
    $('#idea-direct').textContent = N * M;
    $('#idea-broker').textContent = N + M;
    $('#idea-example').innerHTML = `<strong>Ejemplo:</strong> con ${N} dispositivos y ${M} aplicaciones, la conexión directa necesita ${N * M} enlaces. Con broker bastan ${N + M}.`;
    svg.textContent = '';
    const L = ys(N), R = ys(M), direct = mode() === 'direct';
    const lines = el('g', { stroke: direct ? '#b3261e' : '#6c3ce0', 'stroke-width': direct ? 1 : 1.6, opacity: direct ? 0.4 : 0.75 }, svg);
    if (direct) {
      L.forEach((y1) => R.forEach((y2) => el('line', { x1: 56, y1, x2: 364, y2 }, lines)));
    } else {
      L.forEach((y) => el('line', { x1: 56, y1: y, x2: 210, y2: 150 }, lines));
      R.forEach((y) => el('line', { x1: 210, y1: 150, x2: 364, y2: y }, lines));
      el('circle', { cx: 210, cy: 150, r: 34, fill: '#2a1670', stroke: '#ffc247', 'stroke-width': 3 }, svg);
      const t = el('text', { x: 210, y: 155, 'text-anchor': 'middle', fill: '#fff', 'font-family': 'Bricolage Grotesque, sans-serif', 'font-weight': 650, 'font-size': 14 }, svg);
      t.textContent = 'Broker';
    }
    L.forEach((y) => el('circle', { cx: 56, cy: y, r: 9, fill: '#6c3ce0', stroke: '#fff', 'stroke-width': 2 }, svg));
    R.forEach((y) => el('circle', { cx: 364, cy: y, r: 9, fill: '#0b8a96', stroke: '#fff', 'stroke-width': 2 }, svg));
  }
  [n, m].forEach((i) => i.addEventListener('input', draw));
  $$('input[name="idea-mode"]').forEach((i) => i.addEventListener('change', draw));
  draw();
})();

/* ---------- 2. Las piezas: conversación paquete a paquete ---------- */
(function sequence() {
  const steps = [
    { pkt: 'CONNECT', dir: 'to-b', txt: 'El cliente se presenta: su identificador, usuario y clave, el tiempo de keep alive, si quiere sesión limpia y el testamento.' },
    { pkt: 'CONNACK', dir: 'to-c', txt: 'El broker acepta o rechaza la conexión, y avisa si ya tenía una sesión guardada para ese cliente.' },
    { pkt: 'SUBSCRIBE', dir: 'to-b', txt: 'El cliente pide un filtro, por ejemplo invernadero/sala1/+, junto con el QoS máximo que acepta.' },
    { pkt: 'SUBACK', dir: 'to-c', txt: 'El broker confirma el QoS concedido o niega el permiso. Si hay un mensaje retenido que coincide, lo entrega enseguida.' },
    { pkt: 'PUBLISH', dir: 'to-c', txt: 'Otro cliente publicó un dato. El broker se lo reenvía a este porque el topic coincide con su filtro.' },
    { pkt: 'PINGREQ', dir: 'to-b', txt: 'Si pasa un rato sin datos, el cliente avisa que sigue vivo. El broker espera señales dentro del keep alive.' },
    { pkt: 'PINGRESP', dir: 'to-c', txt: 'El broker contesta. Si dejara de recibir señales, daría la conexión por caída y publicaría el testamento.' },
    { pkt: 'DISCONNECT', dir: 'to-b', txt: 'Despedida ordenada. Como el cliente se fue con aviso, el broker no publica el testamento.' },
  ];
  const host = $('#seq-host'), text = $('#seq-text'), next = $('#seq-next');
  const head = document.createElement('div');
  head.className = 'seq-head';
  head.innerHTML = '<span class="c">Cliente</span><span></span><span class="b">Broker</span>';
  host.appendChild(head);
  const rows = steps.map((s) => {
    const r = document.createElement('div');
    r.className = 'seq-row';
    r.innerHTML = `<span class="life"></span><div class="seq-arrow ${s.dir}">${s.pkt}</div><span class="life"></span>`;
    host.appendChild(r);
    return r;
  });
  let i = -1;
  function show() {
    rows.forEach((r, k) => {
      r.classList.toggle('is-now', k === i);
      r.classList.toggle('is-done', k < i);
    });
    if (i < 0) {
      text.textContent = 'Pulsa «Siguiente paquete» para empezar. Un cliente se conecta al broker, se suscribe, recibe datos y se despide.';
    } else {
      text.innerHTML = `<b>${steps[i].pkt}</b> · ${steps[i].txt}`;
    }
    next.disabled = i === steps.length - 1;
  }
  next.addEventListener('click', () => { if (i < steps.length - 1) { i++; show(); } });
  $('#seq-reset').addEventListener('click', () => { i = -1; show(); });
  show();
})();

/* ---------- 3. Topics: probar filtros ---------- */
(function topics() {
  const all = [
    'invernadero/sala1/temperatura',
    'invernadero/sala1/humedad',
    'invernadero/sala1/bomba/cmd',
    'invernadero/sala1/bomba/estado',
    'invernadero/sala2/temperatura',
    'invernadero/sala2/humedad',
    'invernadero/exterior/temperatura',
    'invernadero/exterior/viento',
    '$SYS/broker/clients/connected',
  ];
  const presets = ['invernadero/sala1/temperatura', 'invernadero/+/temperatura', 'invernadero/sala1/+', 'invernadero/sala1/#', '+/sala1/+', '#'];
  const input = $('#tp-input'), list = $('#tp-list'), msg = $('#tp-msg'), box = $('#tp-presets');
  const items = all.map((t) => {
    const li = document.createElement('li');
    const mark = document.createElement('span');
    mark.className = 'mark';
    const txt = document.createElement('span');
    t.split('/').forEach((part, k) => {
      if (k) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '/'; txt.appendChild(s); }
      txt.appendChild(document.createTextNode(part));
    });
    li.append(mark, txt);
    list.appendChild(li);
    return { t, li, mark };
  });
  presets.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => { input.value = p; run(); });
    box.appendChild(b);
  });
  function run() {
    const f = input.value.trim();
    $$('.chip', box).forEach((c) => c.setAttribute('aria-pressed', String(c.textContent === f)));
    items.forEach(({ li }) => { li.classList.remove('is-hit', 'is-miss'); li.querySelector('.note')?.remove(); });
    const err = filterError(f);
    msg.classList.toggle('is-err', !!err);
    if (err) {
      msg.textContent = err + ' Un filtro inválido no se puede suscribir.';
      items.forEach(({ mark }) => (mark.textContent = ''));
      return;
    }
    let hits = 0;
    items.forEach(({ t, li, mark }) => {
      const ok = topicMatches(f, t);
      li.classList.add(ok ? 'is-hit' : 'is-miss');
      mark.textContent = ok ? '✓' : '·';
      if (ok) hits++;
      if (!ok && t.startsWith('$') && (f.startsWith('#') || f.startsWith('+'))) {
        const n = document.createElement('span');
        n.className = 'note';
        n.textContent = 'reservado del broker';
        li.appendChild(n);
      }
    });
    let extra = '';
    if (f === '#') extra = ' El comodín # recibe todo menos los topics $SYS, que son del broker.';
    else if (f.includes('+') && !f.includes('#')) extra = ' El + reemplaza exactamente un nivel, ni más ni menos.';
    else if (f.endsWith('#')) extra = ' El # incluye todos los niveles que cuelgan de ahí.';
    else if (!f.includes('+') && !f.includes('#')) extra = ' Sin comodines, solo coincide el topic exacto.';
    msg.textContent = `Coinciden ${hits} de ${items.length} topics.${extra}`;
  }
  input.addEventListener('input', run);
  run();
})();

/* ---------- 4. QoS: laboratorio de entregas ---------- */
(function qos() {
  const log = $('#q-log'), sum = $('#q-sum');
  const btns = ['#q-send', '#q-lose-pub', '#q-lose-ack'].map((s) => $(s));
  const rad = (n) => +document.querySelector(`input[name="${n}"]:checked`).value;
  function eff() {
    const p = rad('qpub'), s = rad('qsub'), e = Math.min(p, s);
    $('#q-eff').textContent = `QoS hacia el suscriptor = mínimo(${p}, ${s}) = ${e}`;
    return e;
  }
  $$('input[name="qpub"], input[name="qsub"]').forEach((r) => r.addEventListener('change', eff));
  eff();

  function leg(q, dir, ctx) {
    const S = dir === 'A' ? 'Publicador' : 'Broker';
    const R = dir === 'A' ? 'Broker' : 'Suscriptor';
    const add = (pkt, from, to, msg, state) => ctx.steps.push({ pkt, from, to, msg, state });
    const lost = (kind) => {
      if (dir === 'A' && ctx.force === kind) { ctx.force = null; return true; }
      return Math.random() < ctx.p;
    };
    let got = 0;
    if (q === 0) {
      if (lost('publish')) { add('PUBLISH', S, R, 'Se perdió en la red. QoS 0 no espera respuesta ni reintenta.', 'bad'); return 0; }
      add('PUBLISH', S, R, `Llegó. No hay confirmación: ${S} ya olvidó el mensaje.`, 'ok');
      return 1;
    }
    if (q === 1) {
      for (let n = 0; n < 4; n++) {
        const pk = n ? 'PUBLISH · DUP' : 'PUBLISH';
        if (lost('publish')) { add(pk, S, R, `Se perdió. ${S} no recibe PUBACK, espera y reenvía.`, 'bad'); continue; }
        got++;
        add(pk, S, R, got > 1 ? `Llegó otra vez: ${R} lo entrega de nuevo (duplicado).` : `Llegó y ${R} lo entrega.`, got > 1 ? 'info' : 'ok');
        if (lost('ack')) { add('PUBACK', R, S, `Se perdió. ${S} no sabe si llegó y lo reenvía.`, 'bad'); continue; }
        add('PUBACK', R, S, `Confirmado. ${S} borra su copia.`, 'ok');
        return got;
      }
      add('—', S, R, 'Se agotaron los reintentos de la demostración.', 'bad');
      return got;
    }
    let stored = false, rec = false;
    for (let n = 0; n < 4; n++) {
      const pk = n ? 'PUBLISH · DUP' : 'PUBLISH';
      if (lost('publish')) { add(pk, S, R, `Se perdió. ${S} lo reenvía porque no recibió PUBREC.`, 'bad'); continue; }
      if (!stored) { stored = true; got++; add(pk, S, R, `Llegó. ${R} lo entrega y guarda su identificador.`, 'ok'); }
      else add(pk, S, R, `Llegó otra vez, pero ${R} reconoce el identificador y NO lo entrega de nuevo.`, 'info');
      if (lost('ack')) { add('PUBREC', R, S, `Se perdió. ${S} reenvía el PUBLISH.`, 'bad'); continue; }
      add('PUBREC', R, S, `Recibido. ${S} ya no reenviará el mensaje.`, 'ok');
      rec = true;
      break;
    }
    if (!rec) { add('—', S, R, 'Se agotaron los reintentos de la demostración.', 'bad'); return got; }
    for (let n = 0; n < 4; n++) {
      if (lost('rel')) { add('PUBREL', S, R, 'Se perdió. Se reenvía.', 'bad'); continue; }
      add('PUBREL', S, R, `${S} indica que ya puede liberar el identificador.`, 'ok');
      if (lost('rel')) { add('PUBCOMP', R, S, 'Se perdió. Se reenvía el PUBREL.', 'bad'); continue; }
      add('PUBCOMP', R, S, 'Completo: el mensaje se entregó exactamente una vez.', 'ok');
      break;
    }
    return got;
  }

  async function run(force) {
    btns.forEach((b) => (b.disabled = true));
    log.textContent = '';
    const qp = rad('qpub'), qs = rad('qsub'), qe = eff();
    const ctx = { p: +$('#q-net').value, force, steps: [] };
    ctx.steps.push({ head: `Tramo 1 · Publicador → Broker · QoS ${qp}` });
    const d1 = leg(qp, 'A', ctx);
    ctx.steps.push({ head: `Tramo 2 · Broker → Suscriptor · QoS ${qe} (el menor entre ${qp} y ${qs})` });
    let d2 = 0;
    if (d1 === 0) ctx.steps.push({ pkt: '—', from: 'Broker', to: 'Suscriptor', msg: 'El broker no recibió nada, así que no tiene qué reenviar.', state: 'info' });
    for (let i = 0; i < d1; i++) {
      if (i > 0) ctx.steps.push({ pkt: '—', from: 'Broker', to: 'Suscriptor', msg: 'El broker reenvía otra copia, porque la recibió dos veces.', state: 'info' });
      d2 += leg(qe, 'B', ctx);
    }
    const packets = ctx.steps.filter((s) => s.pkt && s.pkt !== '—').length;
    for (const s of ctx.steps) {
      const li = document.createElement('li');
      if (s.head) { li.className = 'leg'; li.textContent = s.head; }
      else {
        li.className = s.state;
        li.innerHTML = '<span class="pkt"></span><span class="who"></span><span></span><span class="msg"></span>';
        li.children[0].textContent = s.pkt;
        li.children[1].textContent = `${s.from} → ${s.to}`;
        li.children[3].textContent = s.msg;
      }
      log.appendChild(li);
      await sleep(s.head ? 120 : 300);
    }
    let cls, txt;
    if (d2 === 0) { cls = 'bad'; txt = 'El suscriptor no recibió el mensaje. ' + (qp === 0 || qe === 0 ? 'Con QoS 0 nadie reintenta: si la aplicación no tolera pérdidas, usa QoS 1 o 2.' : 'Se agotaron los reintentos.'); }
    else if (d2 === 1) { cls = 'ok'; txt = 'El suscriptor recibió el mensaje exactamente una vez.'; }
    else { cls = 'warn'; txt = `El suscriptor recibió el mensaje ${d2} veces. QoS 1 garantiza «al menos una vez», así que la aplicación debe tolerar duplicados o usar QoS 2.`; }
    sum.className = 'q-sum ' + cls;
    sum.textContent = `${txt} Paquetes enviados: ${packets}.`;
    btns.forEach((b) => (b.disabled = false));
  }
  $('#q-send').addEventListener('click', () => run(null));
  $('#q-lose-pub').addEventListener('click', () => run('publish'));
  $('#q-lose-ack').addEventListener('click', () => run('ack'));
})();

/* ---------- 5. Memoria del broker: tres laboratorios ---------- */
(function stateLabs() {
  // Pestañas
  const tabs = $$('.tab');
  function select(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(n);
      n.focus();
    });
  });

  // a) Retenido
  (function retained() {
    const log = $('#ret-log'), pill = $('#ret-pill');
    let held = null, panels = 0;
    const T = 'invernadero/sala1/temperatura';
    function paint() {
      pill.innerHTML = 'Guardado en el broker: <b></b>';
      $('b', pill).textContent = held === null ? 'nada' : `${held} °C`;
      pill.className = 'pill' + (held === null ? '' : ' ok');
    }
    $('#ret-pub').addEventListener('click', () => {
      const v = (20 + Math.random() * 6).toFixed(1);
      const r = $('#ret-on').checked;
      addLog(log, `Sensor publica ${v} °C en ${T}${r ? ' con retain' : ' sin retain'}`, 'pub');
      if (panels) addLog(log, panels === 1 ? 'El panel ya abierto lo recibe al instante.' : `Los ${panels} paneles ya abiertos lo reciben al instante.`, 'sub');
      if (r) { held = v; addLog(log, 'El broker guarda este valor como el último de ese topic.', 'ok'); }
      else addLog(log, 'El broker lo reparte y lo olvida. No queda guardado.', 'dim');
      paint();
    });
    $('#ret-sub').addEventListener('click', () => {
      panels++;
      addLog(log, `Panel ${panels} se abre y se suscribe a ${T}`, 'sub');
      if (held !== null) addLog(log, `Recibe ${held} °C de inmediato, marcado como mensaje retenido.`, 'ok');
      else addLog(log, 'No recibe nada. Tendrá que esperar a que el sensor vuelva a publicar.', 'warn');
    });
    $('#ret-clear').addEventListener('click', () => {
      addLog(log, 'Sensor publica un mensaje vacío con retain en ese topic.', 'pub');
      addLog(log, held === null ? 'No había nada guardado.' : 'El broker borra el valor retenido.', held === null ? 'dim' : 'ok');
      held = null;
      paint();
    });
    paint();
  })();

  // b) Testamento
  (function lwt() {
    const log = $('#lwt-log'), sensor = $('#lwt-sensor'), panel = $('#lwt-panel');
    const btns = ['#lwt-clean', '#lwt-cut', '#lwt-conn'].map((s) => $(s));
    let up = true, shown = 'online', busy = false;
    function paint() {
      sensor.innerHTML = 'Sensor: <b></b>';
      $('b', sensor).textContent = up ? 'conectado' : 'desconectado';
      sensor.className = 'pill ' + (up ? 'ok' : 'bad');
      panel.innerHTML = 'El panel muestra: <b></b>';
      $('b', panel).textContent = shown;
      const stale = !up && shown === 'online';
      panel.className = 'pill ' + (stale ? 'warn' : shown === 'online' ? 'ok' : 'bad');
    }
    $('#lwt-conn').addEventListener('click', () => {
      if (up) return addLog(log, 'El sensor ya está conectado.', 'dim');
      up = true; shown = 'online';
      addLog(log, `Sensor envía CONNECT${$('#lwt-on').checked ? ' con testamento: «offline» en invernadero/sala1/estado' : ' sin testamento'}`, 'pub');
      addLog(log, 'Publica «online» con retain en invernadero/sala1/estado. El panel lo ve.', 'ok');
      paint();
    });
    $('#lwt-clean').addEventListener('click', () => {
      if (!up) return addLog(log, 'El sensor ya está desconectado.', 'dim');
      up = false; shown = 'offline';
      addLog(log, 'Sensor publica «offline» y envía DISCONNECT.', 'pub');
      addLog(log, 'Salida ordenada: el broker descarta el testamento. No hace falta usarlo.', 'ok');
      paint();
    });
    $('#lwt-cut').addEventListener('click', async () => {
      if (!up || busy) return addLog(log, 'El sensor ya está desconectado.', 'dim');
      busy = true; btns.forEach((b) => (b.disabled = true));
      up = false;
      addLog(log, 'Se corta la energía. El sensor no alcanza a despedirse.', 'bad');
      paint();
      addLog(log, 'El broker espera señales dentro del keep alive y no llega ninguna…', 'dim');
      await sleep(1100);
      if ($('#lwt-on').checked) {
        shown = 'offline';
        addLog(log, 'Conexión dada por caída. El broker publica el testamento: estado = «offline».', 'ok');
      } else {
        addLog(log, 'Conexión dada por caída, pero no hay testamento: nadie publica nada.', 'warn');
        addLog(log, 'El panel sigue mostrando «online» aunque el sensor ya no existe.', 'bad');
      }
      paint();
      busy = false; btns.forEach((b) => (b.disabled = false));
    });
    paint();
  })();

  // c) Sesión persistente
  (function session() {
    const log = $('#ses-log'), st = $('#ses-state'), qp = $('#ses-queue');
    let online = true, queue = 0, subscribed = true, count = 0;
    const persist = () => $('#ses-type').value === 'persist';
    const qos = () => +$('#ses-qos').value;
    function paint() {
      st.innerHTML = 'Panel: <b></b>';
      $('b', st).textContent = online ? 'conectado' : 'desconectado';
      st.className = 'pill ' + (online ? 'ok' : 'bad');
      qp.innerHTML = 'Cola en el broker: <b></b>';
      $('b', qp).textContent = queue;
      qp.className = 'pill' + (queue ? ' warn' : '');
    }
    $('#ses-off').addEventListener('click', () => {
      if (!online) return addLog(log, 'El panel ya está desconectado.', 'dim');
      online = false;
      addLog(log, 'El panel se desconecta.', 'bad');
      if (persist()) addLog(log, 'Sesión persistente: el broker conserva sus suscripciones.', 'ok');
      else { subscribed = false; addLog(log, 'Sesión limpia: el broker borra sus suscripciones y su cola.', 'warn'); queue = 0; }
      paint();
    });
    $('#ses-pub').addEventListener('click', () => {
      for (let i = 0; i < 3; i++) count++;
      addLog(log, `El sensor publica 3 lecturas (lecturas n.º ${count - 2} a ${count}).`, 'pub');
      if (online) { addLog(log, 'El panel está conectado: las recibe directamente.', 'sub'); return; }
      if (persist() && qos() >= 1 && subscribed) {
        queue += 3;
        addLog(log, 'El broker guarda las 3 lecturas en la cola de la sesión.', 'ok');
      } else if (!subscribed) addLog(log, 'El broker no tiene suscripciones de este panel, así que no guarda nada.', 'bad');
      else addLog(log, 'Con QoS 0 el broker no encola mensajes: se pierden mientras el panel no está.', 'bad');
      paint();
    });
    $('#ses-on').addEventListener('click', () => {
      if (online) return addLog(log, 'El panel ya está conectado.', 'dim');
      online = true;
      if (persist() && subscribed) {
        addLog(log, 'CONNACK con session present = verdadero: el broker reconoce la sesión.', 'ok');
        addLog(log, queue ? `El broker entrega las ${queue} lecturas guardadas.` : 'No había mensajes en cola.', queue ? 'sub' : 'dim');
        queue = 0;
      } else {
        addLog(log, 'CONNACK con session present = falso: es una sesión nueva.', 'warn');
        addLog(log, 'El panel debe volver a suscribirse. Lo que llegó mientras estaba fuera no se recupera.', 'warn');
        subscribed = true;
      }
      paint();
    });
    $('#ses-type').addEventListener('change', () => addLog(log, `Tipo de sesión cambiado a «${persist() ? 'persistente' : 'limpia'}». Aplica la próxima vez que el panel se conecte.`, 'dim'));
    paint();
  })();
})();

/* ---------- 6. Seguridad por capas y suscripciones compartidas ---------- */
(function robustez() {
  const out = $('#sc-result');
  const on = (id) => $(id).checked;
  const pages = {
    sniff() {
      if (on('#sc-tls')) return ['ok', '<b>Bloqueado por TLS.</b> El espía ve solo bytes cifrados: <code>17 03 03 00 4f ' + hexNoise(6) + '…</code>. No puede leer datos ni claves.'];
      return ['bad', '<b>El ataque funciona.</b> Sin TLS el tráfico viaja en texto claro. El espía lee <code>PUBLISH invernadero/sala1/temperatura = 24.3</code> y también el usuario y la clave del CONNECT.'];
    },
    fake() {
      if (on('#sc-auth')) return ['ok', '<b>Bloqueado por la autenticación.</b> El broker responde CONNACK con código de rechazo («usuario o clave incorrectos») y cierra la conexión.'];
      return ['bad', '<b>El ataque funciona.</b> Sin autenticación el broker acepta a cualquiera. El cliente falso ya puede publicar y suscribirse.'];
    },
    spy() {
      if (on('#sc-acl')) return ['ok', '<b>Bloqueado por los permisos (ACL).</b> El broker responde SUBACK con código «no autorizado». Cada sensor solo puede publicar y leer en sus propios topics.'];
      return ['bad', '<b>El ataque funciona.</b> Sin ACL, cualquier cliente válido puede suscribirse a <code>#</code> y leer los mensajes de todos los demás dispositivos.'];
    },
  };
  $$('.attack').forEach((b) => b.addEventListener('click', () => {
    const [cls, html] = pages[b.dataset.attack]();
    out.className = 'sc-result ' + cls;
    out.innerHTML = html;
  }));

  // Suscripciones compartidas
  const bars = $('#sh-bars'), total = $('#sh-total');
  const workers = ['Copia A', 'Copia B', 'Copia C'];
  const counts = [0, 0, 0];
  const fills = [], nums = [];
  workers.forEach((w) => {
    const r = document.createElement('div');
    r.className = 'bar-row';
    r.innerHTML = `<span>${w}</span><div class="bar-track"><div class="bar-fill"></div></div><span class="bar-num">0</span>`;
    bars.appendChild(r);
    fills.push($('.bar-fill', r));
    nums.push($('.bar-num', r));
  });
  function paint() {
    counts.forEach((c, i) => { fills[i].style.width = Math.min(100, (c / 12) * 100) + '%'; nums[i].textContent = c; });
    total.textContent = 'Procesamientos totales: ' + counts.reduce((a, b) => a + b, 0);
  }
  let busy = false;
  $('#sh-send').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    const shared = document.querySelector('input[name="sh-mode"]:checked').value === 'shared';
    for (let i = 0; i < 12; i++) {
      if (shared) counts[i % 3]++; else counts.forEach((_, k) => counts[k]++);
      paint();
      await sleep(90);
    }
    busy = false;
  });
  $('#sh-reset').addEventListener('click', () => { counts.fill(0); paint(); });
  paint();
})();

/* ---------- 7. Simulador del invernadero ---------- */
(function simulator() {
  const net = new Net($('#sim-net'), {
    w: 760, h: 470, label: 'Invernadero MQTT: sensores, broker, cuatro suscriptores y un intruso',
    nodes: [
      { id: 'st', role: 'pub', label: 'Sensor', sub: 'temperatura', x: 110, y: 95, w: 150 },
      { id: 'sh', role: 'pub', label: 'Sensor', sub: 'humedad', x: 110, y: 215, w: 150 },
      { id: 'intruso', role: 'bad', label: 'Intruso', sub: 'sin permiso', x: 110, y: 385, w: 150 },
      { id: 'b', role: 'broker', label: 'Broker', x: 380, y: 235 },
      { id: 'panel', role: 'sub', label: 'Panel', sub: 'persona', x: 650, y: 55, w: 150 },
      { id: 'alarma', role: 'sub', label: 'Alarma', sub: 'reglas', x: 650, y: 165, w: 150 },
      { id: 'vent', role: 'sub', label: 'Ventilador', sub: 'actuador', x: 650, y: 275, w: 150 },
      { id: 'bd', role: 'sub', label: 'Base de datos', sub: 'historial', x: 650, y: 385, w: 150 },
    ],
  });
  net.links.intruso.classList.add('is-bad');

  const T = {
    temp: 'invernadero/sala1/temperatura', hum: 'invernadero/sala1/humedad',
    state: 'invernadero/sala1/estado', alarm: 'invernadero/sala1/alarma', fan: 'invernadero/sala1/ventilador/cmd',
  };
  const names = { st: 'Sensor de temperatura', sh: 'Sensor de humedad', alarma: 'Alarma', vent: 'Ventilador', panel: 'Panel', bd: 'Base de datos', intruso: 'Intruso' };
  const $ids = (i) => document.getElementById(i);
  const logEl = $ids('sim-log'), sniff = $ids('sim-sniff'), tbody = $ids('sim-clients');

  let subs, retained, sensors, alarmOn, autoTimer = null;

  function makeSubs() {
    return {
      panel: { id: 'panel', name: 'Panel', filter: 'invernadero/sala1/+', qos: 1, persistent: true, online: true, recv: 0, queue: [], allow: 'invernadero/sala1/+' },
      alarma: { id: 'alarma', name: 'Alarma', filter: 'invernadero/+/temperatura', qos: 1, persistent: false, online: true, recv: 0, queue: [], allow: 'invernadero/+/temperatura' },
      vent: { id: 'vent', name: 'Ventilador', filter: T.fan, qos: 1, persistent: false, online: true, recv: 0, queue: [], allow: T.fan },
      bd: { id: 'bd', name: 'Base de datos', filter: 'invernadero/#', qos: 1, persistent: true, online: true, recv: 0, queue: [], allow: 'invernadero/#' },
      intruso: { id: 'intruso', name: 'Intruso', filter: '#', qos: 0, persistent: false, online: true, recv: 0, queue: [], active: false },
    };
  }
  const log = (t, c) => addLog(logEl, t, c);

  /* Espía de red */
  function sniffLine(plain) {
    const li = document.createElement('li');
    if ($ids('sim-tls').checked) { li.className = 'enc'; li.textContent = 'TLS · ' + hexNoise(16); }
    else { li.textContent = plain; if (/clave/.test(plain)) li.className = 'sec'; }
    sniff.insertBefore(li, sniff.firstChild);
    while (sniff.children.length > 7) sniff.removeChild(sniff.lastChild);
  }
  function sniffNote() {
    $ids('sniff-note').textContent = $ids('sim-tls').checked
      ? 'Con TLS el espía solo ve bytes cifrados y no puede leer datos ni claves.'
      : 'Sin TLS, cualquiera en la red lee los datos y las claves.';
  }

  /* Tabla de suscriptores */
  function renderTable() {
    tbody.textContent = '';
    Object.values(subs).forEach((s) => {
      if (s.active === false) return;
      const tr = document.createElement('tr');
      if (!s.online) tr.className = 'is-off';
      tr.innerHTML = '<td></td><td><code></code></td><td></td><td class="n"></td><td></td>';
      tr.children[0].innerHTML = '<span class="dot"></span>';
      tr.children[0].append(s.name);
      $('code', tr).textContent = s.filter;
      tr.children[2].textContent = s.persistent ? 'Persistente' : 'Limpia';
      tr.children[3].textContent = s.recv + (s.queue.length ? ` (+${s.queue.length} en cola)` : '');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--small';
      b.dataset.id = s.id;
      b.textContent = s.id === 'intruso' ? 'Expulsar' : s.online ? 'Desconectar' : 'Conectar';
      tr.children[4].appendChild(b);
      tbody.appendChild(tr);
    });
    $('.readout').classList.toggle('stale', !subs.panel.online);
  }

  /* Reglas de lo que hace cada suscriptor al recibir */
  function onMessage(s, topic, payload, wasRetained) {
    if (s.id === 'panel') {
      if (topic === T.temp) $ids('ro-temp').textContent = payload + ' °C';
      if (topic === T.hum) $ids('ro-hum').textContent = payload + ' %';
      if (topic === T.state) { $ids('ro-state').textContent = payload; $ids('ro-state-box').className = payload === 'online' ? 'good' : 'alert'; }
      if (topic === T.alarm) { $ids('ro-alarm').textContent = payload; $ids('ro-alarm-box').className = payload === 'normal' ? 'good' : 'alert'; }
    } else if (s.id === 'alarma' && topic === T.temp) {
      const v = parseFloat(payload);
      if (v > 30 && !alarmOn) {
        alarmOn = true; net.cls('alarma', 'alert', true);
        log('Alarma: más de 30 °C. Publica la alarma y ordena encender el ventilador.', 'warn');
        pubFrom('alarma', T.alarm, 'CALOR', 1, false);
        pubFrom('alarma', T.fan, 'ON', 1, false);
      } else if (v <= 28 && alarmOn) {
        alarmOn = false; net.cls('alarma', 'alert', false);
        log('Alarma: la temperatura bajó de 28 °C. Publica «normal» y apaga el ventilador.', 'ok');
        pubFrom('alarma', T.alarm, 'normal', 1, false);
        pubFrom('alarma', T.fan, 'OFF', 1, false);
      }
    } else if (s.id === 'vent' && topic === T.fan) {
      const onF = payload === 'ON';
      net.cls('vent', 'on', onF);
      $ids('ro-fan').textContent = onF ? 'encendido' : 'apagado';
      $ids('ro-fan-box').className = onF ? 'good' : '';
      log(`Ventilador ejecuta la orden: ${onF ? 'enciende' : 'apaga'}.`, onF ? 'ok' : 'dim');
    } else if (s.id === 'intruso') {
      log(`⚠ El intruso lee ${topic} = ${payload}${wasRetained ? ' (retenido)' : ''}`, 'bad');
    }
  }

  /* Entrega desde el broker a un suscriptor */
  async function deliver(s, topic, payload, q, wasRetained) {
    if (!s.online) {
      if (s.persistent && q >= 1) {
        s.queue.push({ topic, payload, q });
        log(`${s.name} sin conexión: el broker guarda el mensaje en su cola (${s.queue.length}).`, 'warn');
      } else {
        log(`${s.name} sin conexión: el mensaje se descarta (${s.persistent ? 'QoS 0 no se encola' : 'sesión limpia'}).`, 'bad');
      }
      renderTable();
      return;
    }
    const loss = +$ids('sim-loss').value;
    if (loss > 0 && Math.random() < loss) {
      await net.fly('b', s.id, { cls: 'pk-bad', lose: true });
      if (q === 0) { log(`✕ ${s.name}: paquete perdido en la red. QoS 0 no se reintenta.`, 'bad'); return; }
      log(`↻ ${s.name}: falló una entrega y el broker reintenta (QoS ${q}).`, 'warn');
    }
    await net.fly('b', s.id, { cls: 'pk-sub', label: wasRetained ? 'retenido' : '' });
    s.recv++;
    net.badge(s.id, s.recv);
    net.flash(s.id);
    renderTable();
    onMessage(s, topic, payload, wasRetained);
  }
  function route(topic, payload, qos, retain) {
    if (retain) { if (payload === '') retained.delete(topic); else retained.set(topic, { payload, qos }); }
    const targets = Object.values(subs).filter((s) => s.active !== false && topicMatches(s.filter, topic));
    if (!targets.length) log('Ningún suscriptor coincide con ese topic.', 'dim');
    return Promise.all(targets.map((s) => deliver(s, topic, payload, Math.min(qos, s.qos), false)));
  }
  async function pubFrom(src, topic, payload, qos, retain) {
    log(`${names[src]} publica ${topic} = ${payload} · QoS ${qos}${retain ? ' · retain' : ''}`, 'pub');
    sniffLine(`PUBLISH ${topic} = ${payload} (QoS ${qos})`);
    await net.fly(src, 'b', { cls: 'pk-pub', label: payload });
    net.flash('b');
    const q = Math.min(qos, 1);
    if (qos !== q) log(`QoS efectivo hacia los suscriptores = mínimo(${qos}, 1) = ${q}`, 'dim');
    return route(topic, payload, qos, retain);
  }

  /* Publicar lecturas */
  async function publishReadings() {
    const qos = +$ids('sim-qos').value, retain = $ids('sim-retain').checked;
    const jobs = [];
    if (sensors.st) jobs.push(pubFrom('st', T.temp, (+$ids('sim-temp').value).toFixed(1), qos, retain));
    else log('El sensor de temperatura está apagado: no publica.', 'dim');
    if (sensors.sh) jobs.push(pubFrom('sh', T.hum, String($ids('sim-hum').value), qos, retain));
    await Promise.all(jobs);
  }

  /* Reconexión de un suscriptor */
  async function connectSub(s) {
    s.online = true;
    net.cls(s.id, 'off', false);
    log(`${s.name} se conecta.`, 'ok');
    renderTable();
    if (s.persistent && s.queue.length) {
      log(`${s.name}: sesión persistente reconocida. El broker entrega ${s.queue.length} mensaje(s) guardados.`, 'ok');
      const q = s.queue.splice(0);
      for (const m of q) await deliver(s, m.topic, m.payload, m.q, false);
    } else {
      if (!s.persistent) log(`${s.name}: sesión nueva. Se suscribe de nuevo a ${s.filter}.`, 'dim');
      const r = [...retained.entries()].filter(([t]) => topicMatches(s.filter, t));
      for (const [t, m] of r) await deliver(s, t, m.payload, Math.min(m.qos, s.qos), true);
    }
    renderTable();
  }
  function disconnectSub(s) {
    s.online = false;
    net.cls(s.id, 'off', true);
    log(`${s.name} se desconecta.`, 'bad');
    if (!s.persistent) { s.queue = []; }
    renderTable();
  }

  /* Intruso */
  async function intruder() {
    const s = subs.intruso;
    if (s.active) return log('El intruso ya está dentro.', 'dim');
    net.cls('intruso', 'off', false);
    log('El intruso intenta conectarse sin credenciales válidas.', 'bad');
    sniffLine('CONNECT usuario=intruso clave=1234');
    await net.fly('intruso', 'b', { cls: 'pk-bad', label: 'CONNECT' });
    if ($ids('sim-auth').checked) {
      await net.fly('b', 'intruso', { cls: 'pk-ctl', label: 'CONNACK ✕', lose: false });
      log('Autenticación activa: CONNACK con rechazo. Conexión cerrada. El intruso no pasa.', 'ok');
      net.cls('intruso', 'off', true);
      return;
    }
    log('Sin autenticación, el broker acepta la conexión.', 'warn');
    await net.fly('b', 'intruso', { cls: 'pk-ctl', label: 'CONNACK' });
    await net.fly('intruso', 'b', { cls: 'pk-bad', label: 'SUBSCRIBE #' });
    if ($ids('sim-acl').checked) {
      await net.fly('b', 'intruso', { cls: 'pk-ctl', label: 'SUBACK ✕' });
      log('ACL activa: SUBACK con «no autorizado». El intruso no puede leer nada.', 'ok');
      net.cls('intruso', 'off', true);
      return;
    }
    await net.fly('b', 'intruso', { cls: 'pk-ctl', label: 'SUBACK' });
    s.active = true;
    log('Sin permisos por topic, el broker concede la suscripción a #. El intruso ve todo.', 'bad');
    renderTable();
    for (const [t, m] of retained.entries()) if (topicMatches('#', t)) await deliver(s, t, m.payload, 0, true);
  }

  /* Sensor */
  async function killSensor() {
    if (!sensors.st) return log('El sensor de temperatura ya está apagado.', 'dim');
    sensors.st = false;
    net.cls('st', 'off', true);
    log('Se corta la energía del sensor de temperatura. No alcanza a despedirse.', 'bad');
    await sleep(1200);
    if ($ids('sim-lwt').checked) {
      log('El broker no recibe señales dentro del keep alive y publica el testamento.', 'ok');
      await route(T.state, 'offline', 1, true);
    } else {
      log('El broker cierra la conexión, pero sin testamento nadie se entera: el panel sigue mostrando «online».', 'warn');
    }
  }
  async function reviveSensor() {
    if (sensors.st) return log('El sensor de temperatura ya está conectado.', 'dim');
    sensors.st = true;
    net.cls('st', 'off', false);
    log('El sensor de temperatura se reconecta.', 'ok');
    sniffLine('CONNECT usuario=sensor-temp clave=invernadero123');
    await pubFrom('st', T.state, 'online', 1, true);
  }

  /* Estado inicial */
  function resetSim() {
    clearInterval(autoTimer);
    $ids('sim-auto').checked = false;
    subs = makeSubs();
    retained = new Map();
    sensors = { st: true, sh: true };
    alarmOn = false;
    logEl.textContent = '';
    sniff.textContent = '';
    Object.keys(net.nodes).forEach((id) => {
      ['off', 'on', 'alert', 'miss', 'flash'].forEach((c) => net.cls(id, c, false));
      net.badge(id, null);
    });
    net.cls('intruso', 'off', true);
    $ids('ro-temp').textContent = '—'; $ids('ro-hum').textContent = '—';
    $ids('ro-fan').textContent = 'apagado'; $ids('ro-fan-box').className = '';
    $ids('ro-alarm').textContent = 'normal'; $ids('ro-alarm-box').className = '';
    log('Los cuatro suscriptores se conectan y envían SUBSCRIBE con sus filtros.', 'sub');
    retained.set(T.state, { payload: 'online', qos: 1 });
    $ids('ro-state').textContent = 'online'; $ids('ro-state-box').className = 'good';
    log('El sensor de temperatura se conecta, deja «online» como mensaje retenido y registra su testamento.', 'pub');
    log('Todo listo. Publica una lectura o mueve la temperatura.', 'dim');
    sniffLine('CONNECT usuario=sensor-temp clave=invernadero123');
    sniffNote();
    renderTable();
  }

  /* Controles */
  const temp = $ids('sim-temp'), hum = $ids('sim-hum');
  const showTemp = () => ($ids('sim-temp-v').textContent = (+temp.value).toFixed(1) + ' °C');
  const showHum = () => ($ids('sim-hum-v').textContent = hum.value + ' %');
  temp.addEventListener('input', showTemp);
  hum.addEventListener('input', showHum);
  $ids('sim-pub').addEventListener('click', publishReadings);
  $ids('sim-heat').addEventListener('click', () => { temp.value = 35; showTemp(); publishReadings(); });
  $ids('sim-kill').addEventListener('click', killSensor);
  $ids('sim-revive').addEventListener('click', reviveSensor);
  $ids('sim-intruder').addEventListener('click', intruder);
  $ids('sim-reset').addEventListener('click', resetSim);
  $ids('sim-tls').addEventListener('change', () => { sniffNote(); log(`Cifrado TLS ${$ids('sim-tls').checked ? 'activado' : 'desactivado'}.`, 'dim'); });
  $ids('sim-auth').addEventListener('change', () => log(`Autenticación ${$ids('sim-auth').checked ? 'activada' : 'desactivada'}.`, 'dim'));
  $ids('sim-acl').addEventListener('change', () => log(`Permisos por topic ${$ids('sim-acl').checked ? 'activados' : 'desactivados'}.`, 'dim'));
  $ids('sim-auto').addEventListener('change', (e) => {
    clearInterval(autoTimer);
    if (e.target.checked) {
      autoTimer = setInterval(() => {
        const v = Math.min(40, Math.max(10, +temp.value + (Math.random() - 0.5) * 0.8));
        temp.value = v.toFixed(1); showTemp();
        publishReadings();
      }, 2500);
      publishReadings();
    }
  });
  tbody.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const s = subs[b.dataset.id];
    if (s.id === 'intruso') {
      s.active = false; s.recv = 0; net.badge('intruso', null); net.cls('intruso', 'off', true);
      log('El intruso es expulsado.', 'ok'); renderTable(); return;
    }
    if (s.online) disconnectSub(s); else connectSub(s);
  });

  showTemp(); showHum(); resetSim();
})();
