// FrameCrafter project page interactions.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = './static/';
const NS = 'http://www.w3.org/2000/svg';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const getJSON = u => fetch(u).then(r => r.json());

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  kids.flat().forEach(c => e.append(c));
  return e;
}
function s(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  kids.flat().forEach(c => e.append(c));
  return e;
}
function onVisible(el, cb, opts = { threshold: 0.2 }) {
  const io = new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), opts);
  io.observe(el);
}
function segment(root, cb) {
  $$('button', root).forEach(b => b.addEventListener('click', () => {
    $$('button', root).forEach(x => x.classList.toggle('on', x === b));
    cb(b.dataset);
  }));
}
function preload(urls) { return urls.map(u => { const i = new Image(); i.src = u; return i; }); }

let rigMod = null;
async function makeRig(el) {
  if (rigMod === null) {
    try { rigMod = await import('./rig.js'); } catch (e) { console.warn('3D viewer unavailable', e); rigMod = false; }
  }
  if (!rigMod) { el.append(h('div', { class: 'fallback' }, '3D viewer unavailable in this browser.')); return null; }
  try { return new rigMod.Rig(el); } catch (e) {
    console.warn(e); el.append(h('div', { class: 'fallback' }, 'WebGL is not available, so the 3D camera view is hidden.')); return null;
  }
}

/* ------------------------------------------------------------------ nav, reveal, media */
function initChrome() {
  const nav = $('#nav'), bar = $('#navbar');
  const links = $$('.nav .links a');
  const secs = links.map(a => document.getElementById(a.getAttribute('href').slice(1)));
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle('show', y > window.innerHeight * 0.55);
    const H = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (100 * y / Math.max(H, 1)) + '%';
    let cur = -1;
    secs.forEach((sec, i) => { if (sec && sec.getBoundingClientRect().top < window.innerHeight * 0.35) cur = i; });
    links.forEach((a, i) => a.classList.toggle('on', i === cur));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { threshold: 0.08 });
  $$('.rv').forEach(e => rio.observe(e));

  // lazy autoplaying videos
  $$('video[data-src]').forEach(v => {
    onVisible(v, vis => {
      if (vis) {
        if (!v.src) { v.src = v.dataset.src; }
        v.play().catch(() => {});
      } else if (!v.paused) v.pause();
    }, { threshold: 0.05, rootMargin: '150px' });
  });

  // lightbox
  const lb = $('#lightbox');
  $$('[data-zoom]').forEach(img => img.addEventListener('click', () => { $('img', lb).src = img.src; lb.classList.add('show'); }));
  lb.addEventListener('click', () => lb.classList.remove('show'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.remove('show'); });

  $('#copyBib').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#bib').textContent); $('#copyBib').textContent = 'Copied ✓'; }
    catch { $('#copyBib').textContent = 'Select & copy'; }
    setTimeout(() => { $('#copyBib').textContent = 'Copy'; }, 1600);
  });
  const tv = $('#teaserVideo'); if (tv) tv.volume = 0.5;
}

