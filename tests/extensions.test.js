/* Controllers that are not on the diagrams but are needed by the brief:
   accounts, designer workspace, company info, favourites, categories, reports. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

let app;
beforeEach(() => { app = loadApp(); });

describe('AuthController', () => {
  it('logs in with the right email and password, ignoring letter case and spaces in the email', () => {
    const r = app.AuthController.login('  CUSTOMER1@example.com ', 'password123');
    expect(r.ok).toBe(true);
    expect(r.data.email).toBe('customer1@example.com');
  });
  it('rejects a wrong password and an unknown email with the same message', () => {
    const a = app.AuthController.login('customer1@example.com', 'wrong-password');
    const b = app.AuthController.login('nobody@example.com', 'password123');
    expect(a).toMatchObject({ ok: false, message: 'Incorrect email or password.' });
    expect(b.message).toBe(a.message);
  });
  it('rejects a suspended account', () => {
    const u = app.UserAccount.findByEmail('customer1@example.com');
    app.UserAccount.update(u.id, { status: 'SUSPENDED' });
    expect(app.AuthController.login(u.email, 'password123')).toMatchObject({ ok: false, message: expect.stringMatching(/suspended/i) });
  });
  it('updateProfile changes the name and rejects a short one', () => {
    const u = app.firstUser('CUSTOMER');
    expect(app.AuthController.updateProfile(u.id, 'New Name').ok).toBe(true);
    expect(u.name).toBe('New Name');
    expect(app.AuthController.updateProfile(u.id, 'x').ok).toBe(false);
    expect(u.name).toBe('New Name');
  });
  it('changePassword needs the current password and an 8+ character new one', () => {
    const u = app.firstUser('CUSTOMER');
    expect(app.AuthController.changePassword(u.id, 'wrong', 'newpassword1').ok).toBe(false);
    expect(app.AuthController.changePassword(u.id, 'password123', 'short').ok).toBe(false);
    expect(app.AuthController.changePassword(u.id, 'password123', 'newpassword1').ok).toBe(true);
    expect(app.AuthController.login(u.email, 'newpassword1').ok).toBe(true);
    expect(app.AuthController.login(u.email, 'password123').ok).toBe(false);
  });
});

describe('AdminController (user accounts)', () => {
  const admin = () => app.firstUser('ADMIN');

  it('listUsers filters by role, status and keyword, newest first', () => {
    const designers = app.AdminController.listUsers({ role: 'DESIGNER' });
    expect(designers).toHaveLength(35);
    designers.forEach((u) => expect(u.role).toBe('DESIGNER'));
    for (let i = 1; i < designers.length; i++) expect(designers[i - 1].createdAt).toBeGreaterThanOrEqual(designers[i].createdAt);
    const one = app.AdminController.listUsers({ keyword: 'customer1@example.com' });
    expect(one.map((u) => u.email)).toContain('customer1@example.com');
    app.UserAccount.update(app.firstUser('CUSTOMER').id, { status: 'SUSPENDED' });
    app.AdminController.listUsers({ status: 'SUSPENDED' }).forEach((u) => expect(u.status).toBe('SUSPENDED'));
    expect(app.AdminController.listUsers()).toHaveLength(app.UserAccount.all().length);
  });

  it('createUser makes an account of any type, and a company for designers', () => {
    const r = app.AdminController.createUser({ name: 'Jamie Lim', email: 'jamie@example.com', password: 'password123', role: 'DESIGNER' });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ role: 'DESIGNER', status: 'ACTIVE' });
    expect(app.Company.findByDesigner(r.data.id).name).toBe('Jamie Lim Interiors');
    const c = app.AdminController.createUser({ name: 'Pat Doe', email: 'pat@example.com', password: 'password123', role: 'CUSTOMER' });
    expect(app.Company.findByDesigner(c.data.id)).toBeUndefined();
    expect(app.AuthController.login('jamie@example.com', 'password123').ok).toBe(true);
  });

  it.each([
    ['a short name', { name: 'J' }],
    ['an invalid email', { email: 'nope' }],
    ['a short password', { password: 'short' }],
    ['an invalid role', { role: 'SUPERUSER' }],
    ['a duplicate email', { email: 'admin1@example.com' }],
  ])('createUser rejects %s', (_l, over) => {
    const before = app.UserAccount.all().length;
    expect(app.AdminController.createUser({ name: 'Jamie', email: 'j@example.com', password: 'password123', role: 'CUSTOMER', ...over }).ok).toBe(false);
    expect(app.UserAccount.all()).toHaveLength(before);
  });

  it('updateUser changes name, role and status', () => {
    const u = app.firstUser('CUSTOMER');
    const r = app.AdminController.updateUser(admin().id, u.id, { name: 'Promoted', role: 'DESIGNER', status: 'ACTIVE' });
    expect(r.ok).toBe(true);
    expect(u).toMatchObject({ name: 'Promoted', role: 'DESIGNER' });
    expect(app.Company.findByDesigner(u.id)).toBeDefined();
  });

  it('stops an admin changing their own role or suspending themselves', () => {
    const a = admin();
    expect(app.AdminController.updateUser(a.id, a.id, { name: a.name, role: 'CUSTOMER', status: 'ACTIVE' }).ok).toBe(false);
    expect(app.AdminController.setStatus(a.id, a.id, 'SUSPENDED').ok).toBe(false);
    expect(a).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
  });

  it('setStatus suspends and reactivates another account', () => {
    const u = app.firstUser('CUSTOMER');
    expect(app.AdminController.setStatus(admin().id, u.id, 'SUSPENDED').ok).toBe(true);
    expect(app.AuthController.login(u.email, 'password123').ok).toBe(false);
    expect(app.AdminController.setStatus(admin().id, u.id, 'ACTIVE').ok).toBe(true);
    expect(app.AuthController.login(u.email, 'password123').ok).toBe(true);
  });

  it('updateUser rejects an unknown user, a short name, and an invalid role or status', () => {
    const u = app.firstUser('CUSTOMER');
    expect(app.AdminController.updateUser(admin().id, 99999, { name: 'Ok Name', role: 'CUSTOMER', status: 'ACTIVE' }).ok).toBe(false);
    expect(app.AdminController.updateUser(admin().id, u.id, { name: 'x', role: 'CUSTOMER', status: 'ACTIVE' }).ok).toBe(false);
    expect(app.AdminController.updateUser(admin().id, u.id, { name: 'Ok Name', role: 'BOSS', status: 'ACTIVE' }).ok).toBe(false);
    expect(app.AdminController.updateUser(admin().id, u.id, { name: 'Ok Name', role: 'CUSTOMER', status: 'GONE' }).ok).toBe(false);
  });
});

describe('DesignerWorkspaceController', () => {
  const designerWithListings = () => {
    const owner = app.Listing.all().find((l) => l.status === 'PUBLISHED').designerId;
    return app.UserAccount.findById(owner);
  };

  it('getMyListings returns only the designer\'s listings with interest counts, newest first', () => {
    const d = designerWithListings();
    const res = app.DesignerWorkspaceController.getMyListings(d.id);
    expect(res.length).toBeGreaterThan(0);
    res.forEach((l) => {
      expect(l.designerId).toBe(d.id);
      expect(typeof l.viewCount).toBe('number');
      expect(typeof l.shortlistCount).toBe('number');
      expect(l.bookingCount).toBe(app.Booking.all().filter((b) => b.listingId === l.id).length);
    });
    for (let i = 1; i < res.length; i++) expect(res[i - 1].createdAt).toBeGreaterThanOrEqual(res[i].createdAt);
  });

  it('setListingStatus only works for the owner', () => {
    const d = designerWithListings(), l = app.Listing.all().find((x) => x.designerId === d.id);
    expect(app.DesignerWorkspaceController.setListingStatus(l.id, d.id + 1000, 'ARCHIVED').ok).toBe(false);
    expect(app.DesignerWorkspaceController.setListingStatus(l.id, d.id, 'ARCHIVED').ok).toBe(true);
    expect(l.status).toBe('ARCHIVED');
  });

  it('setProjectState saves current or past for the owner and rejects other values', () => {
    const d = designerWithListings(), l = app.Listing.all().find((x) => x.designerId === d.id);
    expect(app.DesignerWorkspaceController.setProjectState(l.id, d.id, 'CURRENT').ok).toBe(true);
    expect(app.ProjectInfo.get(l.id)).toBe('CURRENT');
    expect(app.DesignerWorkspaceController.setProjectState(l.id, d.id, 'LATER').ok).toBe(false);
    expect(app.DesignerWorkspaceController.setProjectState(l.id, d.id + 1000, 'PAST').ok).toBe(false);
    expect(app.ProjectInfo.get(l.id)).toBe('CURRENT');
  });

  it('getDesignerBookings returns only bookings for that designer, newest first', () => {
    const b = app.Booking.all()[0];
    const did = app.Listing.all().find((l) => l.id === b.listingId).designerId;
    const res = app.DesignerWorkspaceController.getDesignerBookings(did);
    expect(res.some((x) => x.id === b.id)).toBe(true);
    res.forEach((x) => expect(x.designerId).toBe(did));
    for (let i = 1; i < res.length; i++) expect(res[i - 1].createdAt).toBeGreaterThanOrEqual(res[i].createdAt);
  });
});

describe('CompanyController', () => {
  const designer = () => app.firstUser('DESIGNER');
  const ok = { name: 'Studio One', description: 'We design', address: '1 Road', phone: '123', email: 'hi@studio.com', website: 'https://studio.com', yearEstablished: '2010' };

  it('saveCompany stores the details and converts the year to a number', () => {
    const r = app.CompanyController.saveCompany(designer().id, ok);
    expect(r.ok).toBe(true);
    expect(app.CompanyController.getCompany(designer().id)).toMatchObject({ name: 'Studio One', yearEstablished: 2010 });
  });
  it.each([
    ['a missing name', { name: ' ' }],
    ['an invalid email', { email: 'not-an-email' }],
    ['a year before 1900', { yearEstablished: '1850' }],
    ['a year in the future', { yearEstablished: String(new Date().getFullYear() + 1) }],
  ])('saveCompany rejects %s', (_l, over) => {
    const before = app.CompanyController.getCompany(designer().id).name;
    expect(app.CompanyController.saveCompany(designer().id, { ...ok, ...over }).ok).toBe(false);
    expect(app.CompanyController.getCompany(designer().id).name).toBe(before);
  });
  it('saveCompany accepts an empty email and year', () => {
    expect(app.CompanyController.saveCompany(designer().id, { ...ok, email: '', yearEstablished: '' }).ok).toBe(true);
  });
  it('getCompany returns an empty object when there is no company', () => {
    expect(app.CompanyController.getCompany(424242)).toEqual({});
  });
  it('getCompanyPage shows only published listings, and fails for non-designers', () => {
    const d = designer();
    const r = app.CompanyController.getCompanyPage(d.id);
    expect(r.ok).toBe(true);
    r.data.listings.forEach((l) => expect(l.status).toBe('PUBLISHED'));
    expect(app.CompanyController.getCompanyPage(app.firstUser('CUSTOMER').id).ok).toBe(false);
    expect(app.CompanyController.getCompanyPage(99999).ok).toBe(false);
  });
});

describe('FavouriteController', () => {
  it('toggle saves then removes a favourite', () => {
    const c = app.firstUser('CUSTOMER'), l = app.publishedListing();
    app.Favourite.remove(c.id, l.id);
    expect(app.FavouriteController.toggle(c.id, l.id)).toMatchObject({ ok: true, message: 'Saved to favourites', data: true });
    expect(app.FavouriteController.isFavourite(c.id, l.id)).toBe(true);
    expect(app.FavouriteController.toggle(c.id, l.id)).toMatchObject({ ok: true, message: 'Removed from favourites', data: false });
    expect(app.FavouriteController.isFavourite(c.id, l.id)).toBe(false);
  });
  it('toggle refuses unpublished or unknown listings', () => {
    const c = app.firstUser('CUSTOMER');
    expect(app.FavouriteController.toggle(c.id, app.Listing.all().find((l) => l.status === 'DRAFT').id).ok).toBe(false);
    expect(app.FavouriteController.toggle(c.id, 99999).ok).toBe(false);
  });
  it('getFavourites returns the customer\'s saved listings, newest first', () => {
    const c = app.firstUser('CUSTOMER');
    const [a, b] = app.Listing.all().filter((l) => l.status === 'PUBLISHED').slice(0, 2);
    app.DB.data.favourites = app.DB.data.favourites.filter((f) => f.customerId !== c.id);
    app.Favourite.add(c.id, a.id);
    app.DB.data.favourites.at(-1).createdAt = 1000;
    app.Favourite.add(c.id, b.id);
    app.DB.data.favourites.at(-1).createdAt = 2000;
    expect(app.FavouriteController.getFavourites(c.id).map((l) => l.id)).toEqual([b.id, a.id]);
  });
});

describe('CategoryController', () => {
  it('list includes how many projects use each category', () => {
    const list = app.CategoryController.list();
    expect(list).toHaveLength(12);
    expect(list.reduce((s, c) => s + c.listingCount, 0)).toBe(100);
  });
  it('create adds a category and rejects short or duplicate names (any letter case)', () => {
    expect(app.CategoryController.create('Garden Rooms', 'x').ok).toBe(true);
    expect(app.CategoryController.create('garden rooms', 'x').ok).toBe(false);
    expect(app.CategoryController.create('x', 'x').ok).toBe(false);
  });
  it('update renames and changes status, but not to another category\'s name', () => {
    expect(app.CategoryController.update(1, 'Lounge', 'desc', 'INACTIVE').ok).toBe(true);
    expect(app.Category.findById(1)).toMatchObject({ name: 'Lounge', status: 'INACTIVE' });
    expect(app.CategoryController.update(1, 'Bedroom', 'desc', 'ACTIVE').ok).toBe(false);
    expect(app.CategoryController.update(1, 'Lounge', 'new desc', 'ACTIVE').ok).toBe(true);
  });
  it('remove refuses a category that projects use, and deletes an unused one', () => {
    expect(app.CategoryController.remove(1).ok).toBe(false);
    const c = app.CategoryController.create('Temp', '').data;
    expect(app.CategoryController.remove(c.id).ok).toBe(true);
    expect(app.Category.findById(c.id)).toBeUndefined();
  });
});

describe('ReportController', () => {
  const metrics = ['views', 'shortlists', 'bookings', 'listings', 'users'];

  it('rejects an unknown period', () => {
    expect(app.ReportController.generate('yearly').ok).toBe(false);
  });

  it.each([['daily', 24], ['weekly', 7], ['monthly', 30]])('%s report has %i buckets whose totals add up', (period, n) => {
    const r = app.ReportController.generate(period);
    expect(r.ok).toBe(true);
    const d = r.data;
    expect(d.buckets).toHaveLength(n);
    metrics.forEach((m) => expect(d.totals[m]).toBe(d.buckets.reduce((s, b) => s + b[m], 0)));
    expect(d.end - d.start).toBe(n * (period === 'daily' ? 36e5 : 864e5));
  });

  it('has views in every period from the test data, and larger periods never have fewer', () => {
    const t = (p) => app.ReportController.generate(p).data.totals;
    expect(t('daily').views).toBeGreaterThan(0);
    expect(t('weekly').views).toBeGreaterThanOrEqual(t('daily').views);
    expect(t('monthly').views).toBeGreaterThanOrEqual(t('weekly').views);
  });

  it('lists up to five top listings by views and categories by views', () => {
    const d = app.ReportController.generate('monthly').data;
    expect(d.topListings.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < d.topListings.length; i++) expect(d.topListings[i - 1].periodViews).toBeGreaterThanOrEqual(d.topListings[i].periodViews);
    for (let i = 1; i < d.categoryViews.length; i++) expect(d.categoryViews[i - 1][1]).toBeGreaterThanOrEqual(d.categoryViews[i][1]);
    expect(Object.keys(d.newUsersByRole).sort()).toEqual(['ADMIN', 'CUSTOMER', 'DESIGNER', 'PLATFORM']);
  });

  describe('counts new activity', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.now()); });
    afterEach(() => vi.useRealTimers());

    it('a new view, favourite, booking, listing and user show up in the daily report', () => {
      const before = app.ReportController.generate('daily').data.totals;
      const c = app.firstUser('CUSTOMER'), l = app.publishedListing();
      app.Listing.recordView(l.id);
      app.Favourite.remove(c.id, l.id); app.Favourite.add(c.id, l.id);
      app.BookingController.requestBooking(c.id, l.id, app.futureDate(3), 'Hello there');
      app.ListingController.createListing(l.designerId, 'Fresh Project', 'A long enough description', 1, 'Japandi', '1', '2', 'DRAFT');
      app.AccountController.registerCustomer('New Person', 'new.person@example.com', 'password123');
      vi.advanceTimersByTime(1000);
      const after = app.ReportController.generate('daily').data.totals;
      expect(after.views).toBe(before.views + 1);
      expect(after.shortlists).toBeGreaterThanOrEqual(before.shortlists + 1);
      expect(after.bookings).toBe(before.bookings + 1);
      expect(after.listings).toBe(before.listings + 1);
      expect(after.users).toBe(before.users + 1);
    });
  });

  it('toCSV writes a header row and one row per bucket', () => {
    const report = app.ReportController.generate('weekly').data;
    const lines = app.ReportController.toCSV(report).split('\n');
    expect(lines[0]).toBe('Period,Views,Shortlists,Bookings,New projects,New users');
    expect(lines).toHaveLength(8);
    lines.slice(1).forEach((l) => expect(l.split(',')).toHaveLength(6));
  });
});
