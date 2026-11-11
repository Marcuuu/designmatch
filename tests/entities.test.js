import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

let app;
beforeEach(() => { app = loadApp(); });

describe('UserAccount', () => {
  it('create stores a user with a new id and a lowercase email', () => {
    const before = app.UserAccount.all().length;
    const u = app.UserAccount.create('Sam Lee', 'Sam.Lee@Example.COM', 'h123', 'CUSTOMER', 'ACTIVE');
    expect(u).toMatchObject({ name: 'Sam Lee', email: 'sam.lee@example.com', passwordHash: 'h123', role: 'CUSTOMER', status: 'ACTIVE' });
    expect(u.id).toBe(Math.max(...app.UserAccount.all().map((x) => x.id)));
    expect(app.UserAccount.all()).toHaveLength(before + 1);
    expect(typeof u.createdAt).toBe('number');
  });

  it('create returns null and stores nothing when the email already exists (any letter case)', () => {
    const before = app.UserAccount.all().length;
    expect(app.UserAccount.create('Dup', 'CUSTOMER1@example.com', 'h', 'CUSTOMER', 'ACTIVE')).toBeNull();
    expect(app.UserAccount.all()).toHaveLength(before);
  });

  it('finds users by id and by email, and updates them', () => {
    const u = app.firstUser('CUSTOMER');
    expect(app.UserAccount.findById(u.id)).toBe(u);
    expect(app.UserAccount.findByEmail(u.email.toUpperCase())).toBe(u);
    expect(app.UserAccount.findByEmail('nobody@example.com')).toBeUndefined();
    app.UserAccount.update(u.id, { name: 'Renamed' });
    expect(app.UserAccount.findById(u.id).name).toBe('Renamed');
  });

  it('saves changes to storage so they survive a reload', () => {
    app.UserAccount.create('Persisted', 'persist@example.com', 'h', 'CUSTOMER', 'ACTIVE');
    const saved = JSON.parse(app.storage.getItem(app.DB.KEY));
    expect(saved.users.some((u) => u.email === 'persist@example.com')).toBe(true);
  });
});

describe('Listing', () => {
  const create = (over = {}) => {
    const a = { designerId: app.firstUser('DESIGNER').id, categoryId: 1, title: 'Test Home', description: 'A nice long description', style: 'Japandi', minBudget: 1000, maxBudget: 5000, status: 'PUBLISHED', ...over };
    return app.Listing.create(a.designerId, a.categoryId, a.title, a.description, a.style, a.minBudget, a.maxBudget, a.status);
  };

  it('create stores the listing with zero views and adds display fields to the returned copy', () => {
    const l = create();
    expect(l).toMatchObject({ title: 'Test Home', style: 'Japandi', status: 'PUBLISHED', viewCount: 0, shortlistCount: 0, projectState: 'PAST' });
    expect(l.categoryName).toBe(app.Category.findById(1).name);
    expect(l.companyName).toBe(app.Company.findByDesigner(l.designerId).name);
  });

  it('keeps the stored record limited to the class diagram fields', () => {
    create();
    const stored = app.Listing.all().at(-1);
    expect(Object.keys(stored).sort()).toEqual(['categoryId', 'createdAt', 'description', 'designerId', 'id', 'maxBudget', 'minBudget', 'status', 'style', 'title', 'viewCount']);
  });

  it('converts budgets and ids to numbers', () => {
    const l = create({ minBudget: '1500', maxBudget: '9000', categoryId: '2' });
    expect(l.minBudget).toBe(1500);
    expect(l.maxBudget).toBe(9000);
    expect(l.categoryId).toBe(2);
  });

  it('update changes the fields and returns null for an unknown id', () => {
    const l = create();
    const u = app.Listing.update(l.id, 3, 'New Title', 'Another long description', 'Rustic', 2000, 8000, 'DRAFT');
    expect(u).toMatchObject({ title: 'New Title', categoryId: 3, style: 'Rustic', minBudget: 2000, maxBudget: 8000, status: 'DRAFT' });
    expect(app.Listing.update(99999, 1, 't', 'd', 's', 1, 2, 'DRAFT')).toBeNull();
  });

  it('findById returns null for an unknown id', () => {
    expect(app.Listing.findById(99999)).toBeNull();
    expect(app.Listing.findById(1).id).toBe(1);
  });

  describe('searchByKeyword', () => {
    it('only returns listings with the requested status', () => {
      const res = app.Listing.searchByKeyword('', 'PUBLISHED');
      expect(res).toHaveLength(85);
      res.forEach((l) => expect(l.status).toBe('PUBLISHED'));
      expect(app.Listing.searchByKeyword('', 'DRAFT')).toHaveLength(10);
    });

    it('matches the title, ignoring letter case', () => {
      create({ title: 'Zebra Pavilion' });
      const res = app.Listing.searchByKeyword('zEBRA', 'PUBLISHED');
      expect(res).toHaveLength(1);
      expect(res[0].title).toBe('Zebra Pavilion');
    });

    it('matches the company name and the category name', () => {
      const l = app.publishedListing();
      const company = app.Company.findByDesigner(l.designerId).name;
      expect(app.Listing.searchByKeyword(company, 'PUBLISHED').some((x) => x.id === l.id)).toBe(true);
      const cat = app.Category.findById(l.categoryId).name;
      expect(app.Listing.searchByKeyword(cat, 'PUBLISHED').some((x) => x.id === l.id)).toBe(true);
    });

    it('returns an empty list when nothing matches', () => {
      expect(app.Listing.searchByKeyword('qwertyuiop-no-match', 'PUBLISHED')).toEqual([]);
    });
  });

  describe('recordView', () => {
    it('adds one to viewCount and one entry to the view log', () => {
      const l = app.publishedListing();
      const views = app.DB.data.views.length, count = l.viewCount;
      app.Listing.recordView(l.id);
      expect(app.Listing.findById(l.id).viewCount).toBe(count + 1);
      expect(app.DB.data.views).toHaveLength(views + 1);
      expect(app.DB.data.views.at(-1)).toMatchObject({ listingId: l.id });
    });

    it('does nothing for an unknown listing', () => {
      const views = app.DB.data.views.length;
      expect(() => app.Listing.recordView(99999)).not.toThrow();
      expect(app.DB.data.views).toHaveLength(views);
    });
  });
});

