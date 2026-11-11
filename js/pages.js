/* pages.js - BOUNDARY layer (the UI pages from the class diagram).
   Pages only collect input and show results. All rules live in controllers.js. */

const view = html => { $('#app').innerHTML = html; window.scrollTo(0, 0); };
const message = (title, text, link) => view('<section class="card center"><h2>' + esc(title) + '</h2><p class="muted">' + esc(text) + '</p>' + (link || '<a class="btn" href="#/">Back to home</a>') + '</section>');

/* ---------- shared pieces ---------- */
function listingCard(l, user, favSet) {
  const isCustomer = user && user.role === 'CUSTOMER';
  const heart = isCustomer
    ? '<button class="heart' + (favSet.has(l.id) ? ' on' : '') + '" data-fav="' + l.id + '" title="Save to favourites">&#9829; <b>' + l.shortlistCount + '</b></button>'
    : '<span class="heart static" title="Times shortlisted">&#9829; ' + l.shortlistCount + '</span>';
  return '<article class="listing-card"><a href="#/listing/' + l.id + '">' + thumb(l) + '</a><div class="lc-body">' +
    '<div class="row between"><span class="tag">' + esc(l.style) + '</span>' + heart + '</div>' +
    '<h3><a href="#/listing/' + l.id + '">' + esc(l.title) + '</a></h3>' +
    '<p class="muted small"><a href="#/company/' + l.designerId + '">' + esc(l.companyName) + '</a> &middot; ' + (l.projectState === 'CURRENT' ? 'Current project' : 'Past project') + '</p>' +
    '<p class="price">' + money(l.minBudget) + ' - ' + money(l.maxBudget) + '</p><p class="muted small">' + l.viewCount + ' views</p></div></article>';
}
function bindFavs(root, user, after) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    const r = FavouriteController.toggle(user.id, b.dataset.fav);
    toast(r.message, r.ok ? 'ok' : 'err');
    if (r.ok) after();
  });
}
function profileCard(user) {
  return '<form id="profileForm" class="card stack"><h3>Profile</h3>' +
    '<label>Name<input name="name" value="' + esc(user.name) + '" required></label>' +
    '<label>Email<input value="' + esc(user.email) + '" disabled></label>' +
        '<p class="muted small">Account type: ' + badge(user.role) + '</p><p class="error" hidden></p><button class="btn">Save profile</button></form>';
}

/* the diagram's search(keyword) only takes a keyword; the extra filters and sorting are applied here, on the page, to the returned list */
function applyFilters(items, f) {
  if (f.categoryId) items = items.filter(l => l.categoryId === +f.categoryId);
  if (f.style) items = items.filter(l => l.style === f.style);
  if (f.projectState) items = items.filter(l => l.projectState === f.projectState);
  if (f.maxBudget) items = items.filter(l => l.minBudget <= +f.maxBudget);
  const sorts = { new: (a, b) => b.createdAt - a.createdAt, views: (a, b) => b.viewCount - a.viewCount, saved: (a, b) => b.shortlistCount - a.shortlistCount, budget: (a, b) => a.minBudget - b.minBudget };
  return items.slice().sort(sorts[f.sort] || sorts.new);
}

const Pages = {};

