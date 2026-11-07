// Ideas board for the patio concept page.
// Bound to the "Patio notes ideas" sheet. Deploy as a web app (Execute as: Me, Who has access: Anyone)
// and paste the web-app URL into IDEAS_API at the top of the page script.

const SHEET_ID = '13W_AXk0vm_Z_QYbDb5gQ9KWZNy7bZbzg6NKrTbG33RQ';
const HEAD = ['id', 'station', 'title', 'author', 'text', 'created', 'updated'];

function sheet_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
  }
  return sh;
}

function iso_(v) {
  return v instanceof Date ? v.toISOString() : String(v || '');
}

function all_() {
  const rows = sheet_().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({ id: String(r[0]), station: String(r[1]), title: String(r[2]), author: String(r[3]),
               text: String(r[4]), created: iso_(r[5]), updated: iso_(r[6]) });
  }
  return out;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return out_({ ok: true, ideas: all_() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const sh = sheet_();
    const now = new Date();
    const text = String(body.text || '').trim().slice(0, 2000);
    const author = String(body.author || '').trim().slice(0, 80);
    if (body.action === 'add') {
      if (!text) return out_({ ok: false, error: 'empty' });
      const id = Utilities.getUuid();
      const station = String(body.station || '');
      const title = String(body.title || '').slice(0, 120);
      sh.appendRow([id, station, title, author, text, now, now]);
      return out_({ ok: true, idea: { id, station, title, author, text, created: now.toISOString(), updated: now.toISOString() } });
    }
    if (body.action === 'edit' || body.action === 'delete') {
      const n = Math.max(sh.getLastRow() - 1, 1);
      const ids = sh.getRange(2, 1, n, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) !== String(body.id)) continue;
        const row = i + 2;
        if (body.action === 'delete' || !text) { sh.deleteRow(row); return out_({ ok: true, deleted: String(body.id) }); }
        sh.getRange(row, 5).setValue(text);
        if (author) sh.getRange(row, 4).setValue(author);
        sh.getRange(row, 7).setValue(now);
        return out_({ ok: true, updated: now.toISOString() });
      }
      return out_({ ok: false, error: 'not found' });
    }
    return out_({ ok: false, error: 'unknown action' });
  } finally {
    lock.releaseLock();
  }
}
