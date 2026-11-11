import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

let app;
beforeEach(() => { app = loadApp(); });

describe('AccountController.registerCustomer (US-01)', () => {
  it('creates an active customer and stores a hashed password', () => {
    const r = app.AccountController.registerCustomer('Alex Tan', 'alex@example.com', 'password123');
    expect(r).toMatchObject({ ok: true, message: 'Registered' });
    const u = app.UserAccount.findByEmail('alex@example.com');
    expect(u).toMatchObject({ name: 'Alex Tan', role: 'CUSTOMER', status: 'ACTIVE' });
    expect(u.passwordHash).toBe(app.hashPassword('password123'));
    expect(u.passwordHash).not.toBe('password123');
  });

  it('trims the name and email', () => {
    app.AccountController.registerCustomer('  Alex Tan ', '  alex2@example.com ', 'password123');
    expect(app.UserAccount.findByEmail('alex2@example.com').name).toBe('Alex Tan');
  });

  it.each([
    ['a short name', ['A', 'a@example.com', 'password123'], /name/i],
    ['an invalid email', ['Alex', 'not-an-email', 'password123'], /valid email/i],
    ['a short password', ['Alex', 'a@example.com', 'short'], /8 characters/i],
    ['an empty password', ['Alex', 'a@example.com', ''], /8 characters/i],
  ])('rejects %s', (_label, args, message) => {
    const before = app.UserAccount.all().length;
    const r = app.AccountController.registerCustomer(...args);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(message);
    expect(app.UserAccount.all()).toHaveLength(before);
  });

  it('rejects an email that is already registered', () => {
    const r = app.AccountController.registerCustomer('Alex', 'Customer1@Example.com', 'password123');
    expect(r).toMatchObject({ ok: false, message: 'That email is already registered.' });
  });
});

describe('DiscoveryController', () => {
  it('searchPublished only returns published listings', () => {
    const res = app.DiscoveryController.searchPublished('');
    expect(res).toHaveLength(85);
    res.forEach((l) => expect(l.status).toBe('PUBLISHED'));
  });

  it('searchPublished filters by keyword', () => {
    const res = app.DiscoveryController.searchPublished('kitchen');
    expect(res.length).toBeGreaterThan(0);
    expect(res.length).toBeLessThan(85);
  });

  it('getListingDetails returns the listing and records one view (US-25, US-33)', () => {
    const l = app.publishedListing();
    const before = l.viewCount, log = app.DB.data.views.length;
    const r = app.DiscoveryController.getListingDetails(l.id);
    expect(r.ok).toBe(true);
    expect(r.data.id).toBe(l.id);
    expect(r.data.company).toBeTruthy();
    expect(l.viewCount).toBe(before + 1);
    expect(r.data.viewCount).toBe(before + 1);
    expect(app.DB.data.views).toHaveLength(log + 1);
  });

  it('getListingDetails refuses draft and archived listings without recording a view', () => {
    const log = app.DB.data.views.length;
    for (const status of ['DRAFT', 'ARCHIVED']) {
      const l = app.Listing.all().find((x) => x.status === status);
      expect(app.DiscoveryController.getListingDetails(l.id)).toMatchObject({ ok: false });
    }
    expect(app.DB.data.views).toHaveLength(log);
  });

  it('getListingDetails refuses an unknown listing', () => {
    expect(app.DiscoveryController.getListingDetails(99999).ok).toBe(false);
  });
});

describe('ListingController (US-14, US-16)', () => {
  const designer = () => app.firstUser('DESIGNER');
  const valid = ['Cosy Loft', 'A long enough description', 1, 'Japandi', '1000', '5000', 'PUBLISHED'];
  const create = (over = {}) => {
    const a = [...valid];
    Object.entries(over).forEach(([i, v]) => { a[i] = v; });
    return app.ListingController.createListing(designer().id, ...a);
  };

  it('createListing creates a listing owned by the designer', () => {
    const r = create();
    expect(r).toMatchObject({ ok: true, message: 'Listing created' });
    expect(r.data).toMatchObject({ title: 'Cosy Loft', designerId: designer().id, status: 'PUBLISHED', minBudget: 1000, maxBudget: 5000 });
    expect(app.Listing.findById(r.data.id)).not.toBeNull();
  });

  it('createListing trims the title and description', () => {
    expect(create({ 0: '  Padded Title  ', 1: '  A long enough description  ' }).data).toMatchObject({ title: 'Padded Title', description: 'A long enough description' });
  });

  it('allows equal minimum and maximum budgets, and a zero minimum', () => {
    expect(create({ 4: '3000', 5: '3000' }).ok).toBe(true);
    expect(create({ 4: '0', 5: '100' }).ok).toBe(true);
  });

  it.each([
    ['a short title', { 0: 'ab' }, /title/i],
    ['a short description', { 1: 'too short' }, /description/i],
    ['an unknown category', { 2: 9999 }, /category/i],
    ['an unknown style', { 3: 'Baroque' }, /style/i],
    ['an empty minimum budget', { 4: '' }, /budget/i],
    ['a negative budget', { 4: '-5' }, /budget/i],
    ['a maximum lower than the minimum', { 4: '9000', 5: '5000' }, /maximum budget/i],
    ['an unknown status', { 6: 'LIVE' }, /status/i],
  ])('createListing rejects %s', (_label, over, message) => {
    const before = app.Listing.all().length;
    const r = create(over);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(message);
    expect(app.Listing.all()).toHaveLength(before);
  });

  it('updateListing changes the listing', () => {
    const l = create().data;
    const r = app.ListingController.updateListing(l.id, designer().id, 'Edited Title', 'Another long description', 2, 'Rustic', '2000', '8000', 'DRAFT');
    expect(r).toMatchObject({ ok: true, message: 'Listing updated' });
    expect(app.Listing.findById(l.id)).toMatchObject({ title: 'Edited Title', categoryId: 2, style: 'Rustic', minBudget: 2000, maxBudget: 8000, status: 'DRAFT' });
  });

  it('updateListing rejects invalid data and leaves the listing unchanged', () => {
    const l = create().data;
    const r = app.ListingController.updateListing(l.id, designer().id, 'x', 'Another long description', 2, 'Rustic', '2000', '8000', 'DRAFT');
    expect(r.ok).toBe(false);
    expect(app.Listing.findById(l.id).title).toBe('Cosy Loft');
  });
});