/* ---------- guest / customer: search (US-22) ---------- */
const searchState = { q: '', categoryId: '', style: '', projectState: '', maxBudget: '', sort: 'new', page: 1 };
Pages.home = () => {
  const user = Auth.user();
  const cats = CategoryController.list().filter(c => c.status === 'ACTIVE').map(c => [c.id, c.name]);
  view('<section class="hero"><h1>Find the interior designer behind your next space</h1><p>Browse real projects, save your favourites and book a consultation.</p></section>' +
    '<form id="searchForm" class="filters card"><label class="grow">Keyword<input name="q" placeholder="e.g. Scandinavian kitchen" value="' + esc(searchState.q) + '"></label>' +
    '<label>Category<select name="categoryId"><option value="">All</option>' + options(cats, searchState.categoryId) + '</select></label>' +
    '<label>Style<select name="style"><option value="">All</option>' + options(STYLES, searchState.style) + '</select></label>' +
    '<label>Project<select name="projectState"><option value="">Current and past</option>' + options([['CURRENT', 'Current'], ['PAST', 'Past']], searchState.projectState) + '</select></label>' +
    '<label>Budget up to ($)<input name="maxBudget" type="number" min="0" step="1000" value="' + esc(searchState.maxBudget) + '"></label>' +
    '<label>Sort<select name="sort">' + options([['new', 'Newest'], ['views', 'Most viewed'], ['saved', 'Most shortlisted'], ['budget', 'Lowest budget']], searchState.sort) + '</select></label></form>' +
    '<div id="results"></div>');

  const results = $('#results');
  const render = () => {
    const items = applyFilters(SearchListingDetailsPages.search(searchState.q), searchState);   // US-22
    const p = paginate(items, searchState.page, 12); searchState.page = p.page;
    const favSet = user && user.role === 'CUSTOMER' ? new Set(FavouriteController.getFavourites(user.id).map(l => l.id)) : new Set();
    results.innerHTML = '<p class="muted">' + items.length + ' project' + (items.length === 1 ? '' : 's') + ' found</p>' +
      (items.length ? '<div class="grid">' + p.items.map(l => listingCard(l, user, favSet)).join('') + '</div>' + pager(p)
        : '<div class="card center"><p>No projects match your search. Try fewer filters.</p></div>');
  };
  $('#searchForm').addEventListener('input', e => { searchState[e.target.name] = e.target.value; searchState.page = 1; render(); });
  $('#searchForm').addEventListener('submit', e => e.preventDefault());
  results.addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b && !b.disabled) { searchState.page = +b.dataset.page; render(); } });
  if (user && user.role === 'CUSTOMER') bindFavs(results, user, render);
  render();
};

/* ---------- Search / Listing Details Pages (US-25 includes US-33; US-41 booking button) ---------- */
Pages.listing = id => {
  const user = Auth.user();
  const r = SearchListingDetailsPages.viewDetails(id);   // US-25 (includes US-33)
  if (!r.ok) return message('Project not available', r.message);
  const l = r.data, co = l.company || {};
  let bookingCard;
  if (l.status !== 'PUBLISHED') bookingCard = '<div class="card"><p class="muted">Preview only: this project is ' + esc(label(l.status).toLowerCase()) + ' and is hidden from customers.</p></div>';
  else if (!user) bookingCard = '<div class="card stack"><h3>Interested?</h3><p class="muted">Log in as a customer to request a booking or save this project.</p><a class="btn" href="#/login">Log in</a><a class="btn ghost" href="#/register">Create account</a></div>';
  else if (user.role !== 'CUSTOMER') bookingCard = '<div class="card"><p class="muted">Booking is available to customer accounts only.</p></div>';
  else bookingCard = '<form id="bookingForm" class="card stack"><h3>Request a booking</h3><label>Preferred date<input type="date" name="preferredDate" min="' + new Date().toISOString().slice(0, 10) + '" required></label>' +
    '<label>Message to the designer<textarea name="message" rows="4" required placeholder="Tell them about your space and what you have in mind"></textarea></label><p class="error" hidden></p><button class="btn">Request Booking</button></form>';

  view('<p><a href="#/">&larr; Back to search</a></p><div class="detail"><div>' + thumb(l, true) +
    '<div class="row between wrap"><div><h1>' + esc(l.title) + '</h1><p class="muted">' + esc(l.categoryName) + ' &middot; ' + esc(l.style) + ' &middot; ' + (l.projectState === 'CURRENT' ? 'Current project' : 'Past project') + '</p></div>' +
    (user && user.role === 'CUSTOMER' && l.status === 'PUBLISHED' ? '<button class="btn ghost" id="favBtn">' + (FavouriteController.isFavourite(user.id, l.id) ? '&#9829; Saved' : '&#9825; Save') + '</button>' : '') + '</div>' +
    '<p>' + esc(l.description) + '</p><div class="stats"><div><b>' + money(l.minBudget) + ' - ' + money(l.maxBudget) + '</b><span>Budget range</span></div><div><b>' + l.viewCount + '</b><span>Views</span></div><div><b>' + l.shortlistCount + '</b><span>Shortlisted</span></div></div></div>' +
    '<aside class="stack">' + bookingCard + '<div class="card stack"><h3>' + esc(l.companyName) + '</h3><p class="muted small">' + esc(co.description || 'No company description yet.') + '</p>' +
    '<a class="btn ghost" href="#/company/' + l.designerId + '">View company and portfolio</a></div></aside></div>');

  const fb = $('#favBtn');
  if (fb) fb.onclick = () => { const t = FavouriteController.toggle(user.id, l.id); toast(t.message); fb.innerHTML = t.data ? '&#9829; Saved' : '&#9825; Save'; };
  const bf = $('#bookingForm');
  if (bf) bf.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(bf));
    const res = BookingPages.requestBooking(l.id, d.preferredDate, d.message);   // US-41
    if (!res.ok) { const er = $('.error', bf); er.textContent = res.message; er.hidden = false; return; }
    bf.outerHTML = '<div class="card stack"><h3>Booking request sent</h3><p class="muted">The designer will respond soon. Track it under My Bookings.</p><a class="btn" href="#/my-bookings">View my bookings</a></div>';
  };
};

