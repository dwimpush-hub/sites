// Home Central: Google Apps Script backend.
//
// One spreadsheet ("Home Central") with a tab per kind of record, and one Drive folder tree:
//   Home Central/projects/<project name>/            photos and mark-ups
//   Home Central/projects/<project name>/files/      contracts, quotes, schedules, PDFs
//
// First time: paste this file into a new Apps Script project, pick `setup` next to Run and run it
// (accept the permission prompt). It creates the spreadsheet and the folder and prints their links.
// Then Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone, and paste the
// web-app URL into home-central/config.js (HC_CONFIG.API).
//
// Changing the script later needs a new deployment version (Deploy > Manage deployments > edit > new version).

const SHEET_ID = '';                 // optional: an existing spreadsheet id. Blank = the one setup() creates.
const ROOT_FOLDER = 'Home Central';  // Drive folder that holds the sheet and the projects tree
const TZ = 'America/Chicago';
const MAX_B64 = 20 * 1024 * 1024;    // 20 MB of base64, about 15 MB of file

// Sign-in: the site asks for a name and the shared password, hashes the password (SHA-256, hex) in the
// browser and sends the hash with every request. Change the password by replacing this hash
// (on a Mac: printf 'new password' | shasum -a 256). Names are checked against USERS.
const PASS_HASH = 'f4e17aa8bb9331c734643455a8fc0c9b03211c0fa340e47c56b86377cc531380';
const USERS = ['dave', 'nate', 'cissy'];

const TABS = {
  Projects: ['id', 'name', 'status', 'summary', 'budget', 'start', 'target', 'cover', 'page', 'tags', 'created', 'updated'],
  Ideas:    ['id', 'project', 'title', 'author', 'text', 'photo', 'created', 'updated'],
  Photos:   ['id', 'project', 'name', 'url', 'caption', 'kind', 'parent', 'author', 'created'],
  Files:    ['id', 'project', 'name', 'url', 'kind', 'note', 'amount', 'author', 'created'],
  Tasks:    ['id', 'project', 'text', 'done', 'due', 'assignee', 'author', 'created', 'completed'],
  Log:      ['when', 'who', 'project', 'action', 'detail']
};
// Columns that are not plain text (everything else is formatted as text so "3/4 bath" never turns into a date).
const DATES = { created: 1, updated: 1, completed: 1, when: 1 };
const NUMBERS = { budget: 1, amount: 1 };
const BOOLS = { done: 1 };
const STATUSES = ['idea', 'pending', 'upcoming', 'active', 'done', 'nixed'];
const CHILD_TABS = ['Ideas', 'Photos', 'Files', 'Tasks'];

// ---------- spreadsheet ----------
function props_() { return PropertiesService.getScriptProperties(); }

function ss_() {
  const id = SHEET_ID || props_().getProperty('SHEET_ID');
  if (!id) throw new Error('Not set up yet: run setup() from the script editor');
  return SpreadsheetApp.openById(id);
}

// Run once from the editor. Creates (or adopts) the spreadsheet, its tabs and the Drive folder.
function setup() {
  let id = SHEET_ID || props_().getProperty('SHEET_ID');
  let ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Home Central');
    props_().setProperty('SHEET_ID', ss.getId());
    DriveApp.getFileById(ss.getId()).moveTo(root_());
  }
  Object.keys(TABS).forEach(function (n) { tab_(n); });
  const s1 = ss.getSheetByName('Sheet1');
  if (s1 && ss.getSheets().length > 1 && s1.getLastRow() === 0) ss.deleteSheet(s1);
  projectsFolder_();
  Logger.log('Sheet:  ' + ss.getUrl());
  Logger.log('Folder: ' + root_().getUrl());
  return ss.getUrl();
}