/* ------------------------------------------------------------------ wipe slider */
function wipe(el, start = 50) {
  const top = $('.top', el), handle = $('.handle', el);
  let p = start, enabled = true, drag = false, touched = false;
  const set = v => { p = clamp(v, 0, 100); top.style.clipPath = `inset(0 0 0 ${p}%)`; handle.style.left = p + '%'; };
  const fromEvent = e => { const r = el.getBoundingClientRect(); set(100 * (e.clientX - r.left) / r.width); };
  // mouse: the seam follows the cursor; touch/pen: drag horizontally (vertical swipes still scroll the page)
  el.addEventListener('pointerdown', e => {
    if (!enabled) return;
    touched = true; drag = true;
    if (e.pointerType === 'mouse') e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    fromEvent(e);
  });
  el.addEventListener('pointermove', e => { if (enabled && (drag || e.pointerType === 'mouse')) { touched = true; fromEvent(e); } });
  const end = () => { drag = false; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  el.addEventListener('dragstart', e => e.preventDefault());
  set(p);
  // a one-time sweep to advertise the slider
  let swept = false;
  onVisible(el, vis => {
    if (!vis || swept || reduced) return; swept = true;
    const t0 = performance.now();
    const step = t => {
      if (touched) return;
      const k = (t - t0) / 1400; if (k >= 1) { set(start); return; }
      set(start + 30 * Math.sin(k * Math.PI * 2) * (1 - k)); requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: 0.5 });
  return { set, get: () => p, enable(b) { enabled = b; el.style.cursor = b ? 'ew-resize' : 'default'; } };
}

/* ------------------------------------------------------------------ 01 story */
function initStory() {
  const stage = $('#storyStage');
  const G = S + 'gallery/gym/', D = S + 'denoise/gym/';
  const xs = Array.from({ length: 50 }, (_, i) => ({ src: `${D}x${String(i).padStart(2, '0')}.jpg` }));
  onVisible(stage, v => { if (v && !xs.loaded) { xs.loaded = true; preload(xs.map(x => x.src)); } }, { rootMargin: '1200px' });
  const cards = [];
  for (let i = 0; i < 6; i++) {
    const c = h('div', { class: 'st-card' },
      h('div', { class: 'im' }, h('img', { src: G + `in${i}.jpg`, alt: '' }), h('img', { class: 'alt', src: i < 5 ? S + `story/v${i}.jpg` : G + `in${i}.jpg`, alt: '' })),
      h('div', { class: 'tag' }, `t=${i}`));
    stage.append(c); cards.push(c);
  }
  const qImg = h('img', { src: xs[0].src, alt: '', style: 'opacity:0' });
  const qMark = h('div', { style: 'position:absolute;inset:0;display:grid;place-items:center;color:#ff9d66;font-family:var(--serif);font-size:44px;transition:opacity .4s' }, '?');
  const q = h('div', { class: 'st-card query' }, h('div', { class: 'im' }, qImg, qMark), h('div', { class: 'tag' }, 'query'));
  stage.append(q);
  const films = $$('.film', stage), ring = $('.ring', stage), dit = $('.dit', stage);
  const lab = $('#storyLabel'), lab2 = $('#storyLabel2');
  let step = -1, shuffleTimer = null, order = [0, 1, 2, 3, 4, 5];

  const place = (c, x, y, w, r = 0, o = 1) => {
    c.style.width = w + 'px'; c.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg)`; c.style.opacity = o;
  };
  const tag = (c, txt, cls = '') => { const t = $('.tag', c); t.textContent = txt; t.className = 'tag ' + cls; };
  const AR = 480 / 832;

  function layout() {
    const W = stage.clientWidth, H = stage.clientHeight;
    clearInterval(shuffleTimer); shuffleTimer = null;
    films.forEach(f => (f.style.opacity = 0));
    ring.style.opacity = 0; dit.style.opacity = 0; dit.style.transform = 'translate(-50%,-50%) scale(.9)';
    cards.forEach(c => $('.alt', c).style.opacity = 0);
    if (step === 0) {
      // one still image: what an image model is pretrained on
      const w = W * 0.4, x = (W - w) / 2, y = H * 0.44 - w * AR / 2;
      cards.forEach((c, i) => { place(c, x + w * 0.3, y + w * AR * 0.2, w * 0.4, 0, i === 2 ? 1 : 0); $('.alt', c).style.opacity = 1; });
      place(cards[2], x, y, w); tag(cards[2], 'one image');
      place(q, x + w * 0.3, y + w * AR * 0.2, w * 0.4, 0, 0);
      lab.innerHTML = '<b>Image diffusion</b> · pretrained on still images'; lab2.textContent = 'multi-view learned from ~80K scenes';
    } else if (step === 1) {
      // the same image is one frame of a video: the camera moves through the scene
      const n = 5, gap = W * 0.012, w = (W * 0.9 - gap * (n - 1)) / n, ch = w * AR;
      const x0 = (W - (n * w + (n - 1) * gap)) / 2, y = H * 0.46 - ch / 2;
      films[0].style.top = (y - 22) + 'px'; films[1].style.top = (y + ch + 16) + 'px';
      films.forEach(f => (f.style.opacity = 1));
      cards.forEach((c, i) => { place(c, x0 + Math.min(i, 4) * (w + gap), y, w, 0, i < 5 ? 1 : 0); $('.alt', c).style.opacity = 1; tag(c, `t=${i}`); });
      place(q, x0 + 4 * (w + gap), y, w, 0, 0);
      lab.innerHTML = '<b>Video diffusion</b> · pretrained on moving cameras'; lab2.textContent = 'viewpoint changes seen at scale';
    } else if (step === 2) {
      const w = W * 0.2, ch = w * AR;
      const slots = [[0.06, 0.12, -4], [0.37, 0.07, 3], [0.68, 0.13, -2], [0.08, 0.56, 3], [0.39, 0.6, -3], [0.7, 0.55, 4]];
      const qx = W * 0.5 - w / 2, qy = H * 0.34 - ch / 2;
      const apply = () => {
        cards.forEach((c, i) => {
          const sl = order.indexOf(i), [fx, fy, r] = slots[sl];
          place(c, W * fx, H * fy + (sl < 3 ? -H * 0.02 : H * 0.08), w, r);
          tag(c, `t=${sl}`, 'shuffled');
        });
      };
      place(q, qx, H * 0.4, w * 0.9, 0, 0);
      apply();
      shuffleTimer = setInterval(() => { order = order.slice().sort(() => Math.random() - 0.5); apply(); }, 1500);
      $$('.tag.shuffled', stage).forEach(t => (t.style.background = '#b91c1c'));
      lab.innerHTML = '<b>6 sparse photos</b> · same set, new order'; lab2.textContent = 'new time indices, a different input';
    } else {
      const big = step === 4, w = W * (big ? 0.17 : 0.2), ch = w * AR;
      const cx = W / 2, cy = H * 0.47, rx = W * 0.37, ry = H * 0.34;
      ring.style.width = 2 * rx + 'px'; ring.style.height = 2 * ry + 'px'; ring.style.opacity = 1; ring.style.top = cy + 'px';
      cards.forEach((c, i) => {
        const a = -Math.PI / 2 + (i + 0.5) * (2 * Math.PI / 6);
        place(c, cx + rx * Math.cos(a) - w / 2, cy + ry * Math.sin(a) - ch / 2, w);
        tag(c, 't=0', 'zero');
      });
      const qw = big ? W * 0.36 : W * 0.22;
      place(q, cx - qw / 2, cy - qw * AR / 2, qw, 0, big ? 1 : 0); tag(q, 'query · t=0', 'zero');
      if (big) { dit.style.opacity = 1; dit.style.transform = 'translate(-50%,-50%) scale(1)'; dit.style.top = cy + 'px'; }
      lab.innerHTML = big ? '<b>Denoising the query</b>' : '<b>An unordered set</b> · one latent per photo, all at t=0';
      lab2.textContent = big ? '' : 'told apart only by their camera rays';
    }
    $$('.tag', stage).forEach(t => { if (!t.classList.contains('shuffled')) t.style.background = ''; });
    qMark.style.fontSize = Math.max(18, q.getBoundingClientRect().width * 0.3) + 'px';
    const filled = step === 4;
    qImg.style.opacity = filled ? 1 : 0; qMark.style.opacity = filled ? 0 : 1; q.classList.toggle('filled', filled);
  }

  // compact stepper: auto-advances while on screen; clicking a step takes over
  const steps = $$('.step', $('#storySteps'));
  const DUR = [3400, 3800, 4600, 4200, 4200];
  let sig = null, auto = !reduced, vis = false, t0 = 0, raf = 0;
  getJSON(D + 'meta.json').then(m => (sig = m.sigmas));
  const go = k => {
    step = k; t0 = performance.now();
    steps.forEach((x, i) => x.classList.toggle('on', i === k));
    layout();
  };
  const tick = now => {
    raf = requestAnimationFrame(tick);
    if (!vis) return;
    const p = clamp((now - t0) / DUR[step], 0, 1);
    const pg = $('.pg', steps[step]); if (pg) pg.style.width = (auto ? 100 * p : 0) + '%';
    if (step === 4) {
      // run the 50 denoising steps in the first 70% of the slot, then hold the result
      const k = Math.round(clamp(p / 0.7, 0, 1) * 49);
      if (qImg.dataset.k !== String(k)) {
        qImg.dataset.k = k; qImg.src = xs[k].src;
        lab2.innerHTML = `step <b>${k + 1}</b> / 50` + (sig ? ` · σ = ${sig[k].toFixed(3)}` : '');
      }
    }
    if (auto && p >= 1) go((step + 1) % 5);
  };
  steps.forEach((x, i) => x.addEventListener('click', () => { auto = false; go(i); }));
  onVisible(stage, v => { vis = v; if (v) t0 = performance.now(); }, { threshold: 0.35 });
  window.addEventListener('resize', () => { if (step >= 0) layout(); });
  go(0);
  raf = requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ 02 method widgets */
function initVAE() {
  const svg = $('#vaeSvg'), G = S + 'gallery/gym/';
  const fx = i => 18 + i * 56, FW = 44, FH = 26;
  const defs = s('defs', {}, s('marker', { id: 'ah', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0L10 5L0 10z', fill: '#8b93a3' })),
    s('marker', { id: 'ahO', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0L10 5L0 10z', fill: '#e8590c' })));
  svg.append(defs);
  for (let i = 0; i < 5; i++) {
    svg.append(s('image', { href: G + `in${i}.jpg`, x: fx(i), y: 4, width: FW, height: FH, preserveAspectRatio: 'xMidYMid slice' }));
    svg.append(s('rect', { x: fx(i), y: 4, width: FW, height: FH, rx: 3, fill: 'none', stroke: '#2563eb', 'stroke-width': 1.5 }));
  }
  const lat = (x, y, w, fill) => s('rect', { x: x - w / 2, y, width: w, height: 18, rx: 3, fill, stroke: '#1e3a8a', 'stroke-width': 1 });
  // ours
  const ours = s('g', { class: 'vae-ours', style: 'transition:opacity .5s' });
  for (let i = 0; i < 5; i++) {
    const cx = fx(i) + FW / 2;
    ours.append(s('path', { d: `M${cx - 14} 52 h28 l-5 18 h-18z`, fill: '#e9edf5', stroke: '#b7c0d1' }));
    ours.append(s('text', { x: cx, y: 64, 'text-anchor': 'middle', 'font-size': 7.5, fill: '#5b6372', 'font-family': 'JetBrains Mono' }, 'VAE'));
    ours.append(s('line', { x1: cx, y1: 32, x2: cx, y2: 50, stroke: '#8b93a3', 'stroke-width': 1.2, 'marker-end': 'url(#ah)' }));
    ours.append(s('line', { x1: cx, y1: 72, x2: cx, y2: 92, stroke: '#8b93a3', 'stroke-width': 1.2, 'marker-end': 'url(#ah)' }));
    ours.append(lat(cx, 95, 22, '#93b4f5'));
    ours.append(s('text', { x: cx, y: 128, 'text-anchor': 'middle', 'font-size': 8, fill: '#3a3f48', 'font-family': 'JetBrains Mono' }, `z${i + 1}`));
  }
  ours.append(s('text', { x: 150, y: 146, 'text-anchor': 'middle', 'font-size': 9, fill: '#15935b', 'font-family': 'Inter', 'font-weight': 600 }, '5 views → 5 latents · each independent of the others'));
  // causal
  const causal = s('g', { class: 'vae-causal', style: 'transition:opacity .5s;opacity:0' });
  causal.append(s('rect', { x: 14, y: 52, width: 272, height: 18, rx: 4, fill: '#fde4d4', stroke: '#f2b48f' }));
  causal.append(s('text', { x: 150, y: 64, 'text-anchor': 'middle', 'font-size': 7.5, fill: '#9a3412', 'font-family': 'JetBrains Mono' }, 'causal 3D conv · feature cache · 4× temporal stride'));
  for (let i = 0; i < 4; i++) {
    const a = fx(i) + FW / 2, b = fx(i + 1) + FW / 2;
    causal.append(s('path', { d: `M${a} 34 Q ${(a + b) / 2} 46 ${b - 4} 36`, fill: 'none', stroke: '#e8590c', 'stroke-width': 1.2, 'stroke-dasharray': '3 2', 'marker-end': 'url(#ahO)' }));
  }
  const c0 = fx(0) + FW / 2, c1 = (fx(1) + fx(4) + FW) / 2;
  for (let i = 0; i < 5; i++) {
    const cx = fx(i) + FW / 2;
    causal.append(s('line', { x1: cx, y1: 32, x2: cx, y2: 50, stroke: '#8b93a3', 'stroke-width': 1.2 }));
  }
  causal.append(s('line', { x1: c0, y1: 72, x2: c0, y2: 92, stroke: '#8b93a3', 'stroke-width': 1.2, 'marker-end': 'url(#ah)' }));
  for (let i = 1; i < 5; i++) {
    const cx = fx(i) + FW / 2;
    causal.append(s('line', { x1: cx, y1: 72, x2: c1 + (cx - c1) * 0.12, y2: 92, stroke: '#e8590c', 'stroke-width': 1.1, 'marker-end': 'url(#ahO)' }));
  }
  causal.append(lat(c0, 95, 22, '#93b4f5'));
  causal.append(lat(c1, 95, 30, 'url(#mix)'));
  defs.append(s('linearGradient', { id: 'mix' }, s('stop', { offset: 0, 'stop-color': '#93b4f5' }), s('stop', { offset: 1, 'stop-color': '#f7b28a' })));
  causal.append(s('text', { x: c0, y: 128, 'text-anchor': 'middle', 'font-size': 8, fill: '#3a3f48', 'font-family': 'JetBrains Mono' }, 'z1'));
  causal.append(s('text', { x: c1, y: 128, 'text-anchor': 'middle', 'font-size': 8, fill: '#3a3f48', 'font-family': 'JetBrains Mono' }, 'z2 = mix(f2…f5)'));
  causal.append(s('text', { x: 150, y: 146, 'text-anchor': 'middle', 'font-size': 9, fill: '#b91c1c', 'font-family': 'Inter', 'font-weight': 600 }, '5 frames → 2 latents · order-dependent'));
  svg.append(ours, causal);
  segment($('#vaeSeg'), d => {
    const c = d.m === 'causal';
    causal.style.opacity = c ? 1 : 0; ours.style.opacity = c ? 0 : 1;
    $('#vaeRes').innerHTML = c
      ? 'Encoding the views jointly merges far-apart viewpoints into shared latents and makes them depend on order. PSNR falls to <b>11.50</b>.'
      : 'Without per-view encoding, PSNR drops from <b>15.69</b> to <b>11.50</b>: the single most important change.';
  });
}

async function initCams() {
  const gal = await getJSON(S + 'data/gallery.json');
  const g = gal.find(x => x.id === 'gym');
  const qIdx = 6 + g.targets.indexOf(64);
  const ids = [0, 1, 2, 3, 4, 5, qIdx];
  const cams = ids.map(k => {
    const c = g.c2w[k];
    const p = [c[3], c[11]], f = [-c[2], -c[10]], n = Math.hypot(f[0], f[1]) || 1;
    return { p, f: [f[0] / n, f[1] / n] };
  });
  const svg = $('#camSvg');
  const world = s('g', { style: 'transition:transform 1s cubic-bezier(.65,.02,.25,1)' });
  // scale so the farthest camera from any candidate origin lands ~72px away
  let far = 0;
  cams.forEach(a => cams.forEach(b => { far = Math.max(far, Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1])); }));
  const SC = 74 / far, SZ = 15 / SC, WD = 10 / SC;
  const grid = s('g', {});
  const gs = 22 / SC;
  for (let i = -14; i <= 14; i++) {
    grid.append(s('line', { x1: i * gs, y1: -14 * gs, x2: i * gs, y2: 14 * gs, stroke: '#e6e2da', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
    grid.append(s('line', { x1: -14 * gs, y1: i * gs, x2: 14 * gs, y2: i * gs, stroke: '#e6e2da', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
  }
  world.append(grid);
  const wedges = cams.map((c, i) => {
    const [px, pz] = c.p, [fx, fz] = c.f, rx = -fz, rz = fx;
    const a = [px + SZ * fx + WD * rx, pz + SZ * fz + WD * rz], b = [px + SZ * fx - WD * rx, pz + SZ * fz - WD * rz];
    const q = i === 6;
    const poly = s('polygon', { points: `${px},${pz} ${a} ${b}`, fill: q ? 'rgba(232,89,12,.18)' : 'rgba(37,99,235,.12)', stroke: q ? '#e8590c' : '#2563eb', 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' });
    world.append(poly);
    return poly;
  });
  const origin = s('g', {},
    s('line', { x1: 150, y1: 104, x2: 150, y2: 80, stroke: '#15935b', 'stroke-width': 2, 'marker-end': 'url(#ahG)' }),
    s('line', { x1: 150, y1: 104, x2: 174, y2: 104, stroke: '#dc2626', 'stroke-width': 2, 'marker-end': 'url(#ahR)' }),
    s('circle', { cx: 150, cy: 104, r: 3.5, fill: '#15171b' }),
    s('text', { x: 156, y: 118, 'font-size': 9, fill: '#3a3f48', 'font-family': 'JetBrains Mono' }, 'origin'));
  svg.append(s('defs', {},
    s('marker', { id: 'ahG', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, s('path', { d: 'M0 0L10 5L0 10z', fill: '#15935b' })),
    s('marker', { id: 'ahR', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, s('path', { d: 'M0 0L10 5L0 10z', fill: '#dc2626' }))));
  svg.append(world, origin);
  const readout = s('text', { x: 150, y: 184, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#3a3f48', 'font-family': 'JetBrains Mono' }, '');
  svg.append(readout);
  const legend = s('text', { x: 6, y: 12, 'font-size': 9, fill: '#6b7079', 'font-family': 'Inter' });
  legend.append(s('tspan', { fill: '#2563eb' }, '▲ inputs  '), s('tspan', { fill: '#e8590c' }, '▲ query'));
  svg.append(legend);

  let mode = 'query', order = [0, 1, 2, 3, 4, 5];
  function apply() {
    const oi = mode === 'query' ? 6 : order[0];
    const { p, f } = cams[oi];
    const ang = Math.atan2(f[1], f[0]) * 180 / Math.PI;
    const rot = -90 - ang;
    world.style.transform = `translate(150px, 104px) rotate(${rot}deg) scale(${SC}) translate(${-p[0]}px, ${-p[1]}px)`;
    wedges.forEach((w, i) => {
      const isO = i === oi;
      w.setAttribute('stroke-width', isO ? 3 : 1.6);
      if (i < 6) w.setAttribute('fill', isO ? 'rgba(37,99,235,.35)' : 'rgba(37,99,235,.12)');
    });
    // query position in the current world frame
    const qc = cams[6], R = -(Math.atan2(f[1], f[0]) + Math.PI / 2);
    const dx = qc.p[0] - p[0], dz = qc.p[1] - p[1];
    const x = dx * Math.cos(R) - dz * Math.sin(R), z = dx * Math.sin(R) + dz * Math.cos(R);
    readout.textContent = mode === 'query' ? 'query camera at (0.00, 0.00): fixed' : `query camera at (${x.toFixed(2)}, ${(-z).toFixed(2)})`;
    $('#camRes').innerHTML = mode === 'query'
      ? 'With the query as origin, reordering the inputs leaves every coordinate unchanged.'
      : 'The origin is whichever input comes first. <b>Shuffle</b> and every camera, including the query, gets new coordinates.';
  }
  segment($('#camSeg'), d => { mode = d.m; apply(); });
  $('#camShuffle').addEventListener('click', () => {
    let o; do { o = order.slice().sort(() => Math.random() - 0.5); } while (o[0] === order[0]);
    order = o; apply();
  });
  apply();
}

function initRoPE() {
  const box = $('#ropeTokens'), G = S + 'gallery/gym/';
  let mode = 'ours', order = [0, 1, 2, 3, 4, 5], prevT = order.slice();
  const toks = [];
  for (let i = 0; i < 7; i++) {
    const q = i === 6;
    const t = h('div', { style: 'position:absolute;top:22px;left:0;transition:transform .7s cubic-bezier(.65,.02,.25,1)' },
      q ? h('div', { style: 'border:2px dashed #e8590c;border-radius:6px;aspect-ratio:832/480;display:grid;place-items:center;color:#e8590c;font-family:var(--serif);font-size:20px;background:#fff' }, '?')
        : h('img', { src: G + `in${i}.jpg`, style: 'width:100%;aspect-ratio:832/480;object-fit:cover;border-radius:6px;border:2px solid #2563eb' }),
      h('div', { class: 'tb', style: 'position:absolute;top:-20px;left:50%;transform:translateX(-50%);font-family:var(--mono);font-size:11px;color:#fff;padding:0 6px;border-radius:5px;white-space:nowrap;transition:background .3s' }, ''));
    box.append(t); toks.push(t);
  }
  const msg = $('#ropeMsg');
  function apply(flash = false) {
    const W = box.clientWidth, gap = 6, w = (W - 6 * gap) / 7;
    toks.forEach((t, i) => {
      const slot = i === 6 ? 6 : order.indexOf(i);
      t.style.width = w + 'px';
      t.style.transform = `translateX(${slot * (w + gap)}px)`;
      const b = $('.tb', t);
      if (mode === 'rope') {
        b.textContent = `t=${slot}`;
        const changed = flash && i < 6 && prevT.indexOf(i) !== slot;
        b.style.background = changed ? '#dc2626' : '#2a2d34';
      } else { b.textContent = 't=0'; b.style.background = '#15935b'; }
    });
    msg.innerHTML = mode === 'rope'
      ? 'Each view’s time index is its slot in the sequence. <b>Shuffle</b>: same photos, new indices (red), so the model sees a different input.'
      : 'Every token has t = 0. Order carries no information; views are told apart only by their camera rays.';
  }
  segment($('#ropeSeg'), d => { mode = d.m; apply(); });
  $('#ropeShuffle').addEventListener('click', () => {
    prevT = order.slice();
    let o; do { o = order.slice().sort(() => Math.random() - 0.5); } while (o.join() === order.join());
    order = o; apply(true);
  });
  new ResizeObserver(() => apply()).observe(box);
  apply();
}

/* ------------------------------------------------------------------ 03 denoising */
function initDenoise() {
  const SC = [{ id: 'gym', label: 'Gym' }, { id: 'store', label: 'Appliance store' }, { id: 'steak', label: 'Steakhouse' }];
  const chips = $('#dnChips'), img = $('#dnImg'), hud = $('#dnHud'), range = $('#dnRange'), strip = $('#dnStrip'), chart = $('#dnChart');
  const marks = [0, 1, 3, 6, 10, 20, 35, 49];
  let mode = 'x0', k = 0, frames = { x0: [], zt: [] }, meta = null, timer = null, cursor = null;
  const show = () => {
    const list = frames[mode];
    if (list[k]) img.src = list[k].src;
    let t = `step ${k + 1} / 50`;
    if (meta) {
      t += ` · noise σ = ${meta.sigmas[k].toFixed(2)}`;
      if (mode === 'x0') t += ` · PSNR ${meta.psnr[k].toFixed(2)} dB · LPIPS ${meta.lpips[k].toFixed(3)}`;
    }
    hud.textContent = t;
    range.value = k;
    $$('figure', strip).forEach((f, i) => f.classList.toggle('on', marks[i] === k));
    if (cursor) cursor(k);
  };
  const stop = () => { clearInterval(timer); timer = null; $('#dnPlay').innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>'; };
  const play = () => {
    stop(); if (k >= 49) k = 0;
    $('#dnPlay').innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
    timer = setInterval(() => { k++; show(); if (k >= 49) stop(); }, 110);
  };
  function drawChart() {
    chart.innerHTML = '';
    if (!meta) return;
    // two small multiples sharing the step axis (no dual y-axis)
    const panels = [{ key: 'psnr', title: 'PSNR (dB) ↑', y0: 8, f: v => v.toFixed(1) }, { key: 'lpips', title: 'LPIPS ↓', y0: 104, f: v => v.toFixed(3) }];
    const L = 46, R = 428, ph = 64, X = i => L + (R - L) * i / 49;
    const curs = [];
    panels.forEach(pn => {
      const v = meta[pn.key], lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo) * 0.15 || 0.01;
      const Y = x => pn.y0 + 14 + ph - (x - (lo - pad)) / (hi - lo + 2 * pad) * ph;
      chart.append(s('text', { x: 0, y: pn.y0 + 9, 'font-size': 12, fill: '#c9ccd4', 'font-weight': 600 }, pn.title));
      [lo, hi].forEach(t => {
        chart.append(s('line', { x1: L, x2: R, y1: Y(t), y2: Y(t), stroke: '#2a2d34', 'stroke-width': 1 }));
        chart.append(s('text', { x: L - 6, y: Y(t) + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: '#9a9eaa', 'font-family': 'JetBrains Mono' }, pn.f(t)));
      });
      chart.append(s('path', { d: 'M' + v.map((x, i) => `${X(i)} ${Y(x)}`).join(' L'), fill: 'none', stroke: '#ff9d66', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      const dot = s('circle', { r: 4.5, fill: '#ff9d66', stroke: '#0c0d10', 'stroke-width': 2 });
      const lab = s('text', { 'font-size': 11, fill: '#fff', 'font-family': 'JetBrains Mono' });
      chart.append(dot, lab);
      curs.push(i => {
        dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(v[i]));
        const above = Y(v[i]) - 9 > pn.y0 + 26;
        lab.setAttribute('x', Math.min(X(i) + 9, R - 44)); lab.setAttribute('y', above ? Y(v[i]) - 9 : Y(v[i]) + 17); lab.textContent = pn.f(v[i]);
      });
    });
    const vline = s('line', { y1: 18, y2: 190, stroke: '#5b5f68', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
    chart.prepend(vline);
    [1, 10, 20, 30, 40, 50].forEach(st => chart.append(s('text', { x: X(st - 1), y: 198, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#9a9eaa', 'font-family': 'JetBrains Mono' }, st)));
    const hit = s('rect', { x: L, y: 0, width: R - L, height: 200, fill: 'transparent', style: 'cursor:ew-resize' });
    const pick = e => { const r = chart.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * 440; stop(); k = clamp(Math.round((x - L) / (R - L) * 49), 0, 49); show(); };
    hit.addEventListener('pointerdown', pick); hit.addEventListener('pointermove', e => { if (e.buttons) pick(e); });
    chart.append(hit);
    cursor = i => { vline.setAttribute('x1', X(i)); vline.setAttribute('x2', X(i)); curs.forEach(c => c(i)); };
  }
  function load(id) {
    const D = S + `denoise/${id}/`;
    frames.x0 = preload(Array.from({ length: 50 }, (_, i) => `${D}x${String(i).padStart(2, '0')}.jpg`));
    frames.zt = preload(Array.from({ length: 50 }, (_, i) => `${D}z${String(i).padStart(2, '0')}.jpg`));
    meta = null; cursor = null;
    getJSON(D + 'meta.json').then(m => {
      meta = m; drawChart();
      $('#dnFinalCap').textContent = `Ours · ${m.final_psnr.toFixed(2)} dB · LPIPS ${m.final_lpips.toFixed(3)}`;
      show();
    });
    $('#dnFinal').src = D + 'final.jpg'; $('#dnGT').src = D + 'gt.jpg';
    const ins = $('#dnInputs'); ins.innerHTML = '';
    for (let i = 0; i < 6; i++) ins.append(h('img', { src: D + `in${i}.jpg`, alt: `input ${i + 1}` }));
    strip.innerHTML = '';
    marks.forEach(m => strip.append(h('figure', { onclick: () => { stop(); k = m; show(); } },
      h('img', { src: `${D}x${String(m).padStart(2, '0')}.jpg`, alt: '' }), h('figcaption', {}, `step ${m + 1}`))));
    $$('.scene-chip', chips).forEach(c => c.classList.toggle('on', c.dataset.id === id));
    k = 0; show();
  }
  SC.forEach(sc => chips.append(h('button', { class: 'scene-chip', 'data-id': sc.id, onclick: () => { stop(); load(sc.id); play(); } },
    h('img', { src: S + `denoise/${sc.id}/final.jpg`, alt: '' }), sc.label)));
  range.addEventListener('input', () => { stop(); k = +range.value; show(); });
  $('#dnPlay').addEventListener('click', () => (timer ? stop() : play()));
  segment($('#dnSeg'), d => { mode = d.m; show(); });
  let loaded = false;
  const ensure = () => { if (!loaded) { loaded = true; load('gym'); } };
  onVisible($('#denoise'), v => { if (v) ensure(); }, { rootMargin: '900px' });
  let played = false;
  onVisible($('#dnMain'), v => { if (v && !played) { ensure(); played = true; setTimeout(play, 600); } }, { threshold: 0.6 });
}

/* ------------------------------------------------------------------ 04 extreme camera paths */
async function initPaths() {
  const data = await getJSON(S + 'data/paths.json');
  const chips = $('#pathChips'), grid = $('#pathGrid'), rigEl = $('#pathRig');
  const METHODS = data.methods;
  let rig = null, frs = [], cur = null, row = -1;
  onVisible(rigEl, async v => {
    if (v && !rig) { rig = await makeRig(rigEl); if (rig) { rig.onPick = i => setRow(i); build(); } }
  }, { threshold: 0.01, rootMargin: '300px' });
  function build() {
    if (!rig || !cur) return;
    rig.clear(); frs = [];
    const P = S + `paths/${cur.id}/`;
    rig.path(cur.path, 0xf97316, 0.5);
    cur.inputs.forEach((c, i) => rig.frustum(c, { fovx: cur.fov_in[0], fovy: cur.fov_in[1], size: 0.12, color: 0x3b82f6, tex: P + `in${i}.jpg`, opacity: 0.92 }));
    cur.targets.forEach((t, i) => frs.push(rig.frustum(t.c2w, { fovx: t.fov[0], fovy: t.fov[1], size: 0.15, color: 0xf97316, tex: P + `ours${i}.jpg`, opacity: 0.95, idx: i })));
    rig.margin = 0.12; rig.home_(cur.inputs.map(c => [c[3], c[7], c[11]]).concat(cur.path), { dist: 2.6, elev: 0.28, az: cur.az || 0 });
    highlight();
  }
  function highlight() {
    if (rig) frs.forEach((f, i) => rig.setColor(f, i === row ? 0xffffff : 0xf97316));
    $$('.vl', grid).forEach((x, i) => x.classList.toggle('on', i === row));
    $$('.cell', grid).forEach(x => x.classList.toggle('row-on', +x.dataset.r === row));
    grid.classList.toggle('hov', row >= 0);
  }
  function setRow(i) { row = i; highlight(); }
  function load(sc) {
    cur = sc; row = -1;
    const P = S + `paths/${sc.id}/`;
    $$('.scene-chip', chips).forEach(c => c.classList.toggle('on', c.dataset.id === sc.id));
    const ins = $('#pathInputs'); ins.innerHTML = '';
    for (let i = 0; i < sc.n_in; i++) ins.append(h('img', { src: P + `in${i}.jpg`, alt: `input ${i + 1}`, loading: 'lazy' }));
    $('#pathInLab').textContent = `${sc.n_in} input photos`;
    $('#pathNote').innerHTML = sc.note;
    grid.innerHTML = '';
    grid.append(h('div', { class: 'mh-pad' }));
    METHODS.forEach(m => grid.append(h('div', { class: 'mh' + (m.id === 'ours' ? ' ours' : '') }, m.name, h('small', {}, m.sub))));
    sc.targets.forEach((t, i) => {
      grid.append(h('div', { class: 'vl', onmouseenter: () => setRow(i), onmouseleave: () => setRow(-1) }, h('b', {}, String(i + 1)), t.label));
      METHODS.forEach(m => {
        const img = h('img', { src: P + `${m.id}${i}.jpg`, alt: `${m.name}, view ${i + 1} (${t.label})`, loading: 'lazy' });
        grid.append(h('div', { class: 'cell' + (m.id === 'ours' ? ' ours' : ''), 'data-r': i,
          onmouseenter: () => setRow(i), onmouseleave: () => setRow(-1),
          onclick: () => { const lb = $('#lightbox'); $('img', lb).src = img.src; lb.classList.add('show'); } }, img));
      });
    });
    build();
  }
  data.scenes.forEach(sc => chips.append(h('button', { class: 'scene-chip', 'data-id': sc.id, onclick: () => load(sc) },
    h('img', { src: S + `paths/${sc.id}/in0.jpg`, alt: '', loading: 'lazy' }), sc.label)));
  load(data.scenes[0]);
}

/* ------------------------------------------------------------------ 04 results switch */
function initResTabs() {
  const cap = {
    sparse: 'DL3DV benchmark and unseen DL3DV-2K scenes. Move across the image to compare with the held-out ground truth; click a thumbnail or an orange camera to switch views.',
    paths: 'Cameras sampled densely along a path, each frame generated on its own with no temporal model, still play back as a consistent video. Blue marks are the 6 inputs.',
    wild: 'Casual captures with COLMAP poses, including motion blur, over-exposure and aerial views.',
  };
  const set = m => {
    $$('#resPanel .res-pane').forEach(p => (p.hidden = p.dataset.p !== m));
    $('#resCap').textContent = cap[m];
  };
  segment($('#resTabs'), d => set(d.m));
  set('sparse');
}

/* ------------------------------------------------------------------ 04 gallery */
async function initGallery() {
  const data = await getJSON(S + 'data/gallery.json');
  const chips = $('#galChips'), w = wipe($('#galWipe'));
  const rigEl = $('#galRig');
  let rig = null, frs = [], cur = null, t = 0;
  onVisible(rigEl, async v => {
    if (v && !rig) { rig = await makeRig(rigEl); if (rig) { rig.onPick = i => setTarget(i); build(); } }
  }, { threshold: 0.01, rootMargin: '300px' });
  function build() {
    if (!rig || !cur) return;
    rig.clear(); frs = [];
    const G = S + `gallery/${cur.id}/`;
    cur.c2w.forEach((c, i) => {
      const inp = i < 6;
      frs.push(rig.frustum(c, { fovx: cur.fovx, fovy: cur.fovy, size: 0.17, color: inp ? 0x3b82f6 : 0xf97316, tex: inp ? G + `in${i}.jpg` : G + `gen${i - 6}.jpg`, opacity: inp ? 0.92 : 0.5, idx: inp ? null : i - 6 }));
    });
    rig.margin = 0.2; rig.home_(cur.c2w.map(c => [c[3], c[7], c[11]]), { dist: 2.35, elev: 0.55 });
    highlight();
  }
  function highlight() {
    if (!rig) return;
    frs.forEach((f, i) => {
      if (i < 6) return;
      const on = i - 6 === t;
      rig.setColor(f, on ? 0xffffff : 0xf97316, on ? 1.0 : 0.38);
    });
  }
  function setTarget(i) {
    t = i; const G = S + `gallery/${cur.id}/`;
    $('#galGT').src = G + `gt${i}.jpg`; $('#galGen').src = G + `gen${i}.jpg`;
    $$('#galTargets img').forEach((im, j) => im.classList.toggle('on', j === i));
    $('#galMeta').textContent = `scene ${cur.scene} · frame ${cur.targets[i]}`;
    $('#galSet').textContent = cur.set === '2k' ? 'DL3DV-2K (unseen)' : 'DL3DV benchmark';
    highlight();
  }
  function load(sc) {
    cur = sc; const G = S + `gallery/${sc.id}/`;
    $$('.scene-chip', chips).forEach(c => c.classList.toggle('on', c.dataset.id === sc.id));
    const tg = $('#galTargets'), ins = $('#galInputs'); tg.innerHTML = ''; ins.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      tg.append(h('img', { src: G + `gen${i}.jpg`, alt: `target ${i + 1}`, loading: 'lazy', onclick: () => setTarget(i) }));
      ins.append(h('img', { src: G + `in${i}.jpg`, alt: `input ${i + 1}`, loading: 'lazy' }));
    }
    setTarget(0); build();
  }
  data.forEach(sc => chips.append(h('button', { class: 'scene-chip', 'data-id': sc.id, onclick: () => load(sc) },
    h('img', { src: S + `gallery/${sc.id}/in0.jpg`, alt: '', loading: 'lazy' }), sc.label)));
  load(data[0]);
}

/* ------------------------------------------------------------------ 04 trajectory theater */
async function initTheater() {
  const data = await getJSON(S + 'data/trajectories.json');
  const chips = $('#trChips'), gen = $('#trGen'), gt = $('#trGT'), wp = $('#trWipe');
  const w = wipe(wp, 50); w.enable(false);
  const rigEl = $('#trRig'), head = $('#trHead'), tl = $('#trTL'), badge = $('#trBadge');
  let rig = null, cur = null, mover = null, inFr = [], compare = false, visible = false, vtex = null;
  onVisible(rigEl, async v => {
    if (v && !rig) { rig = await makeRig(rigEl); if (rig) { rig.onFrame = tick; build(); } }
  }, { threshold: 0.01, rootMargin: '300px' });
  onVisible($('#theater'), v => {
    visible = v;
    if (v) { if (!gen.src) load(data[0]); gen.play().catch(() => {}); if (compare) gt.play().catch(() => {}); }
    else { gen.pause(); gt.pause(); }
  }, { threshold: 0.15 });

  const frameIdx = () => {
    const n = cur.n, L = 2 * n - 2;
    const i = Math.floor(gen.currentTime * 16 + 1e-3) % L;
    return i < n ? i : L - i;
  };
  function tick() {
    if (!cur || !mover) return;
    const idx = frameIdx();
    rig.setMatrix(mover, cur.c2w[idx]);
  }
  function uiTick() {
    requestAnimationFrame(uiTick);
    if (!cur || !visible) return;
    const idx = frameIdx();
    head.style.left = (100 * idx / (cur.n - 1)) + '%';
    const k = cur.keys.indexOf(idx);
    badge.textContent = k >= 0 ? `input view ${k + 1}` : `generated · frame ${idx}`;
    badge.classList.toggle('input', k >= 0);
    $$('#trInputs img').forEach((im, j) => im.classList.toggle('lit', Math.abs(cur.keys[j] - idx) <= 1));
    if (compare && Math.abs(gt.currentTime - gen.currentTime) > 0.07) gt.currentTime = gen.currentTime;
  }
  requestAnimationFrame(uiTick);

  async function build() {
    if (!rig || !cur) return;
    rig.clear(); inFr = [];
    const T = S + `traj/${cur.id}/`;
    cur.keys.forEach((kf, j) => inFr.push(rig.frustum(cur.c2w[kf], { fovx: cur.fovx, fovy: cur.fovy, size: 0.26, color: 0x3b82f6, tex: T + `in${j}.jpg` })));
    rig.path(cur.c2w.map(c => [c[3], c[7], c[11]]), 0xf97316, 0.6);
    mover = rig.frustum(cur.c2w[0], { fovx: cur.fovx, fovy: cur.fovy, size: 0.34, color: 0xf97316, opacity: 1 });
    try {
      const THREE = await import('three');
      if (vtex) vtex.dispose();
      vtex = new THREE.VideoTexture(gen); vtex.colorSpace = THREE.SRGBColorSpace;
      const m = mover.userData.plane.material; m.map = vtex; m.color.setHex(0xffffff); m.opacity = 1; m.needsUpdate = true;
    } catch (e) { /* plain frustum is fine */ }
    rig.margin = 0.3; rig.home_(cur.c2w.map(c => [c[3], c[7], c[11]]), { dist: 2.8, elev: 0.6 });
  }
  function load(sc) {
    cur = sc; const T = S + `traj/${sc.id}/`;
    $$('.scene-chip', chips).forEach(c => c.classList.toggle('on', c.dataset.id === sc.id));
    gen.src = T + 'gen.mp4'; gen.poster = T + 'poster.jpg';
    if (compare) gt.src = T + 'gt.mp4'; else gt.removeAttribute('src');
    if (visible) { gen.play().catch(() => {}); if (compare) gt.play().catch(() => {}); }
    const ins = $('#trInputs'); ins.innerHTML = '';
    for (let j = 0; j < 6; j++) ins.append(h('img', { src: T + `in${j}.jpg`, alt: `input ${j + 1}` }));
    $$('.key', tl).forEach(k => k.remove());
    sc.keys.forEach(kf => tl.append(h('div', { class: 'key', style: `left:${100 * kf / (sc.n - 1)}%` })));
    $('#trMeta').textContent = `${sc.n} frames · ${sc.n - 6} generated`;
    build();
  }
  data.forEach(sc => chips.append(h('button', { class: 'scene-chip', 'data-id': sc.id, onclick: () => load(sc) },
    h('img', { src: S + `traj/${sc.id}/in0.jpg`, alt: '', loading: 'lazy' }), sc.label)));
  segment($('#trSeg'), d => {
    compare = d.m === 'cmp';
    $('#trTop').style.display = compare ? '' : 'none';
    $$('.handle, .lab', wp).forEach(e => (e.style.display = compare ? '' : 'none'));
    badge.style.display = compare ? 'none' : '';
    w.enable(compare);
    if (compare) {
      gt.src = S + `traj/${cur.id}/gt.mp4`;
      gt.currentTime = gen.currentTime; gt.play().catch(() => {}); w.set(50);
    } else { gt.pause(); }
  });
  // pre-mark selected chip without loading video yet
  cur = data[0];
  $$('.scene-chip', chips)[0].classList.add('on');
}

/* ------------------------------------------------------------------ 04 comparisons */
function initCompare() {
  const N = 6, scenes = $('#cmpScenes'), row = $('#cmpRow');
  const LABEL = { gt: 'Ground truth', ours: 'FrameCrafter', seva: 'SEVA', aether: 'Aether', lvsm: 'LVSM' };
  let sc = 1, t = 1, m = 'seva';
  const wp = wipe($('#cmpWipe'), 50);
  function render() {
    const P = S + `compare/s${sc}_t${t}_`;
    $('#cmpBase').src = P + m + '.jpg'; $('#cmpOurs').src = P + 'ours.jpg';
    const bl = $('#cmpBaseLab'); bl.textContent = LABEL[m]; bl.className = 'lab l' + (m === 'gt' ? ' gt' : '');
    const ins = $('#cmpInputs'); ins.innerHTML = '';
    for (let k = 0; k < 6; k++) ins.append(h('img', { src: S + `compare/s${sc}_in${k}.jpg`, alt: `input ${k + 1}` }));
    row.innerHTML = '';
    ['gt', 'ours', 'seva', 'aether', 'lvsm'].forEach(k => row.append(h('figure', {
      class: (k === 'ours' ? 'ours ' : '') + (k === 'gt' ? 'gt ' : '') + (k === m ? 'on' : ''),
      onclick: () => { if (k === 'ours') return; m = k; $$('#cmpM button').forEach(b => b.classList.toggle('on', b.dataset.m === k)); render(); }
    }, h('img', { src: P + k + '.jpg', alt: LABEL[k] }), h('figcaption', {}, LABEL[k]))));
    $$('button', scenes).forEach((b, i) => b.classList.toggle('on', i + 1 === sc));
  }
  for (let i = 1; i <= N; i++) scenes.append(h('button', { onclick: () => { sc = i; render(); } }, h('img', { src: S + `compare/s${i}_t1_gt.jpg`, alt: `scene ${i}` })));
  segment($('#cmpT'), d => { t = +d.t; render(); });
  segment($('#cmpM'), d => { m = d.m; render(); });
  render();
}

/* ------------------------------------------------------------------ 04 quantitative table */
function initTable() {
  const T6 = [
    ['LVSM', '—', '—', [17.09, 0.478, 0.333, 0.204, 15.25, 0.317, 0.609, 0.577], 'reg'],
    ['E-RayZer', '—', '—', [16.85, 0.442, 0.455, 0.254, 16.56, 0.343, 0.621, 0.340], 'reg'],
    ['EscherNet', 'SD1.5', '10K', [12.07, 0.251, 0.484, 0.227, 11.14, 0.126, 0.540, 0.315]],
    ['Aether', 'CogVideoX-5B', '—', [12.66, 0.258, 0.469, 0.140, 12.60, 0.220, 0.651, 0.334]],
    ['SEVA', 'SD2.1', '80K', [16.15, 0.470, 0.253, 0.088, 14.59, 0.294, 0.372, 0.137]],
    ['FrameCrafter', 'CogVideoX-5B', '1K', [13.65, 0.272, 0.389, 0.113, 13.09, 0.209, 0.540, 0.204], 'ours'],
    ['FrameCrafter', 'Wan2.1-14B', '1K', [17.18, 0.445, 0.223, 0.066, 15.64, 0.279, 0.365, 0.111], 'ours'],
  ];
  const T3 = [
    ['EscherNet', 'SD1.5', '10K', [11.43, 0.228, 0.524, 0.266, 10.44, 0.171, 0.627, 0.383]],
    ['Aether', 'CogVideoX-5B', '—', [11.98, 0.245, 0.531, 0.204, 13.11, 0.228, 0.614, 0.239]],
    ['SEVA', 'SD2.1', '80K', [13.52, 0.359, 0.364, 0.167, 12.73, 0.242, 0.443, 0.198]],
    ['FrameCrafter', 'Wan2.1-14B', '1K', [14.73, 0.334, 0.351, 0.129, 14.14, 0.235, 0.491, 0.166], 'ours'],
  ];
  const higher = [1, 1, 0, 0, 1, 1, 0, 0];
  const fmt = (v, j) => (j % 4 === 0 ? v.toFixed(2) : v.toFixed(3));
  function render(rows) {
    const gen = rows.filter(r => r[4] !== 'reg');
    const rank = higher.map((hi, j) => {
      const vals = [...new Set(gen.map(r => r[3][j]))].sort((a, b) => (hi ? b - a : a - b));
      return v => { const i = vals.indexOf(v); return i < 3 ? i + 1 : 0; };
    });
    let html = '<table class="res"><tr><th rowspan="2">Method</th><th rowspan="2">Backbone</th><th rowspan="2">#Scenes</th><th colspan="4" class="grp">DL3DV</th><th colspan="4" class="grp">Mip-NeRF 360</th></tr><tr>';
    for (let k = 0; k < 2; k++) html += '<th class="grp">PSNR ↑</th><th>SSIM ↑</th><th>LPIPS ↓</th><th>DreamSim ↓</th>';
    html += '</tr>';
    let sepDone = false;
    rows.forEach(r => {
      const reg = r[4] === 'reg';
      const cls = (r[4] === 'ours' ? 'ours' : '') + (!reg && !sepDone && rows[0][4] === 'reg' ? ' sep' : '');
      if (!reg) sepDone = true;
      html += `<tr class="${cls}"><td>${r[0]}${reg ? ' <span class="muted small">(regression)</span>' : ''}</td><td>${r[1]}</td><td>${r[2]}</td>`;
      r[3].forEach((v, j) => {
        const rk = reg ? 0 : rank[j](v);
        html += `<td class="${j % 4 === 0 ? 'grp ' : ''}${rk ? 'r' + rk : ''}">${fmt(v, j)}</td>`;
      });
      html += '</tr>';
    });
    $('#qTable').innerHTML = html + '</table>';
    $('#qNote').textContent = rows === T6
      ? 'All predictions resized or center-cropped to 480×480. Regression models (top) score well on PSNR/SSIM by predicting blurry averages, which LPIPS and DreamSim penalize. DS = DreamSim.'
      : '3-view setting, not seen during training (the model is trained with 6 inputs). All predictions resized or center-cropped to 480×480.';
  }
  segment($('#qSeg'), d => render(d.m === '6' ? T6 : T3));
  render(T6);
}

/* ------------------------------------------------------------------ 05 permutation */
async function initPerm() {
  const perms = await getJSON(S + 'data/perms.json');
  const box = $('#permInputs'), P = S + 'perm/';
  const tiles = [];
  for (let j = 0; j < 6; j++) {
    const t = h('div', { class: 'pi' }, h('img', { src: P + `in${j}.jpg`, alt: `view ${j + 1}` }), h('span', { class: 't' }, ''));
    box.append(t); tiles.push(t);
  }
  const ropeI = preload(Array.from({ length: 10 }, (_, i) => P + `rope${i}.jpg`));
  const oursI = preload(Array.from({ length: 10 }, (_, i) => P + `ours${i}.jpg`));
  const ropeD = preload(Array.from({ length: 10 }, (_, i) => P + `diff_rope${i}.jpg`));
  const oursD = preload(Array.from({ length: 10 }, (_, i) => P + `diff_ours${i}.jpg`));
  let p = 0, mode = 'img', timer = null;
  function apply() {
    const perm = perms[p], W = box.clientWidth, gap = 8, w = (W - 5 * gap) / 6;
    tiles.forEach((t, j) => {
      const slot = perm.indexOf(j);
      t.style.transform = `translateX(${(slot - j) * (w + gap)}px)`;
      $('.t', t).textContent = `#${slot + 1}`;
    });
    $('#permRope').src = (mode === 'img' ? ropeI : ropeD)[p].src;
    $('#permOurs').src = (mode === 'img' ? oursI : oursD)[p].src;
    $('#permId').textContent = `order ${p + 1} / 10 · [${perm.map(x => x + 1).join(' ')}]`;
  }
  const next = () => { p = (p + 1) % perms.length; apply(); };
  const setAuto = on => {
    clearInterval(timer); timer = on ? setInterval(next, 1700) : null;
    $('#permAuto').textContent = on ? '❚❚ Auto' : '▶ Auto';
  };
  $('#permBtn').addEventListener('click', () => { setAuto(false); next(); });
  $('#permAuto').addEventListener('click', () => setAuto(!timer));
  segment($('#permSeg'), d => { mode = d.m; apply(); });
  new ResizeObserver(() => apply()).observe(box);
  onVisible(box, v => setAuto(v && !reduced), { threshold: 0.4 });
  apply();
  drawPermBars();
}