/* ---------- Company / Portfolio (public view) ---------- */
Pages.company = designerId => {
  const user = Auth.user();
  const r = CompanyController.getCompanyPage(designerId);
  if (!r.ok) return message('Not found', r.message);
  const { company: c, listings } = r.data;
  const favSet = user && user.role === 'CUSTOMER' ? new Set(FavouriteController.getFavourites(user.id).map(l => l.id)) : new Set();
  view('<p><a href="#/">&larr; Back to search</a></p><section class="card stack"><h1>' + esc(c.name) + '</h1><p>' + esc(c.description || 'No description yet.') + '</p>' +
    '<div class="info"><span>Address: ' + esc(c.address || '-') + '</span><span>Phone: ' + esc(c.phone || '-') + '</span><span>Email: ' + esc(c.email || '-') + '</span><span>Website: ' + esc(c.website || '-') + '</span><span>Established: ' + esc(c.yearEstablished || '-') + '</span></div></section>' +
    '<h2>Portfolio (' + listings.length + ')</h2><div id="results">' + (listings.length ? '<div class="grid">' + listings.map(l => listingCard(l, user, favSet)).join('') + '</div>' : '<p class="muted">No published projects yet.</p>') + '</div>');
  if (user && user.role === 'CUSTOMER') bindFavs($('#results'), user, () => Pages.company(designerId));
};

/* ---------- Registration / Login Page (US-01) ---------- */
Pages.register = () => {
  view('<form id="regForm" class="card narrow stack"><h2>Create your account</h2>' +
    '<label>Full name<input name="name" required></label><label>Email<input type="email" name="email" required></label>' +
    '<label>Password (8+ characters)<input type="password" name="password" minlength="8" required></label>' +
    '<p class="muted small">This creates a customer account. Interior Designer accounts are created by a User Admin.</p>' +
    '<p class="error" hidden></p><button class="btn">Register</button><p class="muted small">Already registered? <a href="#/login">Log in</a></p></form>');
  const f = $('#regForm');
  f.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const r = RegistrationLoginPage.register(d.name, d.email, d.password);   // US-01
    if (!r.ok) { const er = $('.error', f); er.textContent = r.message; er.hidden = false; return; }
    f.outerHTML = '<section class="card narrow center stack"><h2>Registration successful</h2><p class="muted">Your account is ready. You can log in now.</p><a class="btn" href="#/login">Log in</a></section>';
  };
};

Pages.login = () => {
  const demo = [['Customer', 'customer1@example.com'], ['Interior Designer', 'designer1@example.com'], ['User Admin', 'admin1@example.com'], ['Platform Management', 'platform1@example.com']];
  view('<div class="split"><form id="loginForm" class="card stack"><h2>Log in</h2><label>Email<input type="email" name="email" required></label>' +
    '<label>Password<input type="password" name="password" required></label><p class="error" hidden></p><button class="btn">Log in</button>' +
    '<p class="muted small">New here? <a href="#/register">Create an account</a></p></form>' +
    '<div class="card stack"><h3>Demo accounts</h3><p class="muted small">Password for all: <code>' + DEMO_PASSWORD + '</code>. Click a row to fill the form.</p>' +
    '<table class="table">' + demo.map(d => '<tr class="clickable" data-email="' + d[1] + '"><td>' + d[0] + '</td><td>' + d[1] + '</td></tr>').join('') + '</table></div></div>');
  const f = $('#loginForm');
  $$('[data-email]').forEach(tr => tr.onclick = () => { f.email.value = tr.dataset.email; f.password.value = DEMO_PASSWORD; });
  f.onsubmit = e => {
    e.preventDefault();
    const r = AuthController.login(f.email.value, f.password.value);
    if (!r.ok) { const er = $('.error', f); er.textContent = r.message; er.hidden = false; return; }
    Auth.login(r.data); toast('Welcome back, ' + r.data.name);
    location.hash = { CUSTOMER: '#/', DESIGNER: '#/designer', ADMIN: '#/admin/users', PLATFORM: '#/platform/reports' }[r.data.role];
    renderNav();
  };
};

