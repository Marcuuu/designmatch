/* entities.js - ENTITY layer (stored data).
   The three diagram entities (UserAccount, Listing, Booking) match the class diagram exactly:
   same fields, same method names, same parameter order.
   Everything marked EXTENSION is needed by the brief but is not on the diagrams, and lives in its own object. */

const DB = {
  KEY: 'designmatch_db_v2',
  data: null,
  load() {
    const raw = localStorage.getItem(this.KEY);
    if (raw) { try { this.data = JSON.parse(raw); return; } catch (e) { /* fall through to reset */ } }
    this.reset();
  },
  reset() { this.data = generateSeedData(); this.save(); },
  save() { localStorage.setItem(this.KEY, JSON.stringify(this.data)); },
  nextId(table) { return this.data[table].reduce((m, r) => Math.max(m, r.id || 0), 0) + 1; }
};

/* ===== «entity» UserAccount: id, name, email, passwordHash, role, status, createdAt ===== */
const UserAccount = {
  create(name, email, passwordHash, role, status) {
    if (this.findByEmail(email)) return null;               // emails are unique; the controller reports the failure
    const u = { id: DB.nextId('users'), name, email: String(email).toLowerCase(), passwordHash, role, status, createdAt: Date.now() };
    DB.data.users.push(u); DB.save(); return u;
  },
  // --- additional finders/updates (not on the class diagram) ---
  all() { return DB.data.users; },
  findById(id) { return DB.data.users.find(u => u.id === +id); },
  findByEmail(email) { email = String(email).toLowerCase(); return DB.data.users.find(u => u.email === email); },
  update(id, fields) { const u = this.findById(id); if (u) { Object.assign(u, fields); DB.save(); } return u; }
};

/* ===== «entity» Listing: id, designerId, categoryId, title, description, style, minBudget, maxBudget, status, viewCount, createdAt ===== */
const Listing = {
  create(designerId, categoryId, title, description, style, minBudget, maxBudget, status, createdAt = Date.now()) {
    const l = { id: DB.nextId('listings'), designerId: +designerId, categoryId: +categoryId, title, description, style, minBudget: +minBudget, maxBudget: +maxBudget, status, viewCount: 0, createdAt };
    DB.data.listings.push(l); DB.save(); return this._view(l);
  },
  update(listingId, categoryId, title, description, style, minBudget, maxBudget, status) {
    const l = this._raw(listingId); if (!l) return null;
    Object.assign(l, { categoryId: +categoryId, title, description, style, minBudget: +minBudget, maxBudget: +maxBudget, status });
    DB.save(); return this._view(l);
  },
  findById(listingId) { const l = this._raw(listingId); return l ? this._view(l) : null; },
  searchByKeyword(keyword, status) {
    const k = String(keyword || '').trim().toLowerCase();
    return DB.data.listings.filter(l => !status || l.status === status).map(l => this._view(l))
      .filter(v => !k || [v.title, v.description, v.style, v.categoryName, v.companyName].join(' ').toLowerCase().includes(k));
  },
  recordView(listingId) {
    const l = this._raw(listingId); if (!l) return;
    l.viewCount++;
    DB.data.views.push({ listingId: l.id, at: Date.now() });   // log used by the daily/weekly/monthly reports
    DB.save();
  },
  // --- internals and additional finders (not on the class diagram) ---
  _raw(id) { return DB.data.listings.find(l => l.id === +id); },
  /* display copy: the stored fields plus joined values the pages need (company name, category name, shortlist count) */
  _view(l) {
    const cat = Category.findById(l.categoryId), co = Company.findByDesigner(l.designerId), des = UserAccount.findById(l.designerId);
    return Object.assign({}, l, {
      categoryName: cat ? cat.name : 'Uncategorised', company: co || null, companyName: co ? co.name : (des ? des.name : 'Unknown'),
      designerName: des ? des.name : 'Unknown', shortlistCount: Favourite.countForListing(l.id), projectState: ProjectInfo.get(l.id)
    });
  },
  all() { return DB.data.listings; },
  findByDesigner(designerId) { return DB.data.listings.filter(l => l.designerId === +designerId).map(l => this._view(l)); },
  setStatus(listingId, status) { const l = this._raw(listingId); if (l) { l.status = status; DB.save(); } return l; }
};

