/* Home Central shared script: sign-in, API (Google Sheet through Apps Script, or demo data in this browser),
   helpers, lightbox, uploads, modal and the mark-up tool. ASCII only. */
window.HC = (function () {
  const C = window.HC_CONFIG || {};
  const PASS_HASH = 'f4e17aa8bb9331c734643455a8fc0c9b03211c0fa340e47c56b86377cc531380'; // sha-256 of the shared password
  const USERS = ['dave', 'nate', 'cissy'];
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const when = iso => { const d = new Date(iso); if (isNaN(d)) return ''; return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  const day = ymd => { const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return String(ymd || ''); const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const money = n => (n === '' || n == null || isNaN(+n)) ? '' : (+n).toLocaleString(undefined, { style: 'currency', currency: C.CURRENCY || 'USD', maximumFractionDigits: 0 });
  const STATUS = {
    idea: { label: 'Idea', hint: 'Something we might do' },
    pending: { label: 'Pending', hint: 'Concept or draft, not scheduled yet' },
    upcoming: { label: 'Upcoming', hint: 'Decided and on the calendar' },
    active: { label: 'In progress', hint: 'Work has started' },
    done: { label: 'Done', hint: 'Finished' },
    nixed: { label: 'Nixed', hint: 'Not doing it' }
  };
  const FILE_KINDS = ['Contract', 'Quote', 'Invoice', 'Schedule', 'Plan', 'Permit', 'Receipt', 'Other'];

  // ---------- sign-in ----------
  const SKEY = 'hc-session';
  function session() { try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); return s && s.user && s.key ? s : null; } catch (e) { return null; } }
  function setSession(s) { try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) { } }
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function toLogin() { location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search)); }
  function requireLogin() { const s = session(); if (!s) { toLogin(); return null; } return s; }
  function signOut() { setSession(null); toLogin(); }
  const user = () => { const s = session(); return s ? cap(s.user) : ''; };

  // ---------- transport ----------
  async function remote(body, params) {
    const s = session() || {};
    let url = C.API;
    const auth = { user: s.user || '', key: s.key || '' };
    const opt = body ? { method: 'POST', body: JSON.stringify(Object.assign({}, body, auth)), headers: { 'Content-Type': 'text/plain;charset=utf-8' } } : { method: 'GET' };
    if (!body) url += (url.includes('?') ? '&' : '?') + new URLSearchParams(Object.assign({}, params || {}, auth)).toString();
    opt.redirect = 'follow';
    const r = await fetch(url, opt);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d.ok) { if (d.error === 'not signed in') { setSession(null); toLogin(); } throw new Error(d.error || 'request failed'); }
    return d;
  }

  // ---------- demo store: the same actions, kept in this browser ----------
  function demoApi() {
    const KEY = 'hc-demo';
    const uuid = () => 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const now = () => new Date().toISOString();
    const dataUrl = f => 'data:' + f.type + ';base64,' + f.data;
    function seed() {
      const t = now(), pid = uuid(), kid = uuid(), gid = uuid(), hid = uuid();
      const d = new Date(); const plus = n => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
      return {
        Projects: [
          { id: pid, name: 'Patio and side yard', status: 'pending', summary: 'Crushed granite patio, flagstone steppers down the side path, river rock under the AC, mulch beds, French drain from the pool equipment to the shed corner.', budget: 6500, start: '', target: '', cover: '', page: 'https://dwimpush-hub.github.io/sites/patio/', tags: 'landscape, drainage', created: t, updated: t },
          { id: kid, name: 'Kitchen faucet and disposal', status: 'upcoming', summary: 'Swap the leaking faucet for a pull-down, replace the disposal while the cabinet is open.', budget: 450, start: plus(9), target: plus(10), cover: '', page: '', tags: 'plumbing', created: t, updated: t },
          { id: gid, name: 'Garage storage wall', status: 'idea', summary: 'Slat wall or French cleats on the long wall, bikes up, bins off the floor.', budget: '', start: '', target: '', cover: '', page: '', tags: 'garage', created: t, updated: t },
          { id: hid, name: 'Hot tub on the deck', status: 'nixed', summary: 'Deck would need reinforcing and a 50 A circuit. Not worth it this year.', budget: 9000, start: '', target: '', cover: '', page: '', tags: '', created: t, updated: t }
        ],
        Ideas: [{ id: uuid(), project: pid, title: '', author: 'Dave', text: 'Keep the oleander pot where it is; granite runs around it.', photo: '', created: t, updated: t }],
        Photos: [],
        Files: [],
        Tasks: [
          { id: uuid(), project: pid, text: 'Tape the patio, path and the three beds', done: false, due: plus(5), assignee: 'Dave', author: 'Dave', created: t, completed: '' },
          { id: uuid(), project: pid, text: 'Get two quotes for the French drain', done: false, due: plus(14), assignee: '', author: 'Dave', created: t, completed: '' },
          { id: uuid(), project: pid, text: 'Photograph all nine stations', done: true, due: '', assignee: 'Dave', author: 'Dave', created: t, completed: t },
          { id: uuid(), project: kid, text: 'Order the faucet', done: false, due: plus(2), assignee: 'Nate', author: 'Nate', created: t, completed: '' },
          { id: uuid(), project: kid, text: 'Turn off the water and empty the cabinet', done: false, due: plus(9), assignee: '', author: 'Nate', created: t, completed: '' }
        ]
      };
    }
    function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.Projects) return s; } catch (e) { } const s = seed(); save(s); return s; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { throw new Error('demo storage in this browser is full; connect the sheet to keep more'); } }
    function counts(s, pid) {
      const c = { tasks: 0, tasksDone: 0, photos: 0, ideas: 0, files: 0, nextDue: '' };
      s.Tasks.filter(t => t.project === pid).forEach(t => { c.tasks++; if (t.done) c.tasksDone++; else if (t.due && (!c.nextDue || t.due < c.nextDue)) c.nextDue = t.due; });
      c.photos = s.Photos.filter(x => x.project === pid && x.kind === 'photo').length; c.ideas = s.Ideas.filter(x => x.project === pid).length; c.files = s.Files.filter(x => x.project === pid).length;
      return c;
    }
    const find = (s, tab, id) => s[tab].find(x => x.id === id);
    const need = (s, tab, id) => { const x = find(s, tab, id); if (!x) throw new Error(tab.replace(/s$/, '').toLowerCase() + ' not found'); return x; };
    const drop = (s, tab, id) => { s[tab] = s[tab].filter(x => x.id !== id); };
    async function get(q) {
      const s = load();
      if (q.action === 'project') { const p = need(s, 'Projects', q.id); const mine = r => r.filter(x => x.project === p.id); return { ok: true, project: Object.assign({}, p, { counts: counts(s, p.id) }), ideas: mine(s.Ideas), photos: mine(s.Photos), files: mine(s.Files), tasks: mine(s.Tasks) }; }
      return { ok: true, projects: s.Projects.map(p => Object.assign({}, p, { counts: counts(s, p.id) })) };
    }
    async function post(b) {
      const s = load(), who = user(), t = now(), a = b.action;
      const str = (v, m) => String(v == null ? '' : v).trim().slice(0, m || 500);
      const num = v => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? '' : n; };
      const ymd = v => { const m = String(v || '').match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; };
      const st = (v, f) => STATUS[v] ? v : (f || 'idea');
      let r;
      if (a === 'project.add') { const name = str(b.name, 120); if (!name) throw new Error('a project needs a name'); const p = { id: uuid(), name, status: st(b.status), summary: str(b.summary, 2000), budget: num(b.budget), start: ymd(b.start), target: ymd(b.target), cover: '', page: str(b.page), tags: str(b.tags, 200), created: t, updated: t }; s.Projects.push(p); r = { project: Object.assign({}, p, { counts: counts(s, p.id) }) }; }
      else if (a === 'project.edit') { const p = need(s, 'Projects', b.id); if (b.name !== undefined) { const n = str(b.name, 120); if (!n) throw new Error('a project needs a name'); p.name = n; } if (b.status !== undefined) p.status = st(b.status, p.status); if (b.summary !== undefined) p.summary = str(b.summary, 2000); if (b.budget !== undefined) p.budget = num(b.budget); if (b.start !== undefined) p.start = ymd(b.start); if (b.target !== undefined) p.target = ymd(b.target); if (b.page !== undefined) p.page = str(b.page); if (b.tags !== undefined) p.tags = str(b.tags, 200); if (b.cover !== undefined) p.cover = b.cover; ['materials', 'details', 'sequence'].forEach(k => { if (b[k] !== undefined) p[k] = str(b[k], 4000); }); p.updated = t; r = { project: Object.assign({}, p, { counts: counts(s, p.id) }) }; }
      else if (a === 'project.delete') { need(s, 'Projects', b.id); ['Ideas', 'Photos', 'Files', 'Tasks'].forEach(k => { s[k] = s[k].filter(x => x.project !== b.id); }); drop(s, 'Projects', b.id); r = { deleted: b.id }; }
      else if (a === 'task.add') { const p = need(s, 'Projects', b.project); const text = str(b.text); if (!text) throw new Error('empty task'); const x = { id: uuid(), project: p.id, text, done: false, due: ymd(b.due), assignee: str(b.assignee, 80), author: who, created: t, completed: '' }; s.Tasks.push(x); r = { task: x }; }
      else if (a === 'task.edit' || a === 'task.toggle') { const x = need(s, 'Tasks', b.id); if (a === 'task.toggle') b.done = !x.done; if (b.text !== undefined) { const tx = str(b.text); if (!tx) throw new Error('empty task'); x.text = tx; } if (b.due !== undefined) x.due = ymd(b.due); if (b.assignee !== undefined) x.assignee = str(b.assignee, 80); if (b.done !== undefined) { x.done = !!b.done; x.completed = b.done ? t : ''; } r = { task: x }; }
      else if (a === 'task.delete') { need(s, 'Tasks', b.id); drop(s, 'Tasks', b.id); r = { deleted: b.id }; }
      else if (a === 'photo.add') { const p = need(s, 'Projects', b.project); if (!b.photo || !b.photo.data) throw new Error('no file data'); const x = { id: uuid(), project: p.id, name: b.photo.name || 'photo.jpg', url: dataUrl(b.photo), caption: str(b.caption, 2000), kind: str(b.kind, 40) || 'photo', parent: str(b.parent, 80), author: who, created: t, order: num(b.order) }; if (x.kind === 'render' && x.parent) s.Photos = s.Photos.filter(y => !(y.parent === x.parent && y.kind === 'render')); s.Photos.push(x); if (!p.cover && x.kind === 'photo') p.cover = x.url; r = { photo: x, cover: p.cover }; }
      else if (a === 'photo.edit') { const x = need(s, 'Photos', b.id); if (b.caption !== undefined) x.caption = str(b.caption, 2000); if (b.order !== undefined) x.order = num(b.order); r = { photo: x }; }
      else if (a === 'photo.cover') { const x = need(s, 'Photos', b.id); need(s, 'Projects', x.project).cover = x.url; r = { cover: x.url }; }
      else if (a === 'photo.delete') { const x = need(s, 'Photos', b.id); drop(s, 'Photos', b.id); s.Photos = s.Photos.filter(y => y.parent !== b.id); const p = find(s, 'Projects', x.project); let cover = p ? p.cover : ''; if (p && p.cover === x.url) { const rest = s.Photos.filter(y => y.project === p.id && y.kind === 'photo'); cover = p.cover = rest.length ? rest[0].url : ''; } r = { deleted: b.id, cover }; }
      else if (a === 'file.add') { const p = need(s, 'Projects', b.project); if (!b.file || !b.file.data) throw new Error('no file data'); const x = { id: uuid(), project: p.id, name: b.file.name || 'file', url: dataUrl(b.file), kind: str(b.kind, 40) || 'Other', note: str(b.note, 1000), amount: num(b.amount), author: who, created: t }; s.Files.push(x); r = { file: x }; }
      else if (a === 'file.edit') { const x = need(s, 'Files', b.id); if (b.kind !== undefined) x.kind = str(b.kind, 40) || 'Other'; if (b.note !== undefined) x.note = str(b.note, 1000); if (b.amount !== undefined) x.amount = num(b.amount); if (b.name !== undefined && str(b.name, 120)) x.name = str(b.name, 120); r = { file: x }; }
      else if (a === 'file.delete') { need(s, 'Files', b.id); drop(s, 'Files', b.id); r = { deleted: b.id }; }
      else if (a === 'idea.add') { const p = need(s, 'Projects', b.project); const text = str(b.text, 2000); if (!text && !(b.photo && b.photo.data)) throw new Error('empty'); const x = { id: uuid(), project: p.id, title: str(b.title, 120), author: who, text, photo: b.photo && b.photo.data ? dataUrl(b.photo) : '', created: t, updated: t, station: str(b.station, 80) }; s.Ideas.push(x); r = { idea: x }; }
      else if (a === 'idea.edit') { const x = need(s, 'Ideas', b.id); const text = b.text === undefined ? x.text : str(b.text, 2000); let photo = x.photo; if (b.photo && b.photo.data) photo = dataUrl(b.photo); else if (b.removePhoto) photo = ''; if (!text && !photo) { drop(s, 'Ideas', b.id); r = { deleted: b.id }; } else { if (text !== x.text || photo !== x.photo) { x.text = text; x.photo = photo; x.author = who; } if (b.station !== undefined) x.station = str(b.station, 80); x.updated = t; r = { idea: x }; } }
      else if (a === 'idea.delete') { need(s, 'Ideas', b.id); drop(s, 'Ideas', b.id); r = { deleted: b.id }; }
      else throw new Error('unknown action ' + a);
      save(s);
      return Object.assign({ ok: true }, r);
    }
    return { get, post, demo: true, reset: () => { try { localStorage.removeItem(KEY); } catch (e) { } } };
  }
  const api = C.API ? { get: p => remote(null, p), post: b => remote(b), demo: false } : demoApi();

  // ---------- images ----------
  const driveId = u => { const m = String(u || '').match(/\/d\/([\w-]+)/); return m ? m[1] : ''; };
  const isData = u => /^(data|blob):/.test(String(u || ''));
  const thumb = (u, w) => isData(u) ? u : 'https://drive.google.com/thumbnail?id=' + driveId(u) + '&sz=w' + w;
  const alt = (u, w) => isData(u) ? u : 'https://lh3.googleusercontent.com/d/' + driveId(u) + '=w' + w;
  const img = (u, w, altText, cls) => '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + esc(thumb(u, w)) + '" alt="' + esc(altText || '') + '" loading="lazy" referrerpolicy="no-referrer"' +
    (isData(u) ? '' : ' onerror="this.onerror=null;this.src=\'' + esc(alt(u, w)) + '\'"') + '>';
  function shrink(file, max) {
    max = max || (api.demo ? 900 : 1600);
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const d = c.toDataURL('image/jpeg', 0.86);
        res({ name: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', data: d.slice(d.indexOf(',') + 1), preview: d });
      };
      im.onerror = () => { // the browser cannot decode it (HEIC on desktop): send the file as it is
        URL.revokeObjectURL(url);
        if (file.size > 9 * 1024 * 1024) return rej(new Error(file.name + ' is too large; use a JPEG or PNG under 9 MB'));
        const fr = new FileReader(); fr.onload = () => res({ name: file.name, type: file.type || 'image/jpeg', data: String(fr.result).split(',')[1], preview: '' }); fr.onerror = () => rej(new Error('could not read ' + file.name)); fr.readAsDataURL(file);
      };
      im.src = url;
    });
  }
  function readAny(file, maxMB) {
    maxMB = maxMB || (api.demo ? 2 : 15);
    return new Promise((res, rej) => {
      if (file.size > maxMB * 1024 * 1024) return rej(new Error(file.name + ' is over ' + maxMB + ' MB' + (api.demo ? ' (demo mode keeps files in the browser)' : '')));
      const fr = new FileReader(); fr.onload = () => res({ name: file.name, type: file.type || 'application/octet-stream', data: String(fr.result).split(',')[1], size: file.size }); fr.onerror = () => rej(new Error('could not read ' + file.name)); fr.readAsDataURL(file);
    });
  }
  // a small picker (button + preview) used by the ideas form; returns {get, clear}
  function wirePicker(root, onError) {
    const inp = root.querySelector('input[type=file]'), pv = root.querySelector('.pv'), im = pv.querySelector('img'), nm = pv.querySelector('.pv-name');
    let pending = null;
    const show = () => { pv.classList.toggle('on', !!pending); if (pending) { im.src = pending.preview || ''; im.style.display = pending.preview ? '' : 'none'; nm.textContent = pending.name; } };
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      nm.textContent = 'Reading photo...'; pv.classList.add('on');
      try { pending = await shrink(f); } catch (e) { pending = null; if (onError) onError(e.message); }
      inp.value = ''; show();
    });
    root.querySelector('[data-clear]').addEventListener('click', () => { pending = null; show(); });
    root.querySelector('label').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    return { get: () => pending, clear: () => { pending = null; show(); } };
  }
  const pickerHtml = label => '<div class="photo-pick"><label class="btn ghost sm" tabindex="0">' + esc(label || 'Add a photo') + '<input type="file" accept="image/*" aria-label="Attach a photo"></label><span class="pv"><img alt=""><span class="pv-name"></span><button type="button" class="lnk" data-clear>remove</button></span></div>';

  // ---------- lightbox ----------
  let lb = null;
  function lightbox(url, caption, link) {
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'Photo');
      lb.innerHTML = '<button type="button" class="lb-close" aria-label="Close">&times;</button><img alt="Full size" referrerpolicy="no-referrer"><div class="lb-bar"><span class="lb-cap"></span><a target="_blank" rel="noopener">Open in Drive</a></div>';
      document.body.appendChild(lb);
      const close = () => { lb.classList.remove('on'); lb.querySelector('img').src = ''; };
      lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('lb-close')) close(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && lb.classList.contains('on')) close(); });
    }
    const im = lb.querySelector('img'); im.onerror = null; im.src = thumb(url, 2000);
    if (!isData(url)) im.onerror = () => { im.onerror = null; im.src = alt(url, 2000); };
    lb.querySelector('.lb-cap').textContent = caption || '';
    const a = lb.querySelector('.lb-bar a'); a.style.display = link && !isData(url) ? '' : 'none'; a.href = link || '#';
    lb.classList.add('on');
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-lb]'); if (!a) return;
    e.preventDefault(); lightbox(a.getAttribute('href'), a.dataset.cap || '', a.getAttribute('href'));
  });

  // ---------- modal ----------
  function modal(o) {
    const el = document.createElement('div'); el.className = 'modal on'; el.setAttribute('role', 'dialog');
    el.innerHTML = '<form><h3><span>' + esc(o.title) + '</span><button type="button" class="lnk" data-close>Close</button></h3>' + o.body +
      '<div class="foot">' + (o.left || '') + '<span class="status muted" aria-live="polite" style="flex-basis:auto;margin-right:auto"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" class="btn">' + esc(o.submit || 'Save') + '</button></div></form>';
    document.body.appendChild(el); document.body.style.overflow = 'hidden';
    const form = el.querySelector('form'), st = el.querySelector('.status');
    const close = () => { el.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
    form.addEventListener('submit', async e => {
      e.preventDefault(); st.textContent = o.working || 'Saving...'; st.classList.remove('err');
      form.querySelectorAll('button').forEach(b => b.disabled = true);
      try { await o.onSubmit(form, st); close(); }
      catch (err) { st.textContent = err.message; st.classList.add('err'); form.querySelectorAll('button').forEach(b => b.disabled = false); }
    });
    if (o.onOpen) o.onOpen(form, close, st);
    const first = form.querySelector('input:not([type=hidden]),textarea,select'); if (first) first.focus();
    return { el, form, close, status: st };
  }
  const confirmDel = msg => window.confirm(msg);

  // ---------- mark-up tool: draw on a photo, one colour per call-out, say what each colour means ----------
  const PAL = [{ c: '#E53935', n: 'Red' }, { c: '#FB8C00', n: 'Orange' }, { c: '#FDD835', n: 'Yellow' }, { c: '#43A047', n: 'Green' }, { c: '#1E88E5', n: 'Blue' }, { c: '#8E24AA', n: 'Purple' }, { c: '#F06292', n: 'Pink' }, { c: '#FFFFFF', n: 'White' }, { c: '#111111', n: 'Black' }];
  const SIZES = [{ k: 'thin', px: 4, dot: 6 }, { k: 'medium', px: 9, dot: 11 }, { k: 'thick', px: 18, dot: 18 }];
  let mk = null, cur = null, drawing = null, baseImgs = [];
  const colName = c => (PAL.find(p => p.c === c) || { n: c }).n;
  function loadImg(src, cors) { return new Promise((res, rej) => { const im = new Image(); if (cors) { im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; } im.onload = () => res(im); im.onerror = () => rej(new Error('image did not load')); im.src = src; }); }
  async function loadDrawable(url) {
    if (isData(url)) return loadImg(url);
    try { return await loadImg(alt(url, 1600), true); }
    catch (e) { const d = await api.get({ action: 'image', id: driveId(url) }); return loadImg('data:' + d.type + ';base64,' + d.data); }
  }
  function buildMarkup() {
    mk = document.createElement('div'); mk.id = 'markup'; mk.setAttribute('role', 'dialog'); mk.setAttribute('aria-label', 'Mark up this photo');
    mk.innerHTML = '<div class="mk-box"><div class="mk-head"><h4 id="mk-title"></h4><button type="button" class="lnk" data-close>Close</button></div>' +
      '<p class="mk-guide">Pick a colour and draw round one thing. Pick a new colour for the next one, then say what each colour means below. The drawing is saved as a mark-up next to the original photo.</p>' +
      '<div class="mk-tools"><div class="mk-pal" role="radiogroup" aria-label="Colour">' + PAL.map(p => '<button type="button" class="mk-sw" data-c="' + p.c + '" style="background:' + p.c + '" title="' + p.n + '" aria-label="' + p.n + '"></button>').join('') + '</div>' +
      '<div class="mk-sizes" aria-label="Brush size">' + SIZES.map(z => '<button type="button" data-size="' + z.k + '" title="' + z.k + '" aria-label="' + z.k + ' brush"><i style="width:' + z.dot + 'px;height:' + z.dot + 'px"></i></button>').join('') + '</div>' +
      '<div class="mk-base"></div><span class="sp"></span><button type="button" class="lnk" data-undo>Undo</button><button type="button" class="lnk" data-clear>Clear</button></div>' +
      '<div class="mk-stage"><canvas aria-label="Drawing surface"></canvas></div>' +
      '<div class="mk-notes"><span class="eyebrow">What each colour calls out</span><div class="mk-rows"><div class="mk-empty">Nothing drawn yet.</div></div></div>' +
      '<textarea rows="2" placeholder="Anything else about this photo? (optional)" aria-label="General note"></textarea>' +
      '<div class="row"><button type="button" class="btn gold" data-post>Save mark-up</button><span class="status muted" aria-live="polite" style="flex-basis:auto"></span></div></div>';
    document.body.appendChild(mk);
    const cv = mk.querySelector('canvas'), cx = cv.getContext('2d'), rows = mk.querySelector('.mk-rows'), st = mk.querySelector('.status');
    const paintStroke = (ctx, s) => { ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.9; ctx.beginPath(); s.p.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); if (s.p.length === 1) ctx.lineTo(s.p[0][0] + 0.1, s.p[0][1]); ctx.stroke(); ctx.globalAlpha = 1; };
    const paintAll = (ctx, W, H) => { ctx.clearRect(0, 0, W, H); const bi = baseImgs[cur.base] || baseImgs[0]; if (bi) ctx.drawImage(bi, 0, 0, W, H); cur.strokes.forEach(s => paintStroke(ctx, s)); };
    const syncBase = () => mk.querySelectorAll('[data-base]').forEach(b => b.classList.toggle('on', +b.dataset.base === cur.base));
    const redraw = () => paintAll(cx, cv.width, cv.height);
    const used = () => { const seen = []; cur.strokes.forEach(s => { if (!seen.includes(s.c)) seen.push(s.c); }); return seen; };
    function sync() {
      mk.querySelectorAll('.mk-pal .mk-sw').forEach(b => { b.classList.toggle('on', b.dataset.c === cur.c); b.classList.toggle('used', used().includes(b.dataset.c)); b.setAttribute('aria-checked', b.dataset.c === cur.c); });
      mk.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('on', b.dataset.size === cur.size));
      const u = used(), key = u.join(',');
      if (rows.dataset.key !== key) {
        rows.dataset.key = key;
        rows.innerHTML = u.length ? u.map(c => '<div class="mk-note"><button type="button" class="mk-sw" data-c="' + c + '" style="background:' + c + '" title="Draw with ' + colName(c) + ' again" aria-label="Draw with ' + colName(c) + ' again"></button><input type="text" data-note="' + c + '" placeholder="' + colName(c) + ': what does this mark out?" value="' + esc(cur.notes[c] || '') + '" maxlength="300"></div>').join('') : '<div class="mk-empty">Nothing drawn yet.</div>';
        rows.querySelectorAll('[data-note]').forEach(i => i.addEventListener('input', () => { cur.notes[i.dataset.note] = i.value; }));
        rows.querySelectorAll('.mk-sw').forEach(b => b.addEventListener('click', () => { cur.c = b.dataset.c; sync(); }));
      }
      rows.querySelectorAll('.mk-note .mk-sw').forEach(b => b.classList.toggle('on', b.dataset.c === cur.c));
    }
    const close = () => { mk.classList.remove('on'); document.body.style.overflow = ''; drawing = null; };
    mk.querySelector('[data-close]').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && mk.classList.contains('on')) close(); });
    mk.querySelector('.mk-pal').addEventListener('click', e => { const b = e.target.closest('.mk-sw'); if (!b) return; cur.c = b.dataset.c; sync(); });
    mk.querySelector('.mk-sizes').addEventListener('click', e => { const b = e.target.closest('[data-size]'); if (!b) return; cur.size = b.dataset.size; sync(); });
    mk.querySelector('.mk-base').addEventListener('click', e => { const b = e.target.closest('[data-base]'); if (!b) return; cur.base = +b.dataset.base; redraw(); syncBase(); });
    mk.querySelector('[data-undo]').addEventListener('click', () => { cur.strokes.pop(); redraw(); sync(); });
    mk.querySelector('[data-clear]').addEventListener('click', () => { if (cur.strokes.length && !confirmDel('Clear the whole drawing?')) return; cur.strokes = []; redraw(); sync(); });
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', e => { if (!cur || !baseImgs.length) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); const z = SIZES.find(z => z.k === cur.size) || SIZES[1]; drawing = { c: cur.c, w: z.px * cv.width / 1200, p: [pos(e)] }; cur.strokes.push(drawing); paintStroke(cx, drawing); });
    cv.addEventListener('pointermove', e => { if (!drawing) return; e.preventDefault(); const pt = pos(e), last = drawing.p[drawing.p.length - 1]; if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 1.5) return; drawing.p.push(pt); cx.strokeStyle = drawing.c; cx.lineWidth = drawing.w; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.globalAlpha = 0.9; cx.beginPath(); cx.moveTo(last[0], last[1]); cx.lineTo(pt[0], pt[1]); cx.stroke(); cx.globalAlpha = 1; });
    const end = () => { if (!drawing) return; drawing = null; redraw(); sync(); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    mk.querySelector('[data-post]').addEventListener('click', async () => {
      if (!cur || !cur.strokes.length) { st.textContent = 'Draw something first.'; return; }
      const u = used(), missing = u.filter(c => !(cur.notes[c] || '').trim());
      if (missing.length) { st.textContent = 'Say what ' + missing.map(colName).join(', ') + (missing.length > 1 ? ' mean' : ' means') + ' in the list below.'; st.classList.add('err'); rows.querySelector('[data-note="' + missing[0] + '"]').focus(); return; }
      const extra = mk.querySelector('textarea').value.trim();
      const text = u.map(c => colName(c) + ': ' + cur.notes[c].trim()).join('\n') + (extra ? '\n\n' + extra : '');
      const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height; paintAll(off.getContext('2d'), off.width, off.height);
      const d = off.toDataURL('image/jpeg', 0.86);
      const photo = { name: 'markup-' + cur.name, type: 'image/jpeg', data: d.slice(d.indexOf(',') + 1) };
      mk.querySelectorAll('button').forEach(b => b.disabled = true); st.classList.remove('err'); st.textContent = 'Saving mark-up...';
      try { await cur.onPost({ text, photo }); mk.querySelector('textarea').value = ''; st.textContent = ''; cur = null; close(); }
      catch (e) { st.textContent = 'Could not save: ' + e.message; st.classList.add('err'); }
      mk.querySelectorAll('button').forEach(b => b.disabled = false);
    });
    mk._open = async function (o) {
      const bases = o.bases || [{ label: 'Photo', url: o.url }];
      cur = { name: o.name || 'photo.jpg', strokes: [], notes: {}, c: PAL[0].c, size: 'medium', base: 0, onPost: o.onPost };
      mk.querySelector('#mk-title').textContent = 'Mark up: ' + (o.title || o.name || 'photo');
      mk.querySelector('.mk-base').innerHTML = bases.length > 1 ? bases.map((b, i) => '<button type="button" data-base="' + i + '" class="' + (i ? '' : 'on') + '">' + esc(b.label) + '</button>').join('') : '';
      st.textContent = 'Loading image...'; st.classList.remove('err'); baseImgs = [];
      mk.classList.add('on'); document.body.style.overflow = 'hidden';
      cv.width = 1200; cv.height = 900; redraw(); sync();
      try {
        const first = await loadDrawable(bases[0].url); baseImgs[0] = first;
        const k = Math.min(1, 1600 / Math.max(first.naturalWidth, first.naturalHeight));
        cv.width = Math.round(first.naturalWidth * k); cv.height = Math.round(first.naturalHeight * k);
        bases.slice(1).forEach((b, i) => loadDrawable(b.url).then(im => { baseImgs[i + 1] = im; if (cur && cur.base === i + 1) redraw(); }).catch(() => { }));
        st.textContent = '';
      } catch (e) { st.textContent = 'Could not load the image: ' + e.message; st.classList.add('err'); }
      redraw(); sync();
    };
  }
  function openMarkup(o) { if (!mk) buildMarkup(); return mk._open(o); }

  // ---------- small shared bits ----------
  function flash(el, msg, err) { if (!el) return; el.textContent = msg || ''; el.classList.toggle('err', !!err); }
  function topbar() {
    const s = session();
    document.querySelectorAll('.topbar .who').forEach(el => {
      el.innerHTML = s ? '<span>Signed in as <b>' + esc(cap(s.user)) + '</b></span> <button type="button" class="lnk" data-out>Sign out</button>' : '';
      const b = el.querySelector('[data-out]'); if (b) b.addEventListener('click', signOut);
    });
    const f = document.querySelector('.foot .links');
    if (f) f.innerHTML = (C.SHEET_URL ? '<a href="' + esc(C.SHEET_URL) + '" target="_blank" rel="noopener">The spreadsheet</a>' : '') + (C.DRIVE_URL ? '<a href="' + esc(C.DRIVE_URL) + '" target="_blank" rel="noopener">The Drive folder</a>' : '');
    if (api.demo) {
      const b = document.querySelector('.banner.demo'); if (b) { b.style.display = ''; const r = b.querySelector('[data-reset]'); if (r) r.addEventListener('click', () => { api.reset(); location.reload(); }); }
    }
  }
  const progress = c => c && c.tasks ? Math.round(100 * c.tasksDone / c.tasks) : 0;
  const pill = s => '<span class="pill ' + esc(s) + '">' + esc((STATUS[s] || { label: s }).label) + '</span>';
  // plain text to HTML: blank lines split blocks; lines starting with "- " make a list (a block can mix plain lines
  // and a list, so "Edges\n- steel\n- stone" is a line then a list); ordered=true numbers every line instead
  function rich(text, ordered) {
    const blocks = String(text || '').replace(/\r/g, '').trim().split(/\n\s*\n/).filter(Boolean);
    if (ordered) { const items = blocks.join('\n').split('\n').map(l => l.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim()).filter(Boolean); return items.length ? '<ol class="seq">' + items.map(l => '<li>' + esc(l) + '</li>').join('') + '</ol>' : ''; }
    const isLi = l => /^\s*[-*]\s/.test(l);
    return blocks.map(b => {
      const lines = b.split('\n').filter(l => l.trim()), out = []; let i = 0;
      while (i < lines.length) {
        if (isLi(lines[i])) { const li = []; while (i < lines.length && isLi(lines[i])) li.push(lines[i++].replace(/^\s*[-*]\s*/, '')); out.push('<ul>' + li.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>'); }
        else { const pl = []; while (i < lines.length && !isLi(lines[i])) pl.push(lines[i++]); out.push('<p' + (lines.length > pl.length ? ' class="lead"' : '') + '>' + pl.map(esc).join('<br>') + '</p>'); }
      }
      return out.join('');
    }).join('');
  }
  const fileExt = n => { const m = String(n || '').match(/\.([a-z0-9]{1,5})$/i); return m ? m[1].toLowerCase() : 'file'; };

  return { C, api, esc, cap, when, day, today, money, STATUS, FILE_KINDS, USERS, PASS_HASH, session, setSession, sha256, requireLogin, signOut, user,
           driveId, isData, thumb, alt, img, shrink, readAny, wirePicker, pickerHtml, lightbox, modal, confirmDel, openMarkup, flash, topbar, progress, pill, fileExt, rich };
})();