/* ---------- shared: profile ---------- */
Pages.profile = () => {
  const user = Auth.user();
  view('<h1>My profile</h1><div class="split">' + profileCard(user) +
    '<form id="pwForm" class="card stack"><h3>Change password</h3><label>Current password<input type="password" name="current" required></label><label>New password<input type="password" name="next" minlength="8" required></label><p class="error" hidden></p><button class="btn">Change password</button></form></div>');
  const show = (f, r) => { const er = $('.error', f); er.textContent = r.message; er.hidden = r.ok; };
  $('#profileForm').onsubmit = e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f));
    const r = AuthController.updateProfile(user.id, d.name); show(f, r); if (r.ok) { toast(r.message); renderNav(); }
  };
  $('#pwForm').onsubmit = e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f));
    const r = AuthController.changePassword(user.id, d.current, d.next); show(f, r); if (r.ok) { toast(r.message); f.reset(); }
  };
};

/* ---------- Customer: favourites (brief item 4) and booking status (US-43) ---------- */
Pages.favourites = () => {
  const user = Auth.user();
  const items = FavouriteController.getFavourites(user.id);
  view('<h1>My favourites</h1>' + (items.length ? '<div id="results"><div class="grid">' + items.map(l => listingCard(l, user, new Set(items.map(i => i.id)))).join('') + '</div></div>'
    : '<div class="card center"><p>You have not saved any projects yet.</p><a class="btn" href="#/">Browse projects</a></div>'));
  if (items.length) bindFavs($('#results'), user, Pages.favourites);
};

function notesHtml(b) {
  return b.progressNotes.length ? '<ul class="notes">' + b.progressNotes.map(n => '<li><span class="muted small">' + fmtDateTime(n.at) + '</span> ' + esc(n.note) + '</li>').join('') + '</ul>' : '<span class="muted small">No notes yet</span>';
}
Pages.myBookings = () => {
  const user = Auth.user();
  const items = BookingPages.viewStatus();   // US-43
  view('<h1>My bookings</h1>' + (items.length ? '<div class="card scroll"><table class="table"><thead><tr><th>Project</th><th>Company</th><th>Preferred date</th><th>Status</th><th>Progress notes</th></tr></thead><tbody>' +
    items.map(b => '<tr><td><a href="#/listing/' + b.listingId + '">' + esc(b.listingTitle) + '</a></td><td>' + esc(b.companyName) + '</td><td>' + esc(b.preferredDate) + '</td><td>' + badge(b.status) + '</td><td>' + notesHtml(b) + '</td></tr>').join('') + '</tbody></table></div>'
    : '<div class="card center"><p>No bookings yet.</p><a class="btn" href="#/">Find a designer</a></div>'));
};

