/* Checks the code against the class diagram and the sequence diagram:
   class names, method names, parameter order, and the exact chain of calls for every user story. */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, paramNames } from './helpers/loadApp.js';

/* class diagram: «class» -> method -> parameters */
const CLASS_DIAGRAM = {
  RegistrationLoginPage: { register: 'name,email,password' },
  SearchListingDetailsPages: { search: 'keyword', viewDetails: 'listingId' },
  CompanyPortfolioPages: {
    createListing: 'title,description,categoryId,style,minBudget,maxBudget,status',
    editListing: 'listingId,title,description,categoryId,style,minBudget,maxBudget,status',
  },
  BookingPages: { requestBooking: 'listingId,preferredDate,message', viewStatus: '', acceptOrDecline: 'bookingId,decision', updateProgress: 'bookingId,newStatus,note' },
  AccountController: { registerCustomer: 'name,email,password' },
  DiscoveryController: { searchPublished: 'keyword', getListingDetails: 'listingId' },
  ListingController: {
    createListing: 'designerId,title,description,categoryId,style,minBudget,maxBudget,status',
    updateListing: 'listingId,designerId,title,description,categoryId,style,minBudget,maxBudget,status',
  },
  BookingController: {
    requestBooking: 'customerId,listingId,preferredDate,message',
    getBookingStatus: 'customerId',
    decideBooking: 'bookingId,designerId,decision',
    updateBookingProgress: 'bookingId,designerId,newStatus,note',
  },
  UserAccount: { create: 'name,email,passwordHash,role,status' },
  Listing: {
    create: 'designerId,categoryId,title,description,style,minBudget,maxBudget,status',
    update: 'listingId,categoryId,title,description,style,minBudget,maxBudget,status',
    findById: 'listingId',
    searchByKeyword: 'keyword,status',
    recordView: 'listingId',
  },
  Booking: { create: 'customerId,listingId,preferredDate,message,status', updateStatus: 'bookingId,status', addNote: 'bookingId,note', findByCustomerId: 'customerId' },
};
/* the sequence diagram passes createdAt on these two; the class diagram does not list it, so it is an optional last parameter */
const OPTIONAL_CREATED_AT = new Set(['Listing.create', 'Booking.create']);
const ENTITIES = ['UserAccount', 'Listing', 'Booking'];

let app;
beforeEach(() => { app = loadApp(); });

describe('class diagram', () => {
  for (const [cls, methods] of Object.entries(CLASS_DIAGRAM)) {
    describe(cls, () => {
      it('exists', () => expect(app[cls]).toBeTypeOf('object'));
      for (const [method, params] of Object.entries(methods)) {
        it(`${method}(${params})`, () => {
          expect(app[cls][method]).toBeTypeOf('function');
          let actual = paramNames(app[cls][method]);
          if (OPTIONAL_CREATED_AT.has(`${cls}.${method}`) && actual.at(-1) === 'createdAt') actual = actual.slice(0, -1);
          expect(actual.join(',')).toBe(params);
        });
      }
    });
  }

  it('UserAccount, Listing and Booking store exactly the diagram\'s fields', () => {
    const keys = (o) => Object.keys(o).sort();
    expect(keys(app.DB.data.users[0])).toEqual('createdAt,email,id,name,passwordHash,role,status'.split(','));
    expect(keys(app.DB.data.listings[0])).toEqual('categoryId,createdAt,description,designerId,id,maxBudget,minBudget,status,style,title,viewCount'.split(','));
    expect(keys(app.DB.data.bookings[0])).toEqual('createdAt,customerId,id,listingId,message,preferredDate,progressNotes,status'.split(','));
  });
});

/* records every call to a diagram class; calls made inside an entity (its own helpers) are not part of the sequence */
function trace() {
  const calls = [];
  let depth = 0;
  for (const cls of Object.keys(CLASS_DIAGRAM)) {
    for (const method of Object.keys(CLASS_DIAGRAM[cls])) {
      const original = app[cls][method];
      app[cls][method] = function (...args) {
        if (depth === 0) calls.push({ name: `${cls}.${method}`, args });
        const isEntity = ENTITIES.includes(cls);
        if (isEntity) depth++;
        try { return original.apply(this, args); } finally { if (isEntity) depth--; }
      };
    }
  }
  return { calls, names: () => calls.map((c) => c.name), clear: () => { calls.length = 0; } };
}