function tab_(name) {
  const ss = ss_();
  const head = TABS[name];
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    const rows = Math.max(sh.getMaxRows() - 1, 1);
    head.forEach(function (h, i) {
      const col = sh.getRange(2, i + 1, rows, 1);
      if (BOOLS[h]) col.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      else if (DATES[h]) col.setNumberFormat('yyyy-mm-dd hh:mm');
      else if (NUMBERS[h]) col.setNumberFormat('#,##0.00');
      else col.setNumberFormat('@');
    });
  } else if (sh.getLastColumn() < head.length) {
    const from = sh.getLastColumn();
    sh.getRange(1, from + 1, 1, head.length - from).setValues([head.slice(from)]).setFontWeight('bold');
  }
  return sh;
}

function ymd_(d, tz) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }

function norm_(h, v, tz) {
  if (v instanceof Date) return DATES[h] ? v.toISOString() : ymd_(v, tz);
  if (BOOLS[h]) return v === true || String(v).toUpperCase() === 'TRUE';
  if (NUMBERS[h]) return (v === '' || v == null) ? '' : Number(v);
  return v == null ? '' : String(v);
}

function rows_(name) {
  const sh = tab_(name);
  const tz = sh.getParent().getSpreadsheetTimeZone();
  const vals = sh.getDataRange().getValues();
  if (!vals.length) return [];
  const head = vals[0].map(String);
  const out = [];
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] === '' || vals[i][0] == null) continue;
    const o = {};
    head.forEach(function (h, j) { o[h] = norm_(h, vals[i][j], tz); });
    out.push(o);
  }
  return out;
}