/* ------------------------------------------------------------------ charts */
const tip = h('div', { style: 'position:fixed;z-index:60;pointer-events:none;background:#15171b;color:#fff;font-size:12.5px;padding:6px 9px;border-radius:7px;opacity:0;transition:opacity .12s;font-family:Inter;line-height:1.35;max-width:240px' });
document.body.append(tip);
function hover(el, html) {
  el.addEventListener('pointerenter', () => { tip.innerHTML = html; tip.style.opacity = 1; });
  el.addEventListener('pointermove', e => { tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 12) + 'px'; });
  el.addEventListener('pointerleave', () => { tip.style.opacity = 0; });
}

function drawPermBars() {
  const svg = $('#permBars');
  const rows = [['First-view coordinates', '#a3a8b3', 15.67, 0.4730, 0.262, 0.0203], ['w/ temporal RoPE', '#5b7fd6', 15.61, 0.3106, 0.254, 0.0095], ['FrameCrafter', '#e8590c', 16.21, 0.0081, 0.224, 0.0003]];
  const panels = [{ y: 0, title: 'PSNR std across orderings ↓', j: 3, mean: 2, max: 0.5, note: '38× lower than with temporal RoPE' },
                  { y: 150, title: 'LPIPS std across orderings ↓', j: 5, mean: 4, max: 0.022, note: '32× lower than with temporal RoPE' }];
  const L = 168, R = 440, bh = 20, gap = 30;
  panels.forEach(pn => {
    const g = s('g', { transform: `translate(0,${pn.y})` });
    g.append(s('text', { x: 0, y: 16, 'font-size': 15, 'font-weight': 600, fill: '#15171b' }, pn.title));
    const top = 32;
    g.append(s('line', { x1: L, y1: top - 6, x2: L, y2: top + 3 * gap - 6, stroke: '#d9d5cc', 'stroke-width': 1 }));
    rows.forEach((r, i) => {
      const y = top + i * gap, v = r[pn.j], wd = Math.max(2.5, (R - L) * v / pn.max);
      g.append(s('text', { x: L - 10, y: y + bh / 2 + 5, 'text-anchor': 'end', 'font-size': 14, fill: '#3a3f48' }, r[0]));
      const bar = wd > 8 ? s('path', { d: `M${L} ${y} h${wd - 4} q4 0 4 4 v${bh - 8} q0 4 -4 4 h${-(wd - 4)}z`, fill: r[1] }) : s('rect', { x: L, y, width: wd, height: bh, fill: r[1] });
      g.append(bar);
      g.append(s('text', { x: L + wd + 8, y: y + bh / 2 + 5, 'font-size': 14, fill: '#15171b', 'font-family': 'JetBrains Mono' }, v.toFixed(4)));
      const hit = s('rect', { x: 0, y: y - 5, width: 520, height: bh + 10, fill: 'transparent' });
      hover(hit, `<b>${r[0]}</b><br>std across 10 orderings: ${v.toFixed(4)}<br>mean ${pn.mean === 2 ? 'PSNR' : 'LPIPS'}: ${r[pn.mean]}`);
      g.append(hit);
    });
    g.append(s('text', { x: L, y: top + 3 * gap + 12, 'font-size': 13, fill: '#6b7079' }, pn.note));
    svg.append(g);
  });
}