describe('BookingController', () => {
  const customer = () => app.firstUser('CUSTOMER');

  describe('requestBooking (US-41)', () => {
    it('creates a pending booking', () => {
      const l = app.publishedListing();
      const r = app.BookingController.requestBooking(customer().id, l.id, app.futureDate(10), '  Please call me  ');
      expect(r).toMatchObject({ ok: true, message: 'Booking request sent' });
      expect(r.data).toMatchObject({ customerId: customer().id, listingId: l.id, status: 'PENDING', message: 'Please call me' });
    });

    it('accepts today as the preferred date', () => {
      expect(app.BookingController.requestBooking(customer().id, app.publishedListing().id, app.futureDate(0), 'Hello there').ok).toBe(true);
    });

    it('rejects a past date, a missing date, and a short message', () => {
      const l = app.publishedListing();
      const before = app.Booking.all().length;
      expect(app.BookingController.requestBooking(customer().id, l.id, '2020-01-01', 'Hello there').ok).toBe(false);
      expect(app.BookingController.requestBooking(customer().id, l.id, '', 'Hello there').ok).toBe(false);
      expect(app.BookingController.requestBooking(customer().id, l.id, app.futureDate(3), 'Hi').ok).toBe(false);
      expect(app.Booking.all()).toHaveLength(before);
    });
  });

  it('getBookingStatus returns only the customer\'s bookings (US-43)', () => {
    const c = customer();
    app.BookingController.requestBooking(c.id, app.publishedListing().id, app.futureDate(5), 'Hello there');
    const res = app.BookingController.getBookingStatus(c.id);
    expect(res.length).toBeGreaterThan(0);
    res.forEach((b) => expect(b.customerId).toBe(c.id));
    expect(app.BookingController.getBookingStatus(424242)).toEqual([]);
  });

  describe('decideBooking (US-47)', () => {
    const pending = () => app.Booking.all().find((b) => b.status === 'PENDING');
    it('ACCEPT confirms the booking', () => {
      const b = pending();
      expect(app.BookingController.decideBooking(b.id, 1, 'ACCEPT').ok).toBe(true);
      expect(b.status).toBe('CONFIRMED');
    });
    it('DECLINE cancels the booking', () => {
      const b = pending();
      expect(app.BookingController.decideBooking(b.id, 1, 'DECLINE')).toMatchObject({ ok: true, message: 'Booking declined' });
      expect(b.status).toBe('CANCELLED');
    });
    it('rejects any other decision and changes nothing', () => {
      const b = pending();
      expect(app.BookingController.decideBooking(b.id, 1, 'MAYBE')).toMatchObject({ ok: false, message: 'Invalid decision.' });
      expect(b.status).toBe('PENDING');
    });
  });

  describe('updateBookingProgress (US-48)', () => {
    const confirmed = () => app.Booking.all().find((b) => b.status === 'CONFIRMED');
    it('updates the status and adds the note', () => {
      const b = confirmed(), notes = b.progressNotes.length;
      const r = app.BookingController.updateBookingProgress(b.id, 1, 'IN_PROGRESS', 'Carpentry started');
      expect(r).toMatchObject({ ok: true, message: 'Booking updated' });
      expect(b.status).toBe('IN_PROGRESS');
      expect(b.progressNotes).toHaveLength(notes + 1);
    });
    it('works without a note', () => {
      const b = confirmed(), notes = b.progressNotes.length;
      expect(app.BookingController.updateBookingProgress(b.id, 1, 'COMPLETED', '').ok).toBe(true);
      expect(b.progressNotes).toHaveLength(notes);
    });
    it.each(['PENDING', 'BOGUS', ''])('rejects the status "%s"', (status) => {
      const b = confirmed();
      expect(app.BookingController.updateBookingProgress(b.id, 1, status, 'x')).toMatchObject({ ok: false, message: 'Invalid status.' });
      expect(b.status).toBe('CONFIRMED');
    });
  });
});

describe('Result', () => {
  it('treats a string as the message and an object as the data', () => {
    expect(app.Result(true, 'Done')).toMatchObject({ ok: true, message: 'Done', data: undefined });
    const obj = { id: 1 };
    expect(app.Result(true, obj)).toMatchObject({ ok: true, message: '', data: obj });
    expect(app.Result(true, 'Created', obj)).toMatchObject({ message: 'Created', data: obj });
    expect(app.Result(false, 'Nope').ok).toBe(false);
  });
});