function add_(name, obj) {
  const head = TABS[name];
  tab_(name).appendRow(head.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
  return obj;
}

function find_(name, id) {
  const sh = tab_(name);
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const ids = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function get_(name, id) {
  const r = rows_(name).filter(function (x) { return String(x.id) === String(id); });
  return r.length ? r[0] : null;
}

function patch_(name, id, patch) {
  const sh = tab_(name), head = TABS[name];
  const row = find_(name, id);
  if (!row) throw new Error(name.replace(/s$/, '') + ' not found');
  Object.keys(patch).forEach(function (k) {
    const c = head.indexOf(k);
    if (c >= 0) sh.getRange(row, c + 1).setValue(patch[k]);
  });
  return row;
}

function del_(name, id) {
  const row = find_(name, id);
  if (row) tab_(name).deleteRow(row);
  return !!row;
}

function delWhere_(name, field, value) {
  const sh = tab_(name), head = TABS[name], c = head.indexOf(field);
  const n = sh.getLastRow() - 1;
  if (n < 1 || c < 0) return 0;
  const vals = sh.getRange(2, c + 1, n, 1).getValues();
  let k = 0;
  for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(value)) { sh.deleteRow(i + 2); k++; }
  return k;
}

function log_(who, project, action, detail) {
  try { add_('Log', { when: new Date(), who: who || '', project: project || '', action: action, detail: String(detail || '').slice(0, 300) }); } catch (e) { /* logging never fails a request */ }
}

// ---------- drive ----------
function folderIn_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}
function root_() { return folderIn_(DriveApp.getRootFolder(), ROOT_FOLDER); }
function projectsFolder_() {
  const f = folderIn_(root_(), 'projects');
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* already shared or not allowed */ }
  return f;
}
function safeName_(s) { return String(s || 'project').replace(/[\\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'project'; }
function projectFolder_(p) { return folderIn_(projectsFolder_(), safeName_(p.name)); }
function filesFolder_(p) { return folderIn_(projectFolder_(p), 'files'); }
function fileId_(url) { const m = String(url || '').match(/\/d\/([\w-]+)/); return m ? m[1] : ''; }

function saveBlob_(folder, f, imageOnly) {
  if (!f || !f.data) throw new Error('no file data');
  const type = String(f.type || 'application/octet-stream');
  if (imageOnly && type.indexOf('image/') !== 0) throw new Error('not an image');
  if (f.data.length > MAX_B64) throw new Error('file too large (15 MB max)');
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
  const base = String(f.name || 'file').replace(/[\\\/:*?"<>|]+/g, '_').slice(0, 100) || 'file';
  const blob = Utilities.newBlob(Utilities.base64Decode(f.data), type, stamp + ' ' + base);
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* inherits from the folder */ }
  return { url: 'https://drive.google.com/file/d/' + file.getId() + '/view', name: base, size: file.getSize() };
}

function trash_(url) {
  const id = fileId_(url);
  if (!id) return;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* already gone */ }
}

// ---------- reads ----------
function counts_(all) {
  const by = {};
  const bump = function (pid, k, v) { const c = by[pid] || (by[pid] = { tasks: 0, tasksDone: 0, photos: 0, ideas: 0, files: 0, nextDue: '' }); c[k] += (v === undefined ? 1 : v); return c; };
  all.Tasks.forEach(function (t) {
    const c = bump(t.project, 'tasks');
    if (t.done) bump(t.project, 'tasksDone');
    else if (t.due && (!c.nextDue || t.due < c.nextDue)) c.nextDue = t.due;
  });
  all.Photos.forEach(function (x) { bump(x.project, 'photos'); });
  all.Ideas.forEach(function (x) { bump(x.project, 'ideas'); });
  all.Files.forEach(function (x) { bump(x.project, 'files'); });
  return by;
}

function all_() {
  const o = {};
  CHILD_TABS.forEach(function (n) { o[n] = rows_(n); });
  return o;
}

function home_() {
  const by = counts_(all_());
  return rows_('Projects').map(function (p) {
    const c = by[p.id] || { tasks: 0, tasksDone: 0, photos: 0, ideas: 0, files: 0, nextDue: '' };
    return Object.assign({}, p, { counts: c });
  });
}

function project_(id) {
  const p = get_('Projects', id);
  if (!p) throw new Error('project not found');
  const all = all_();
  const mine = function (rows) { return rows.filter(function (r) { return String(r.project) === String(id); }); };
  const out = { project: p, ideas: mine(all.Ideas), photos: mine(all.Photos), files: mine(all.Files), tasks: mine(all.Tasks) };
  out.project.counts = counts_({ Tasks: out.tasks, Photos: out.photos, Ideas: out.ideas, Files: out.files })[id] ||
                       { tasks: 0, tasksDone: 0, photos: 0, ideas: 0, files: 0, nextDue: '' };
  return out;
}

// Image bytes for the annotation canvas (Drive thumbnails do not always allow cross-origin drawing).
// Only files that appear in the Photos or Ideas tabs can be fetched, so the web app never exposes other Drive files.
function image_(id) {
  if (!id) throw new Error('no id');
  const known = rows_('Photos').some(function (x) { return fileId_(x.url) === id; }) ||
                rows_('Ideas').some(function (x) { return fileId_(x.photo) === id; });
  if (!known) throw new Error('not a project photo');
  const blob = DriveApp.getFileById(id).getBlob();
  return { ok: true, type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function auth_(src) {
  const key = String((src && src.key) || '').toLowerCase();
  const user = String((src && src.user) || '').toLowerCase();
  if (key !== PASS_HASH || USERS.indexOf(user) < 0) throw new Error('not signed in');
  return user.charAt(0).toUpperCase() + user.slice(1);
}

function doGet(e) {
  const q = (e && e.parameter) || {};
  const a = q.action || 'home';
  try {
    if (a === 'login') { auth_(q); return out_({ ok: true, user: auth_(q) }); }
    auth_(q);
    if (a === 'home') return out_({ ok: true, projects: home_() });
    if (a === 'project') return out_(Object.assign({ ok: true }, project_(q.id)));
    if (a === 'image') return out_(image_(q.id));
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  }
}

// ---------- writes ----------
function str_(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }
function num_(v) { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? '' : n; }
function ymdStr_(v) { const m = String(v || '').match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; }
function status_(v, fallback) { v = String(v || '').toLowerCase(); return STATUSES.indexOf(v) >= 0 ? v : (fallback || 'idea'); }
function kind_(v, fallback) { return str_(v, 40) || fallback; }

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const who = auth_(body);
    const now = new Date();
    const a = String(body.action || '');
    const id = body.id;

    // ----- projects -----
    if (a === 'project.add') {
      const name = str_(body.name, 120);
      if (!name) return out_({ ok: false, error: 'a project needs a name' });
      const p = {
        id: Utilities.getUuid(), name: name, status: status_(body.status), summary: str_(body.summary, 2000),
        budget: num_(body.budget), start: ymdStr_(body.start), target: ymdStr_(body.target), cover: '',
        page: str_(body.page, 500), tags: str_(body.tags, 200), created: now, updated: now
      };
      add_('Projects', p);
      projectFolder_(p);
      log_(who, p.id, a, name);
      p.created = p.updated = now.toISOString();
      p.counts = { tasks: 0, tasksDone: 0, photos: 0, ideas: 0, files: 0, nextDue: '' };
      return out_({ ok: true, project: p });
    }
    if (a === 'project.edit') {
      const p = get_('Projects', id);
      if (!p) return out_({ ok: false, error: 'project not found' });
      const patch = { updated: now };
      if (body.name !== undefined) { const nm = str_(body.name, 120); if (!nm) return out_({ ok: false, error: 'a project needs a name' }); patch.name = nm; }
      if (body.status !== undefined) patch.status = status_(body.status, p.status);
      if (body.summary !== undefined) patch.summary = str_(body.summary, 2000);
      if (body.budget !== undefined) patch.budget = num_(body.budget);
      if (body.start !== undefined) patch.start = ymdStr_(body.start);
      if (body.target !== undefined) patch.target = ymdStr_(body.target);
      if (body.page !== undefined) patch.page = str_(body.page, 500);
      if (body.tags !== undefined) patch.tags = str_(body.tags, 200);
      if (body.cover !== undefined) patch.cover = str_(body.cover, 500);
      if (patch.name && patch.name !== p.name) { try { projectFolder_(p).setName(safeName_(patch.name)); } catch (err) { /* folder rename is best effort */ } }
      patch_('Projects', id, patch);
      log_(who, id, a, Object.keys(patch).filter(function (k) { return k !== 'updated'; }).join(','));
      return out_({ ok: true, project: project_(id).project });
    }
    if (a === 'project.delete') {
      const p = get_('Projects', id);
      if (!p) return out_({ ok: false, error: 'project not found' });
      CHILD_TABS.forEach(function (n) { delWhere_(n, 'project', id); });
      del_('Projects', id);
      try { projectFolder_(p).setTrashed(true); } catch (err) { /* folder may not exist */ }
      log_(who, id, a, p.name);
      return out_({ ok: true, deleted: id });
    }

    // ----- tasks -----
    if (a === 'task.add') {
      const p = get_('Projects', body.project);
      if (!p) return out_({ ok: false, error: 'project not found' });
      const text = str_(body.text, 500);
      if (!text) return out_({ ok: false, error: 'empty task' });
      const t = { id: Utilities.getUuid(), project: p.id, text: text, done: false, due: ymdStr_(body.due), assignee: str_(body.assignee, 80), author: who, created: now, completed: '' };
      add_('Tasks', t);
      log_(who, p.id, a, text);
      t.created = now.toISOString();
      return out_({ ok: true, task: t });
    }
    if (a === 'task.edit' || a === 'task.toggle') {
      const t = get_('Tasks', id);
      if (!t) return out_({ ok: false, error: 'task not found' });
      const patch = {};
      if (a === 'task.toggle') body.done = !t.done;
      if (body.text !== undefined) { const tx = str_(body.text, 500); if (!tx) return out_({ ok: false, error: 'empty task' }); patch.text = tx; }
      if (body.due !== undefined) patch.due = ymdStr_(body.due);
      if (body.assignee !== undefined) patch.assignee = str_(body.assignee, 80);
      if (body.done !== undefined) { patch.done = !!body.done; patch.completed = body.done ? now : ''; }
      patch_('Tasks', id, patch);
      log_(who, t.project, a, (patch.done === true ? 'done: ' : patch.done === false ? 'reopened: ' : '') + (patch.text || t.text));
      return out_({ ok: true, task: get_('Tasks', id) });
    }
    if (a === 'task.delete') {
      const t = get_('Tasks', id);
      if (!t) return out_({ ok: false, error: 'task not found' });
      del_('Tasks', id);
      log_(who, t.project, a, t.text);
      return out_({ ok: true, deleted: id });
    }

    // ----- photos (and mark-ups, which are photos with kind "markup" and a parent) -----
    if (a === 'photo.add') {
      const p = get_('Projects', body.project);
      if (!p) return out_({ ok: false, error: 'project not found' });
      const saved = saveBlob_(projectFolder_(p), body.photo, true);
      const x = { id: Utilities.getUuid(), project: p.id, name: saved.name, url: saved.url, caption: str_(body.caption, 2000),
                  kind: kind_(body.kind, 'photo'), parent: str_(body.parent, 80), author: who, created: now };
      add_('Photos', x);
      if (!p.cover && x.kind === 'photo') patch_('Projects', p.id, { cover: x.url, updated: now });
      log_(who, p.id, a, x.kind + ' ' + x.name);
      x.created = now.toISOString();
      return out_({ ok: true, photo: x, cover: p.cover || x.url });
    }
    if (a === 'photo.edit') {
      const x = get_('Photos', id);
      if (!x) return out_({ ok: false, error: 'photo not found' });
      const patch = {};
      if (body.caption !== undefined) patch.caption = str_(body.caption, 2000);
      patch_('Photos', id, patch);
      return out_({ ok: true, photo: get_('Photos', id) });
    }
    if (a === 'photo.cover') {
      const x = get_('Photos', id);
      if (!x) return out_({ ok: false, error: 'photo not found' });
      patch_('Projects', x.project, { cover: x.url, updated: now });
      log_(who, x.project, a, x.name);
      return out_({ ok: true, cover: x.url });
    }
    if (a === 'photo.delete') {
      const x = get_('Photos', id);
      if (!x) return out_({ ok: false, error: 'photo not found' });
      del_('Photos', id);
      delWhere_('Photos', 'parent', id); // its mark-ups go with it (their files stay in Drive)
      trash_(x.url);
      const p = get_('Projects', x.project);
      let cover = p ? p.cover : '';
      if (p && p.cover === x.url) {
        const rest = rows_('Photos').filter(function (y) { return y.project === p.id && y.kind === 'photo'; });
        cover = rest.length ? rest[0].url : '';
        patch_('Projects', p.id, { cover: cover, updated: now });
      }
      log_(who, x.project, a, x.name);
      return out_({ ok: true, deleted: id, cover: cover });
    }

    // ----- files -----
    if (a === 'file.add') {
      const p = get_('Projects', body.project);
      if (!p) return out_({ ok: false, error: 'project not found' });
      const saved = saveBlob_(filesFolder_(p), body.file, false);
      const f = { id: Utilities.getUuid(), project: p.id, name: saved.name, url: saved.url, kind: kind_(body.kind, 'Other'),
                  note: str_(body.note, 1000), amount: num_(body.amount), author: who, created: now };
      add_('Files', f);
      log_(who, p.id, a, f.kind + ' ' + f.name);
      f.created = now.toISOString();
      return out_({ ok: true, file: f });
    }
    if (a === 'file.edit') {
      const f = get_('Files', id);
      if (!f) return out_({ ok: false, error: 'file not found' });
      const patch = {};
      if (body.kind !== undefined) patch.kind = kind_(body.kind, 'Other');
      if (body.note !== undefined) patch.note = str_(body.note, 1000);
      if (body.amount !== undefined) patch.amount = num_(body.amount);
      if (body.name !== undefined) { const nm = str_(body.name, 120); if (nm) patch.name = nm; }
      patch_('Files', id, patch);
      return out_({ ok: true, file: get_('Files', id) });
    }
    if (a === 'file.delete') {
      const f = get_('Files', id);
      if (!f) return out_({ ok: false, error: 'file not found' });
      del_('Files', id);
      trash_(f.url);
      log_(who, f.project, a, f.name);
      return out_({ ok: true, deleted: id });
    }

    // ----- ideas -----
    if (a === 'idea.add') {
      const p = get_('Projects', body.project);
      if (!p) return out_({ ok: false, error: 'project not found' });
      const text = str_(body.text, 2000);
      if (!text && !(body.photo && body.photo.data)) return out_({ ok: false, error: 'empty' });
      const photo = (body.photo && body.photo.data) ? saveBlob_(projectFolder_(p), body.photo, true).url : '';
      const i = { id: Utilities.getUuid(), project: p.id, title: str_(body.title, 120), author: who, text: text, photo: photo, created: now, updated: now };
      add_('Ideas', i);
      log_(who, p.id, a, text.slice(0, 80));
      i.created = i.updated = now.toISOString();
      return out_({ ok: true, idea: i });
    }
    if (a === 'idea.edit') {
      const i = get_('Ideas', id);
      if (!i) return out_({ ok: false, error: 'idea not found' });
      const text = str_(body.text, 2000);
      let photo = i.photo;
      if (body.photo && body.photo.data) photo = saveBlob_(projectFolder_(get_('Projects', i.project) || { name: 'project' }), body.photo, true).url;
      else if (body.removePhoto) photo = '';
      if (!text && !photo) { del_('Ideas', id); trash_(i.photo); return out_({ ok: true, deleted: id }); }
      if (photo !== i.photo) trash_(i.photo);
      const patch = { text: text, photo: photo, updated: now };
      if (who) patch.author = who;
      patch_('Ideas', id, patch);
      return out_({ ok: true, idea: get_('Ideas', id) });
    }
    if (a === 'idea.delete') {
      const i = get_('Ideas', id);
      if (!i) return out_({ ok: false, error: 'idea not found' });
      del_('Ideas', id);
      trash_(i.photo);
      log_(who, i.project, a, i.text.slice(0, 80));
      return out_({ ok: true, deleted: id });
    }

    return out_({ ok: false, error: 'unknown action ' + a });
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- optional: bring the patio concept in as the first pending project ----------
// Run from the editor. Creates a "Patio and side yard" project (status pending) that links to the concept
// page, and copies the ideas from the patio ideas sheet. Photos stay where they are in Drive.
const PATIO_SHEET_ID = '13W_AXk0vm_Z_QYbDb5gQ9KWZNy7bZbzg6NKrTbG33RQ';
const PATIO_PAGE = 'https://dwimpush-hub.github.io/sites/patio/';

function importPatio() {
  const now = new Date();
  let p = rows_('Projects').filter(function (x) { return x.page === PATIO_PAGE; })[0];
  if (!p) {
    p = { id: Utilities.getUuid(), name: 'Patio and side yard', status: 'pending',
          summary: 'Crushed granite patio, flagstone steppers down the side path, river rock under the AC, mulch beds, French drain from the pool equipment to the shed corner.',
          budget: '', start: '', target: '', cover: '', page: PATIO_PAGE, tags: 'landscape, drainage', created: now, updated: now };
    add_('Projects', p);
    projectFolder_(p);
  }
  const have = {};
  rows_('Ideas').forEach(function (i) { have[i.text + '|' + i.created] = 1; });
  const src = SpreadsheetApp.openById(PATIO_SHEET_ID).getSheets()[0].getDataRange().getValues();
  let n = 0;
  for (let r = 1; r < src.length; r++) {
    const row = src[r];
    if (!row[0]) continue;
    const created = row[5] instanceof Date ? row[5] : now;
    const key = String(row[4]) + '|' + created.toISOString();
    if (have[key]) continue;
    add_('Ideas', { id: String(row[0]), project: p.id, title: 'Station ' + row[1] + (row[2] ? ': ' + row[2] : ''), author: String(row[3] || ''),
                    text: String(row[4] || ''), photo: String(row[7] || ''), created: created, updated: row[6] instanceof Date ? row[6] : created });
    n++;
  }
  Logger.log('Imported ' + n + ' ideas into project ' + p.id);
}