/* ===== «entity» Booking: id, listingId, customerId, preferredDate, message, status, progressNotes, createdAt ===== */
const Booking = {
  create(customerId, listingId, preferredDate, message, status, createdAt = Date.now()) {
    const b = { id: DB.nextId('bookings'), listingId: +listingId, customerId: +customerId, preferredDate, message, status, progressNotes: [], createdAt };
    DB.data.bookings.push(b); DB.save(); return this._view(b);
  },
  updateStatus(bookingId, status) { const b = this._raw(bookingId); if (b) { b.status = status; DB.save(); } return b ? this._view(b) : null; },
  addNote(bookingId, note) {
    const b = this._raw(bookingId); note = String(note || '').trim();
    if (b && note) { b.progressNotes.push({ note, at: Date.now() }); DB.save(); }
    return b ? this._view(b) : null;
  },
  findByCustomerId(customerId) { return DB.data.bookings.filter(b => b.customerId === +customerId).map(b => this._view(b)); },
  // --- internals and additional finders (not on the class diagram) ---
  _raw(id) { return DB.data.bookings.find(b => b.id === +id); },
  _view(b) {
    const l = Listing._raw(b.listingId), c = UserAccount.findById(b.customerId), co = l && Company.findByDesigner(l.designerId);
    return Object.assign({}, b, { listingTitle: l ? l.title : '(removed)', designerId: l ? l.designerId : null, companyName: co ? co.name : '', customerName: c ? c.name : 'Unknown', customerEmail: c ? c.email : '' });
  },
  all() { return DB.data.bookings; },
  findByDesignerId(designerId) {
    const ids = DB.data.listings.filter(l => l.designerId === +designerId).map(l => l.id);
    return DB.data.bookings.filter(b => ids.includes(b.listingId)).map(b => this._view(b));
  }
};

/* ===== EXTENSIONS required by the brief (not on the diagrams) ===== */
const Company = {            // brief item 2: ID manages company information
  findByDesigner(designerId) { return DB.data.companies.find(c => c.designerId === +designerId); },
  save(designerId, fields) {
    let c = this.findByDesigner(designerId);
    if (!c) { c = { id: DB.nextId('companies'), designerId: +designerId }; DB.data.companies.push(c); }
    Object.assign(c, fields); DB.save(); return c;
  }
};
const Category = {           // brief item 6: platform management manages categories
  all() { return DB.data.categories; },
  findById(id) { return DB.data.categories.find(c => c.id === +id); },
  create(name, description) { const c = { id: DB.nextId('categories'), name, description, status: 'ACTIVE' }; DB.data.categories.push(c); DB.save(); return c; },
  update(id, fields) { const c = this.findById(id); if (c) { Object.assign(c, fields); DB.save(); } return c; },
  remove(id) { DB.data.categories = DB.data.categories.filter(c => c.id !== +id); DB.save(); }
};
const Favourite = {          // brief items 4 and 5: customers save projects; designers see shortlist counts
  find(customerId, listingId) { return DB.data.favourites.find(f => f.customerId === +customerId && f.listingId === +listingId); },
  add(customerId, listingId) { const f = { id: DB.nextId('favourites'), customerId: +customerId, listingId: +listingId, createdAt: Date.now() }; DB.data.favourites.push(f); DB.save(); return f; },
  remove(customerId, listingId) { DB.data.favourites = DB.data.favourites.filter(f => !(f.customerId === +customerId && f.listingId === +listingId)); DB.save(); },
  findByCustomerId(customerId) { return DB.data.favourites.filter(f => f.customerId === +customerId); },
  countForListing(listingId) { return DB.data.favourites.filter(f => f.listingId === +listingId).length; }
};
const ProjectInfo = {        // brief item 3: current vs past projects (kept outside the Listing entity so Listing matches the diagram)
  get(listingId) { const p = DB.data.projectInfo.find(x => x.listingId === +listingId); return p ? p.projectState : 'PAST'; },
  set(listingId, projectState) {
    let p = DB.data.projectInfo.find(x => x.listingId === +listingId);
    if (!p) { p = { listingId: +listingId }; DB.data.projectInfo.push(p); }
    p.projectState = projectState; DB.save();
  }
};