/* ---------- Interior Designer: dashboard (brief item 5) ---------- */
Pages.designerDashboard = () => {
  const user = Auth.user();
  const ls = DesignerWorkspaceController.getMyListings(user.id), bookings = DesignerWorkspaceController.getDesignerBookings(user.id);
  const views = ls.reduce((s, l) => s + l.viewCount, 0), saves = ls.reduce((s, l) => s + l.shortlistCount, 0);
  const maxV = Math.max(1, ...ls.map(l => l.viewCount));
  view('<h1>Dashboard</h1><div class="cards">' +
    [['Projects', ls.length], ['Published', ls.filter(l => l.status === 'PUBLISHED').length], ['Total views', views], ['Times shortlisted', saves], ['Pending requests', bookings.filter(b => b.status === 'PENDING').length]]
      .map(c => '<div class="card stat"><b>' + c[1] + '</b><span>' + c[0] + '</span></div>').join('') + '</div>' +
    '<h2>Interest in your projects</h2><div class="card scroll">' + (ls.length ? '<table class="table"><thead><tr><th>Project</th><th>Status</th><th>Views</th><th>Shortlisted</th><th>Bookings</th></tr></thead><tbody>' +
      ls.sort((a, b) => b.viewCount - a.viewCount).map(l => '<tr><td><a href="#/listing/' + l.id + '">' + esc(l.title) + '</a></td><td>' + badge(l.status) + '</td><td><div class="meter"><i style="width:' + (l.viewCount / maxV * 100) + '%"></i></div> ' + l.viewCount + '</td><td>' + l.shortlistCount + '</td><td>' + l.bookingCount + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="center muted">No projects yet. <a href="#/designer/listings/new">Add your first project</a>.</p>') + '</div>');
};

/* ---------- Interior Designer: portfolio (US-14, US-16; Company / Portfolio Pages) ---------- */
Pages.designerListings = () => {
  const user = Auth.user();
  const ls = DesignerWorkspaceController.getMyListings(user.id);
  view('<div class="row between wrap"><h1>My portfolio</h1><a class="btn" href="#/designer/listings/new">+ Add project</a></div><div class="card scroll">' +
    (ls.length ? '<table class="table"><thead><tr><th>Project</th><th>Category</th><th>Type</th><th>Status</th><th>Views</th><th>Shortlisted</th><th></th></tr></thead><tbody>' +
      ls.map(l => '<tr><td>' + (l.status === 'PUBLISHED' ? '<a href="#/listing/' + l.id + '">' + esc(l.title) + '</a>' : esc(l.title)) + '</td><td>' + esc(l.categoryName) + '</td><td>' + (l.projectState === 'CURRENT' ? 'Current' : 'Past') + '</td><td>' + badge(l.status) + '</td><td>' + l.viewCount + '</td><td>' + l.shortlistCount + '</td>' +
        '<td class="actions"><a class="btn small ghost" href="#/designer/listings/' + l.id + '/edit">Edit</a>' +
        (l.status === 'PUBLISHED' ? '<button class="btn small ghost" data-status="ARCHIVED" data-id="' + l.id + '">Archive</button>' : '<button class="btn small" data-status="PUBLISHED" data-id="' + l.id + '">Publish</button>') + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="center muted">No projects yet.</p>') + '</div>');
  $$('[data-status]').forEach(b => b.onclick = () => { const r = DesignerWorkspaceController.setListingStatus(b.dataset.id, user.id, b.dataset.status); toast(r.message, r.ok ? 'ok' : 'err'); Pages.designerListings(); });
};

Pages.designerListingForm = id => {
  const user = Auth.user();
  let l = { title: '', description: '', categoryId: '', style: '', projectState: 'PAST', minBudget: '', maxBudget: '', status: 'DRAFT' };
  if (id) { l = DesignerWorkspaceController.getMyListings(user.id).find(x => x.id === +id); if (!l) return message('Not found', 'You can only edit your own projects.', '<a class="btn" href="#/designer/listings">Back</a>'); }
  const cats = CategoryController.list().filter(c => c.status === 'ACTIVE' || c.id === l.categoryId).map(c => [c.id, c.name]);
  view('<p><a href="#/designer/listings">&larr; Back to portfolio</a></p><form id="lf" class="card narrow stack"><h2>' + (id ? 'Edit project' : 'Add project') + '</h2>' +
    '<label>Title<input name="title" value="' + esc(l.title) + '" required></label><label>Description<textarea name="description" rows="5" required>' + esc(l.description) + '</textarea></label>' +
    '<div class="row gap"><label class="grow">Category<select name="categoryId" required><option value="">Choose...</option>' + options(cats, l.categoryId) + '</select></label>' +
    '<label class="grow">Style<select name="style" required><option value="">Choose...</option>' + options(STYLES, l.style) + '</select></label></div>' +
    '<div class="row gap"><label class="grow">Project type<select name="projectState">' + options([['PAST', 'Past (completed)'], ['CURRENT', 'Current (in progress)']], l.projectState) + '</select></label>' +
    '<label class="grow">Status<select name="status">' + options([['DRAFT', 'Draft (hidden)'], ['PUBLISHED', 'Published'], ['ARCHIVED', 'Archived (hidden)']], l.status) + '</select></label></div>' +
    '<div class="row gap"><label class="grow">Min budget ($)<input type="number" min="0" name="minBudget" value="' + esc(l.minBudget) + '" required></label><label class="grow">Max budget ($)<input type="number" min="0" name="maxBudget" value="' + esc(l.maxBudget) + '" required></label></div>' +
    '<p class="error" hidden></p><button class="btn">' + (id ? 'Save changes' : 'Create project') + '</button></form>');
  const f = $('#lf');
  f.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const r = id ? CompanyPortfolioPages.editListing(id, d.title, d.description, d.categoryId, d.style, d.minBudget, d.maxBudget, d.status)             // US-16
      : CompanyPortfolioPages.createListing(d.title, d.description, d.categoryId, d.style, d.minBudget, d.maxBudget, d.status);                          // US-14
    if (r.ok) DesignerWorkspaceController.setProjectState(id || r.data.id, user.id, d.projectState);   // current / past flag (brief item 3, not on the diagrams)
    if (!r.ok) { const er = $('.error', f); er.textContent = r.message; er.hidden = false; return; }
    toast(r.message); location.hash = '#/designer/listings';
  };
};

/* ---------- Interior Designer: bookings (US-47, US-48) ---------- */
let designerBookingFilter = '';
Pages.designerBookings = () => {
  const user = Auth.user();
  const all = DesignerWorkspaceController.getDesignerBookings(user.id);
  const items = designerBookingFilter ? all.filter(b => b.status === designerBookingFilter) : all;
  view('<div class="row between wrap"><h1>Booking requests</h1><label class="inline">Show <select id="bf"><option value="">All</option>' + options(BOOKING_STATUSES.map(s => [s, label(s)]), designerBookingFilter) + '</select></label></div><div class="card scroll">' +
    (items.length ? '<table class="table"><thead><tr><th>Customer</th><th>Project</th><th>Preferred date</th><th>Message</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>' +
      items.map(b => '<tr><td>' + esc(b.customerName) + '<br><span class="muted small">' + esc(b.customerEmail) + '</span></td><td><a href="#/listing/' + b.listingId + '">' + esc(b.listingTitle) + '</a></td><td>' + esc(b.preferredDate) + '</td><td class="msg">' + esc(b.message) + '</td><td>' + badge(b.status) + '</td><td>' + notesHtml(b) + '</td><td class="actions">' +
        (b.status === 'PENDING' ? '<button class="btn small" data-decide="ACCEPT" data-id="' + b.id + '">Accept</button><button class="btn small danger" data-decide="DECLINE" data-id="' + b.id + '">Decline</button>'
          : ['CONFIRMED', 'IN_PROGRESS'].includes(b.status) ? '<button class="btn small ghost" data-update="' + b.id + '" data-current="' + b.status + '">Update</button>' : '') + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="center muted">No bookings to show.</p>') + '</div>');
  $('#bf').onchange = e => { designerBookingFilter = e.target.value; Pages.designerBookings(); };
  $$('[data-decide]').forEach(b => b.onclick = () => { const r = BookingPages.acceptOrDecline(b.dataset.id, b.dataset.decide); toast(r.message, r.ok ? 'ok' : 'err'); Pages.designerBookings(); });   // US-47
  $$('[data-update]').forEach(b => b.onclick = () => openModal('Update booking progress',
    '<label>Status<select name="status">' + options(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(s => [s, label(s)]), b.dataset.current) + '</select></label><label>Progress note<textarea name="note" rows="3" placeholder="e.g. Carpentry works started"></textarea></label>',
    d => { const r = BookingPages.updateProgress(b.dataset.update, d.status, d.note); if (r.ok) { toast(r.message); Pages.designerBookings(); } return r; }));   // US-48
};

/* ---------- Interior Designer: company information (brief item 2) ---------- */
Pages.designerCompany = () => {
  const user = Auth.user(), c = CompanyController.getCompany(user.id);
  view('<h1>Company information</h1><form id="cf" class="card narrow stack"><label>Company name<input name="name" value="' + esc(c.name) + '" required></label>' +
    '<label>About the company<textarea name="description" rows="4">' + esc(c.description) + '</textarea></label><label>Address<input name="address" value="' + esc(c.address) + '"></label>' +
    '<div class="row gap"><label class="grow">Phone<input name="phone" value="' + esc(c.phone) + '"></label><label class="grow">Email<input type="email" name="email" value="' + esc(c.email) + '"></label></div>' +
    '<div class="row gap"><label class="grow">Website<input name="website" value="' + esc(c.website) + '"></label><label class="grow">Year established<input type="number" name="yearEstablished" value="' + esc(c.yearEstablished) + '"></label></div>' +
    '<p class="error" hidden></p><div class="row gap"><button class="btn">Save</button><a class="btn ghost" href="#/company/' + user.id + '">Preview public page</a></div></form>');
  const f = $('#cf');
  f.onsubmit = e => {
    e.preventDefault();
    const r = CompanyController.saveCompany(user.id, Object.fromEntries(new FormData(f)));
    const er = $('.error', f); er.textContent = r.message; er.hidden = r.ok; if (r.ok) toast(r.message);
  };
};

/* ---------- User Admin: manage accounts (brief item 1) ---------- */
const adminState = { keyword: '', role: '', status: '', page: 1 };
Pages.adminUsers = () => {
  const me = Auth.user();
  const roles = [['ADMIN', 'User Admin'], ['DESIGNER', 'Interior Designer'], ['CUSTOMER', 'Customer'], ['PLATFORM', 'Platform Management']];
  view('<div class="row between wrap"><h1>User accounts</h1><button class="btn" id="newUser">+ New account</button></div>' +
    '<form id="uf" class="filters card"><label class="grow">Search<input name="keyword" placeholder="Name or email" value="' + esc(adminState.keyword) + '"></label>' +
    '<label>Role<select name="role"><option value="">All</option>' + options(roles, adminState.role) + '</select></label>' +
    '<label>Status<select name="status"><option value="">All</option>' + options(['ACTIVE', 'SUSPENDED'], adminState.status) + '</select></label></form><div id="ulist"></div>');
  const roleName = Object.fromEntries(roles);
  const render = () => {
    const items = AdminController.listUsers(adminState), p = paginate(items, adminState.page, 15); adminState.page = p.page;
    $('#ulist').innerHTML = '<p class="muted">' + items.length + ' account(s)</p><div class="card scroll"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>' +
      p.items.map(u => '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td>' + esc(roleName[u.role]) + '</td><td>' + badge(u.status) + '</td><td>' + fmtDate(u.createdAt) + '</td><td class="actions"><button class="btn small ghost" data-edit="' + u.id + '">Edit</button>' +
        (u.id !== me.id ? '<button class="btn small ' + (u.status === 'ACTIVE' ? 'danger' : '') + '" data-toggle="' + u.id + '">' + (u.status === 'ACTIVE' ? 'Suspend' : 'Activate') + '</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' + pager(p);
  };
  $('#uf').addEventListener('input', e => { adminState[e.target.name] = e.target.value; adminState.page = 1; render(); });
  $('#uf').addEventListener('submit', e => e.preventDefault());
  $('#ulist').addEventListener('click', e => {
    const pg = e.target.closest('[data-page]'), ed = e.target.closest('[data-edit]'), tg = e.target.closest('[data-toggle]');
    if (pg && !pg.disabled) { adminState.page = +pg.dataset.page; render(); }
    if (tg) { const u = AdminController.listUsers().find(x => x.id === +tg.dataset.toggle), r = AdminController.setStatus(me.id, u.id, u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'); toast(r.message, r.ok ? 'ok' : 'err'); render(); }
    if (ed) {
      const u = AdminController.listUsers().find(x => x.id === +ed.dataset.edit);
      openModal('Edit account', '<label>Name<input name="name" value="' + esc(u.name) + '" required></label><p class="muted small">' + esc(u.email) + '</p>' +
        '<label>Role<select name="role">' + options(roles, u.role) + '</select></label><label>Status<select name="status">' + options(['ACTIVE', 'SUSPENDED'], u.status) + '</select></label>',
        d => { const r = AdminController.updateUser(me.id, u.id, d); if (r.ok) { toast(r.message); render(); } return r; });
    }
  });
  $('#newUser').onclick = () => openModal('New account', '<label>Name<input name="name" required></label><label>Email<input type="email" name="email" required></label><label>Temporary password<input type="password" name="password" minlength="8" required></label>' +
    '<label>Role<select name="role">' + options(roles, 'CUSTOMER') + '</select></label>',
    d => { const r = AdminController.createUser(d); if (r.ok) { toast(r.message); render(); } return r; }, 'Create');
  render();
};

/* ---------- Platform Management: categories (brief item 6) ---------- */
Pages.platformCategories = () => {
  const items = CategoryController.list();
  view('<div class="row between wrap"><h1>Project categories</h1><button class="btn" id="newCat">+ New category</button></div><div class="card scroll"><table class="table"><thead><tr><th>Name</th><th>Description</th><th>Projects</th><th>Status</th><th></th></tr></thead><tbody>' +
    items.map(c => '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.description) + '</td><td>' + c.listingCount + '</td><td>' + badge(c.status) + '</td><td class="actions"><button class="btn small ghost" data-edit="' + c.id + '">Edit</button><button class="btn small danger" data-del="' + c.id + '">Delete</button></td></tr>').join('') + '</tbody></table></div>');
  const catForm = c => '<label>Name<input name="name" value="' + esc(c ? c.name : '') + '" required></label><label>Description<input name="description" value="' + esc(c ? c.description : '') + '"></label>' +
    (c ? '<label>Status<select name="status">' + options(['ACTIVE', 'INACTIVE'], c.status) + '</select></label>' : '');
  $('#newCat').onclick = () => openModal('New category', catForm(), d => { const r = CategoryController.create(d.name, d.description); if (r.ok) { toast(r.message); Pages.platformCategories(); } return r; }, 'Add');
  $$('[data-edit]').forEach(b => b.onclick = () => { const c = CategoryController.list().find(x => x.id === +b.dataset.edit); openModal('Edit category', catForm(c), d => { const r = CategoryController.update(c.id, d.name, d.description, d.status); if (r.ok) { toast(r.message); Pages.platformCategories(); } return r; }); });
  $$('[data-del]').forEach(b => b.onclick = () => confirmBox('Delete this category?', () => { const r = CategoryController.remove(b.dataset.del); toast(r.message, r.ok ? 'ok' : 'err'); Pages.platformCategories(); }, 'Delete'));
};

/* ---------- Platform Management: reports (brief item 6) ---------- */
const reportState = { period: 'weekly', metric: 'views' };
Pages.platformReports = () => {
  const r = ReportController.generate(reportState.period).data;
  const metrics = [['views', 'Views'], ['shortlists', 'Shortlists'], ['bookings', 'Bookings'], ['listings', 'New projects'], ['users', 'New users']];
  const labelEvery = { daily: 3, weekly: 1, monthly: 4 }[reportState.period];
  const max = Math.max(1, ...r.buckets.map(b => b[reportState.metric]));
  view('<div class="row between wrap"><h1>Reports</h1><div class="row gap"><div class="tabs">' + [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(p => '<button class="' + (p[0] === reportState.period ? 'on' : '') + '" data-period="' + p[0] + '">' + p[1] + '</button>').join('') + '</div><button class="btn ghost" id="csv">Export CSV</button></div></div>' +
    '<p class="muted">' + fmtDateTime(r.start) + ' to ' + fmtDateTime(r.end) + (reportState.period === 'daily' ? ' (last 24 hours, by hour)' : reportState.period === 'weekly' ? ' (last 7 days)' : ' (last 30 days)') + '</p>' +
    '<div class="cards">' + metrics.map(m => '<button class="card stat metric' + (m[0] === reportState.metric ? ' on' : '') + '" data-metric="' + m[0] + '"><b>' + r.totals[m[0]] + '</b><span>' + m[1] + '</span></button>').join('') + '</div>' +
    '<section class="card"><h3>' + esc(metrics.find(m => m[0] === reportState.metric)[1]) + ' over time</h3><div class="chart">' +
    r.buckets.map((b, i) => '<div class="bar" title="' + esc(b.label) + ': ' + b[reportState.metric] + '"><u>' + (reportState.period === 'weekly' ? b[reportState.metric] : '') + '</u><i style="height:' + (b[reportState.metric] / max * 100) + '%"></i><em>' + (i % labelEvery === 0 ? esc(b.label) : '') + '</em></div>').join('') + '</div></section>' +
    '<div class="split"><section class="card"><h3>Top projects by views</h3>' + (r.topListings.length ? '<table class="table"><tbody>' + r.topListings.map(l => '<tr><td><a href="#/listing/' + l.id + '">' + esc(l.title) + '</a><br><span class="muted small">' + esc(l.companyName) + '</span></td><td>' + l.periodViews + ' views</td></tr>').join('') + '</tbody></table>' : '<p class="muted">No views in this period.</p>') + '</section>' +
    '<section class="card"><h3>Views by category</h3>' + (r.categoryViews.length ? '<table class="table"><tbody>' + r.categoryViews.map(c => '<tr><td>' + esc(c[0]) + '</td><td>' + c[1] + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">No views in this period.</p>') +
    '<h3>New accounts by role</h3><table class="table"><tbody>' + Object.entries(r.newUsersByRole).map(e => '<tr><td>' + esc(label(e[0])) + '</td><td>' + e[1] + '</td></tr>').join('') + '</tbody></table></section></div>');
  $$('[data-period]').forEach(b => b.onclick = () => { reportState.period = b.dataset.period; Pages.platformReports(); });
  $$('[data-metric]').forEach(b => b.onclick = () => { reportState.metric = b.dataset.metric; Pages.platformReports(); });
  $('#csv').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ReportController.toCSV(r)], { type: 'text/csv' }));
    a.download = 'report-' + reportState.period + '.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
};
