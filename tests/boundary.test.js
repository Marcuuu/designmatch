/* The four «boundary» classes from the class diagram only pass requests on to the controllers,
   adding the logged-in user's id where the controller needs customerId or designerId. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

let app, customer, designer;
beforeEach(() => {
  app = loadApp();
  customer = app.firstUser('CUSTOMER');
  designer = app.firstUser('DESIGNER');
});
const stub = (obj, name) => vi.spyOn(obj, name).mockReturnValue({ ok: true });

describe('RegistrationLoginPage', () => {
  it('register passes name, email and password to AccountController.registerCustomer', () => {
    const spy = stub(app.AccountController, 'registerCustomer');
    app.RegistrationLoginPage.register('Alex', 'a@example.com', 'password123');
    expect(spy).toHaveBeenCalledExactlyOnceWith('Alex', 'a@example.com', 'password123');
  });
  it('returns the controller\'s result', () => {
    expect(app.RegistrationLoginPage.register('Alex', 'a@example.com', 'password123')).toMatchObject({ ok: true, message: 'Registered' });
  });
});

describe('SearchListingDetailsPages', () => {
  it('search passes the keyword to searchPublished', () => {
    const spy = stub(app.DiscoveryController, 'searchPublished');
    app.SearchListingDetailsPages.search('kitchen');
    expect(spy).toHaveBeenCalledExactlyOnceWith('kitchen');
  });
  it('viewDetails passes the listing id to getListingDetails', () => {
    const spy = stub(app.DiscoveryController, 'getListingDetails');
    app.SearchListingDetailsPages.viewDetails(7);
    expect(spy).toHaveBeenCalledExactlyOnceWith(7);
  });
});

describe('BookingPages (uses the logged-in user)', () => {
  beforeEach(() => app.as(customer));

  it('requestBooking adds the customer id', () => {
    const spy = stub(app.BookingController, 'requestBooking');
    app.BookingPages.requestBooking(5, '2030-01-01', 'Hello there');
    expect(spy).toHaveBeenCalledExactlyOnceWith(customer.id, 5, '2030-01-01', 'Hello there');
  });
  it('viewStatus passes the customer id to getBookingStatus', () => {
    const spy = stub(app.BookingController, 'getBookingStatus');
    app.BookingPages.viewStatus();
    expect(spy).toHaveBeenCalledExactlyOnceWith(customer.id);
  });
  it('acceptOrDecline adds the designer id', () => {
    app.as(designer);
    const spy = stub(app.BookingController, 'decideBooking');
    app.BookingPages.acceptOrDecline(9, 'ACCEPT');
    expect(spy).toHaveBeenCalledExactlyOnceWith(9, designer.id, 'ACCEPT');
  });
  it('updateProgress adds the designer id', () => {
    app.as(designer);
    const spy = stub(app.BookingController, 'updateBookingProgress');
    app.BookingPages.updateProgress(9, 'IN_PROGRESS', 'Started');
    expect(spy).toHaveBeenCalledExactlyOnceWith(9, designer.id, 'IN_PROGRESS', 'Started');
  });
});

describe('CompanyPortfolioPages (uses the logged-in designer)', () => {
  beforeEach(() => app.as(designer));

  it('createListing puts the designer id first, then the form values in order', () => {
    const spy = stub(app.ListingController, 'createListing');
    app.CompanyPortfolioPages.createListing('T', 'Description here', 2, 'Japandi', 100, 200, 'DRAFT');
    expect(spy).toHaveBeenCalledExactlyOnceWith(designer.id, 'T', 'Description here', 2, 'Japandi', 100, 200, 'DRAFT');
  });
  it('editListing passes the listing id, then the designer id, then the form values', () => {
    const spy = stub(app.ListingController, 'updateListing');
    app.CompanyPortfolioPages.editListing(4, 'T', 'Description here', 2, 'Japandi', 100, 200, 'DRAFT');
    expect(spy).toHaveBeenCalledExactlyOnceWith(4, designer.id, 'T', 'Description here', 2, 'Japandi', 100, 200, 'DRAFT');
  });
});

describe('end to end through the boundary classes', () => {
  it('a customer registers, searches, views a listing and books it', () => {
    expect(app.RegistrationLoginPage.register('Alex Tan', 'alex.tan@example.com', 'password123').ok).toBe(true);
    const alex = app.UserAccount.findByEmail('alex.tan@example.com');
    app.as(alex);
    const found = app.SearchListingDetailsPages.search('');
    const details = app.SearchListingDetailsPages.viewDetails(found[0].id);
    expect(details.ok).toBe(true);
    expect(app.BookingPages.requestBooking(found[0].id, app.futureDate(7), 'Please contact me').ok).toBe(true);
    const status = app.BookingPages.viewStatus();
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ status: 'PENDING', listingId: found[0].id });
  });

  it('a designer creates a listing, then the customer\'s booking is accepted and progressed', () => {
    app.as(designer);
    const created = app.CompanyPortfolioPages.createListing('Calm Room', 'A long enough description', 1, 'Japandi', '1000', '2000', 'PUBLISHED');
    expect(created.ok).toBe(true);
    app.as(customer);
    const booked = app.BookingPages.requestBooking(created.data.id, app.futureDate(5), 'Hello there');
    app.as(designer);
    expect(app.BookingPages.acceptOrDecline(booked.data.id, 'ACCEPT').ok).toBe(true);
    expect(app.BookingPages.updateProgress(booked.data.id, 'IN_PROGRESS', 'Site visit').ok).toBe(true);
    app.as(customer);
    const mine = app.BookingPages.viewStatus().find((b) => b.id === booked.data.id);
    expect(mine.status).toBe('IN_PROGRESS');
    expect(mine.progressNotes.map((n) => n.note)).toEqual(['Site visit']);
  });
});