function drawDataChart() {
  const svg = $('#dataChart');
  const W = 520, H = 330, L = 52, R = 470, T = 24, B = 280;
  const lx = v => L + (Math.log10(v) - 1) / (Math.log10(20000) - 1) * (R - L);
  const ly = v => B - (v - 11.5) / (16.5 - 11.5) * (B - T);
  for (let y = 12; y <= 16; y++) {
    svg.append(s('line', { x1: L, x2: R, y1: ly(y), y2: ly(y), stroke: '#ece9e2', 'stroke-width': 1 }));
    svg.append(s('text', { x: L - 8, y: ly(y) + 4, 'text-anchor': 'end', 'font-size': 11.5, fill: '#6b7079' }, y));
  }
  [10, 100, 1000, 10000].forEach(v => {
    svg.append(s('line', { x1: lx(v), x2: lx(v), y1: B, y2: B + 5, stroke: '#b9b5ad' }));
    svg.append(s('text', { x: lx(v), y: B + 19, 'text-anchor': 'middle', 'font-size': 11.5, fill: '#6b7079' }, v >= 1000 ? (v / 1000) + 'K' : v));
  });
  svg.append(s('line', { x1: L, x2: R, y1: B, y2: B, stroke: '#b9b5ad' }));
  svg.append(s('text', { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 12.5, fill: '#3a3f48' }, 'number of multi-view training scenes (log scale)'));
  svg.append(s('text', { x: 14, y: (T + B) / 2, 'text-anchor': 'middle', 'font-size': 12.5, fill: '#3a3f48', transform: `rotate(-90 14 ${(T + B) / 2})` }, 'PSNR (dB) ↑'));
  const pts = [[20, 14.57], [50, 14.86], [1000, 15.30], [2000, 15.94]], esc = 12.07;
  // shaded advantage over EscherNet
  const area = `M${lx(20)} ${ly(esc)} ` + pts.map(([x, y]) => `L${lx(x)} ${ly(y)}`).join(' ') + ` L${lx(2000)} ${ly(esc)} Z`;
  svg.append(s('path', { d: area, fill: '#e8590c', opacity: 0.1 }));
  svg.append(s('line', { x1: L, x2: R, y1: ly(esc), y2: ly(esc), stroke: '#9aa0ab', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
  svg.append(s('path', { d: 'M' + pts.map(([x, y]) => `${lx(x)} ${ly(y)}`).join(' L'), fill: 'none', stroke: '#e8590c', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  pts.forEach(([x, y]) => {
    const c = s('circle', { cx: lx(x), cy: ly(y), r: 5, fill: '#e8590c', stroke: '#fff', 'stroke-width': 2 });
    svg.append(c);
    svg.append(s('text', { x: lx(x), y: ly(y) - 12, 'text-anchor': x === 2000 ? 'end' : 'middle', 'font-size': 11.5, fill: '#15171b', 'font-family': 'JetBrains Mono' }, `${y.toFixed(2)}`));
    const hit = s('circle', { cx: lx(x), cy: ly(y), r: 14, fill: 'transparent' });
    hover(hit, `<b>FrameCrafter</b><br>${x.toLocaleString()} training scenes<br>PSNR ${y.toFixed(2)} dB`);
    svg.append(hit);
  });
  // EscherNet marker (star)
  const sx = lx(10000), sy = ly(esc);
  const star = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 4 : 9, a = -Math.PI / 2 + i * Math.PI / 5; return `${sx + r * Math.cos(a)},${sy + r * Math.sin(a)}`; }).join(' ');
  svg.append(s('polygon', { points: star, fill: '#6b7079', stroke: '#fff', 'stroke-width': 1.5 }));
  const hs = s('circle', { cx: sx, cy: sy, r: 14, fill: 'transparent' });
  hover(hs, '<b>EscherNet</b> (image diffusion)<br>10,000 training scenes<br>PSNR 12.07 dB');
  svg.append(hs);
  svg.append(s('text', { x: sx + 8, y: sy - 12, 'text-anchor': 'end', 'font-size': 12, fill: '#3a3f48' }, 'EscherNet · 10K scenes'));
  // 500x annotation
  svg.append(s('line', { x1: lx(20), x2: lx(20), y1: ly(esc) - 4, y2: ly(14.57) + 8, stroke: '#3a3f48', 'stroke-width': 1, 'marker-end': 'url(#dcArrow)' }));
  svg.append(s('defs', {}, s('marker', { id: 'dcArrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, s('path', { d: 'M0 0L10 5L0 10z', fill: '#3a3f48' }))));
  svg.append(s('text', { x: lx(20) + 10, y: ly(13.3), 'font-size': 12.5, fill: '#15171b', 'font-weight': 600 }, '20 scenes already beat'));
  svg.append(s('text', { x: lx(20) + 10, y: ly(13.3) + 16, 'font-size': 12.5, fill: '#15171b', 'font-weight': 600 }, 'EscherNet at 500× less data'));
  svg.append(s('text', { x: L + 6, y: T + 4, 'font-size': 12, fill: '#6b7079' }, 'PSNR on DL3DV vs. training-set size'));
}

/* ------------------------------------------------------------------ hero reel */
function initReel() {
  // keep the reel tiles roughly in sync so the wall breathes together
  const vids = $$('.reel video');
  onVisible($('.reel'), v => vids.forEach(x => { if (v) { if (!x.src) x.src = x.dataset.src; x.play().catch(() => {}); } else x.pause(); }), { threshold: 0.05 });
}

/* ------------------------------------------------------------------ boot */
const safe = (name, fn) => { try { const r = fn(); if (r && r.catch) r.catch(e => console.error(name, e)); } catch (e) { console.error(name, e); } };
safe('chrome', initChrome);
safe('reel', initReel);
safe('story', initStory);
safe('vae', initVAE);
safe('cams', initCams);
safe('rope', initRoPE);
safe('denoise', initDenoise);
safe('restabs', initResTabs);
safe('gallery', initGallery);
safe('theater', initTheater);
safe('compare', initCompare);
safe('table', initTable);
safe('paths', initPaths);
safe('perm', initPerm);
safe('chart', drawDataChart);
