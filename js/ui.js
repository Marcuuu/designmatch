/* ui.js - small helpers shared by the boundary pages */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = ts => new Date(ts).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = ts => new Date(ts).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const money = n => '$' + Number(n).toLocaleString('en-SG');
const label = s => String(s).replace(/_/g, ' ');
const badge = s => '<span class="badge b-' + esc(String(s).toLowerCase()) + '">' + esc(label(s)) + '</span>';
const options = (list, selected) => list.map(o => {
  const v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
  return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(t) + '</option>';
}).join('');

let toastTimer;
function toast(msg, type) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show ' + (type || 'ok');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 2800);
}

/* Modal form. onSubmit(data) must return a Result; on failure the message is shown inside the form. */
function openModal(title, bodyHtml, onSubmit, submitLabel) {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.innerHTML = '<form class="stack"><h3>' + esc(title) + '</h3>' + bodyHtml +
    '<p class="error" hidden></p><div class="row end"><button type="button" class="btn ghost" data-close>Cancel</button>' +
    '<button class="btn">' + esc(submitLabel || 'Save') + '</button></div></form>';
  document.body.appendChild(d);
  const form = $('form', d), err = $('.error', d);
  $('[data-close]', d).onclick = () => d.close();
  form.onsubmit = e => {
    e.preventDefault();
    const r = onSubmit(Object.fromEntries(new FormData(form)));
    if (r && !r.ok) { err.textContent = r.message; err.hidden = false; return; }
    d.close();
  };
  d.addEventListener('close', () => d.remove());
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  return d;
}

function confirmBox(message, onYes, yesLabel) {
  openModal('Please confirm', '<p>' + esc(message) + '</p>', () => { onYes(); return { ok: true }; }, yesLabel || 'Yes');
}

function paginate(items, page, per) {
  const pages = Math.max(1, Math.ceil(items.length / per));
  page = Math.min(Math.max(1, page), pages);
  return { page, pages, items: items.slice((page - 1) * per, page * per) };
}
function pager(p) {
  if (p.pages <= 1) return '';
  return '<div class="pager"><button class="btn small ghost" data-page="' + (p.page - 1) + '"' + (p.page === 1 ? ' disabled' : '') + '>Prev</button>' +
    '<span>Page ' + p.page + ' of ' + p.pages + '</span><button class="btn small ghost" data-page="' + (p.page + 1) + '"' + (p.page === p.pages ? ' disabled' : '') + '>Next</button></div>';
}

/* Placeholder "photo": a coloured block derived from the listing id (no external images needed) */
function thumb(l, big) {
  const h = (l.id * 47) % 360;
  return '<div class="thumb' + (big ? ' big' : '') + '" style="background:linear-gradient(135deg,hsl(' + h + ',45%,72%),hsl(' + ((h + 50) % 360) + ',45%,52%))"><span>' + esc(l.categoryName || '') + '</span></div>';
}