describe('Booking', () => {
  it('create stores a booking with no progress notes and returns display fields', () => {
    const c = app.firstUser('CUSTOMER'), l = app.publishedListing();
    const b = app.Booking.create(c.id, l.id, '2030-01-01', 'Hello there', 'PENDING');
    expect(b).toMatchObject({ customerId: c.id, listingId: l.id, preferredDate: '2030-01-01', message: 'Hello there', status: 'PENDING', progressNotes: [] });
    expect(b.listingTitle).toBe(l.title);
    expect(b.customerName).toBe(c.name);
    expect(Object.keys(app.Booking.all().at(-1)).sort()).toEqual(['createdAt', 'customerId', 'id', 'listingId', 'message', 'preferredDate', 'progressNotes', 'status']);
  });

  it('accepts an explicit createdAt (the sequence diagram passes one)', () => {
    const c = app.firstUser('CUSTOMER'), l = app.publishedListing();
    expect(app.Booking.create(c.id, l.id, '2030-01-01', 'Hello there', 'PENDING', 12345).createdAt).toBe(12345);
  });

  it('updateStatus changes the status and returns null for an unknown booking', () => {
    const b = app.Booking.all()[0];
    expect(app.Booking.updateStatus(b.id, 'COMPLETED').status).toBe('COMPLETED');
    expect(app.Booking.updateStatus(99999, 'COMPLETED')).toBeNull();
  });

  it('addNote stores a trimmed note with a time, and ignores blank notes', () => {
    const b = app.Booking.all()[0];
    const n = b.progressNotes.length;
    app.Booking.addNote(b.id, '   Site visit done  ');
    expect(b.progressNotes).toHaveLength(n + 1);
    expect(b.progressNotes.at(-1)).toMatchObject({ note: 'Site visit done' });
    expect(typeof b.progressNotes.at(-1).at).toBe('number');
    app.Booking.addNote(b.id, '   ');
    app.Booking.addNote(b.id, undefined);
    expect(b.progressNotes).toHaveLength(n + 1);
  });

  it('findByCustomerId returns only that customer\'s bookings', () => {
    const b = app.Booking.all()[0];
    const res = app.Booking.findByCustomerId(b.customerId);
    expect(res.length).toBeGreaterThan(0);
    res.forEach((x) => expect(x.customerId).toBe(b.customerId));
  });

  it('findByDesignerId returns bookings for that designer\'s listings only', () => {
    const b = app.Booking.all()[0];
    const designerId = app.Listing.all().find((l) => l.id === b.listingId).designerId;
    const res = app.Booking.findByDesignerId(designerId);
    expect(res.some((x) => x.id === b.id)).toBe(true);
    res.forEach((x) => expect(x.designerId).toBe(designerId));
  });
});

describe('extension entities', () => {
  it('Favourite add, find, count and remove', () => {
    const c = app.firstUser('CUSTOMER'), l = app.publishedListing();
    app.Favourite.remove(c.id, l.id);
    const base = app.Favourite.countForListing(l.id);
    app.Favourite.add(c.id, l.id);
    expect(app.Favourite.find(c.id, l.id)).toBeDefined();
    expect(app.Favourite.countForListing(l.id)).toBe(base + 1);
    expect(app.Listing.findById(l.id).shortlistCount).toBe(base + 1);
    app.Favourite.remove(c.id, l.id);
    expect(app.Favourite.find(c.id, l.id)).toBeUndefined();
    expect(app.Favourite.countForListing(l.id)).toBe(base);
  });

  it('ProjectInfo defaults to PAST and can be changed', () => {
    app.DB.data.projectInfo = [];
    expect(app.ProjectInfo.get(1)).toBe('PAST');
    app.ProjectInfo.set(1, 'CURRENT');
    expect(app.ProjectInfo.get(1)).toBe('CURRENT');
    app.ProjectInfo.set(1, 'PAST');
    expect(app.ProjectInfo.get(1)).toBe('PAST');
    expect(app.DB.data.projectInfo).toHaveLength(1);
  });

  it('Company.save updates an existing company and creates a missing one', () => {
    const d = app.firstUser('DESIGNER');
    app.Company.save(d.id, { name: 'Renamed Studio' });
    expect(app.Company.findByDesigner(d.id).name).toBe('Renamed Studio');
    const companies = app.DB.data.companies.length;
    app.Company.save(424242, { name: 'Brand New' });
    expect(app.DB.data.companies).toHaveLength(companies + 1);
  });

  it('Category create, update and remove', () => {
    const c = app.Category.create('Garden Rooms', 'Conservatories');
    expect(c).toMatchObject({ name: 'Garden Rooms', status: 'ACTIVE' });
    app.Category.update(c.id, { status: 'INACTIVE' });
    expect(app.Category.findById(c.id).status).toBe('INACTIVE');
    app.Category.remove(c.id);
    expect(app.Category.findById(c.id)).toBeUndefined();
  });
});