describe('sequence diagram: each user story makes exactly the calls drawn', () => {
  let t, customer, designer;
  beforeEach(() => {
    customer = app.firstUser('CUSTOMER');
    designer = app.firstUser('DESIGNER');
    t = trace();
  });

  it('US-01 Register Customer', () => {
    app.RegistrationLoginPage.register('Trace User', 'trace@example.com', 'password123');
    expect(t.names()).toEqual(['RegistrationLoginPage.register', 'AccountController.registerCustomer', 'UserAccount.create']);
    const [name, email, hash, role, status] = t.calls[2].args;
    expect([name, email, role, status]).toEqual(['Trace User', 'trace@example.com', 'CUSTOMER', 'ACTIVE']);
    expect(hash).toBe(app.hashPassword('password123'));
  });

  it('US-22 Search Listings by Keyword', () => {
    app.SearchListingDetailsPages.search('kitchen');
    expect(t.names()).toEqual(['SearchListingDetailsPages.search', 'DiscoveryController.searchPublished', 'Listing.searchByKeyword']);
    expect(t.calls[2].args).toEqual(['kitchen', 'PUBLISHED']);
  });

  it('US-25 View Listing Details (includes US-33 Record Listing View)', () => {
    const id = app.publishedListing().id;
    app.SearchListingDetailsPages.viewDetails(id);
    expect(t.names()).toEqual(['SearchListingDetailsPages.viewDetails', 'DiscoveryController.getListingDetails', 'Listing.findById', 'Listing.recordView']);
    expect(t.calls[2].args).toEqual([id]);
    expect(t.calls[3].args).toEqual([id]);
  });

  it('US-41 Request a Booking', () => {
    app.as(customer);
    const id = app.publishedListing().id, date = app.futureDate(5);
    app.BookingPages.requestBooking(id, date, 'Hello there');
    expect(t.names()).toEqual(['BookingPages.requestBooking', 'BookingController.requestBooking', 'Booking.create']);
    expect(t.calls[1].args).toEqual([customer.id, id, date, 'Hello there']);
    const [cid, lid, d, msg, status, createdAt] = t.calls[2].args;
    expect([cid, lid, d, msg, status]).toEqual([customer.id, id, date, 'Hello there', 'PENDING']);
    expect(typeof createdAt).toBe('number');
  });

  it('US-47 Accept or Decline a Booking Request: ACCEPT sets CONFIRMED', () => {
    app.as(designer);
    const b = app.Booking.all().find((x) => x.status === 'PENDING');
    app.BookingPages.acceptOrDecline(b.id, 'ACCEPT');
    expect(t.names()).toEqual(['BookingPages.acceptOrDecline', 'BookingController.decideBooking', 'Booking.updateStatus']);
    expect(t.calls[1].args).toEqual([b.id, designer.id, 'ACCEPT']);
    expect(t.calls[2].args).toEqual([b.id, 'CONFIRMED']);
  });

  it('US-47 Accept or Decline a Booking Request: DECLINE sets CANCELLED', () => {
    app.as(designer);
    const b = app.Booking.all().find((x) => x.status === 'PENDING');
    app.BookingPages.acceptOrDecline(b.id, 'DECLINE');
    expect(t.names()).toEqual(['BookingPages.acceptOrDecline', 'BookingController.decideBooking', 'Booking.updateStatus']);
    expect(t.calls[2].args).toEqual([b.id, 'CANCELLED']);
  });

  it('US-48 Update Booking Status and Add Progress Notes', () => {
    app.as(designer);
    const b = app.Booking.all().find((x) => x.status === 'CONFIRMED');
    app.BookingPages.updateProgress(b.id, 'IN_PROGRESS', 'Started work');
    expect(t.names()).toEqual(['BookingPages.updateProgress', 'BookingController.updateBookingProgress', 'Booking.updateStatus', 'Booking.addNote']);
    expect(t.calls[1].args).toEqual([b.id, designer.id, 'IN_PROGRESS', 'Started work']);
    expect(t.calls[2].args).toEqual([b.id, 'IN_PROGRESS']);
    expect(t.calls[3].args).toEqual([b.id, 'Started work']);
  });

  it('US-43 View Booking Status', () => {
    app.as(customer);
    app.BookingPages.viewStatus();
    expect(t.names()).toEqual(['BookingPages.viewStatus', 'BookingController.getBookingStatus', 'Booking.findByCustomerId']);
    expect(t.calls[2].args).toEqual([customer.id]);
  });

  it('US-14 Create Listing', () => {
    app.as(designer);
    app.CompanyPortfolioPages.createListing('Trace listing', 'A long enough description', 1, 'Japandi', 1000, 5000, 'PUBLISHED');
    expect(t.names()).toEqual(['CompanyPortfolioPages.createListing', 'ListingController.createListing', 'Listing.create']);
    expect(t.calls[1].args.slice(0, 2)).toEqual([designer.id, 'Trace listing']);
    const [did, cat, title, desc, style, min, max, status, createdAt] = t.calls[2].args;
    expect([did, cat, title, desc, style, min, max, status]).toEqual([designer.id, 1, 'Trace listing', 'A long enough description', 'Japandi', 1000, 5000, 'PUBLISHED']);
    expect(typeof createdAt).toBe('number');
  });

  it('US-16 Edit Listing', () => {
    app.as(designer);
    const id = app.Listing.all()[0].id;
    app.CompanyPortfolioPages.editListing(id, 'Edited title', 'A long enough description', 1, 'Japandi', 1000, 5000, 'PUBLISHED');
    expect(t.names()).toEqual(['CompanyPortfolioPages.editListing', 'ListingController.updateListing', 'Listing.update']);
    expect(t.calls[1].args.slice(0, 2)).toEqual([id, designer.id]);
    expect(t.calls[2].args).toEqual([id, 1, 'Edited title', 'A long enough description', 'Japandi', 1000, 5000, 'PUBLISHED']);
  });
});
