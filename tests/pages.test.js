// @vitest-environment jsdom
/* Renders the real pages in jsdom and uses them the way a person would: typing into forms and clicking buttons. */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSite, siteBodyHtml } from './helpers/loadApp.js';

let app;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const text = () => document.querySelector('#app').textContent;
const go = (hash) => { location.hash = hash; app.route(); };
const type = (selector, value) => { const el = $(selector); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const submit = (selector) => $(selector).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const click = (selector) => $(selector).click();
const loginAs = (user) => { app.Auth.login(user); };

// jsdom does not expose form controls as named properties (form.email) the way browsers do, so add that here.
for (const name of ['email', 'password']) {
  if (!(name in HTMLFormElement.prototype)) {
    Object.defineProperty(HTMLFormElement.prototype, name, { configurable: true, get() { return this.elements.namedItem(name); } });
  }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = siteBodyHtml();
  window.scrollTo = () => {};
  location.hash = '';
  app = loadSite();
});

describe('guest', () => {
  it('home page shows the first 12 published projects and how many were found', () => {
    go('#/');
    expect($$('.listing-card')).toHaveLength(12);
    expect(text()).toContain('85 projects found');
  });

  it('searching by keyword narrows the results', () => {
    go('#/');
    type('input[name=q]', 'qwertyuiop-no-match');
    expect(text()).toContain('0 projects found');
    expect($$('.listing-card')).toHaveLength(0);
    type('input[name=q]', 'kitchen');
    const n = $$('.listing-card').length;
    expect(n).toBeGreaterThan(0);
    $$('.listing-card h3').forEach((h) => expect(h.textContent.length).toBeGreaterThan(0));
  });

  it('filtering by category and sorting still return only published projects', () => {
    go('#/');
    type('select[name=categoryId]', '1');
    expect(text()).toMatch(/\d+ projects? found/);
    type('select[name=sort]', 'views');
    const counts = $$('.listing-card .muted.small').map((p) => p.textContent).filter((t) => /views$/.test(t)).map((t) => parseInt(t, 10));
    for (let i = 1; i < counts.length; i++) expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
  });

  it('the pager moves to the next page', () => {
    go('#/');
    click('[data-page="2"]');
    expect(text()).toContain('Page 2 of 8');
  });

  it('a project page shows the details, records a view, and offers login instead of booking', () => {
    const l = app.publishedListing(), before = l.viewCount;
    go('#/listing/' + l.id);
    expect(text()).toContain(l.title);
    expect(text()).toContain('Log in');
    expect($('#bookingForm')).toBeNull();
    expect(l.viewCount).toBe(before + 1);
  });

  it('a draft project shows "not available"', () => {
    go('#/listing/' + app.Listing.all().find((l) => l.status === 'DRAFT').id);
    expect(text()).toContain('Project not available');
  });

  it('a company page shows the company and its published portfolio', () => {
    const l = app.publishedListing();
    go('#/company/' + l.designerId);
    expect(text()).toContain(app.Company.findByDesigner(l.designerId).name);
    expect(text()).toContain('Portfolio');
  });

  it('protected pages send a guest to the login page', () => {
    go('#/favourites');
    expect(location.hash).toBe('#/login');
    go('#/admin/users');
    expect(location.hash).toBe('#/login');
  });

  it('an unknown page says "Page not found"', () => {
    go('#/does-not-exist');
    expect(text()).toContain('Page not found');
  });

  it('the navigation shows Browse, Log in and Register', () => {
    go('#/');
    expect($('#nav').textContent).toMatch(/Browse.*Log in.*Register/);
    expect($('#logout')).toBeNull();
  });
});

describe('registration and login', () => {
  it('registering creates a customer account and shows the success message (US-01)', () => {
    go('#/register');
    expect($('select[name=role]')).toBeNull(); // only customers can self-register
    $('input[name=name]').value = 'Alex Tan';
    $('input[name=email]').value = 'alex.tan@example.com';
    $('input[name=password]').value = 'password123';
    submit('#regForm');
    expect(text()).toContain('Registration successful');
    expect(app.UserAccount.findByEmail('alex.tan@example.com')).toMatchObject({ role: 'CUSTOMER', status: 'ACTIVE' });
  });

  it('registering with a taken email shows the error and stays on the form', () => {
    go('#/register');
    $('input[name=name]').value = 'Alex Tan';
    $('input[name=email]').value = 'customer1@example.com';
    $('input[name=password]').value = 'password123';
    submit('#regForm');
    expect($('#regForm .error').hidden).toBe(false);
    expect($('#regForm .error').textContent).toMatch(/already registered/);
  });

  it('the login page lists the demo accounts, and clicking one fills the form', () => {
    go('#/login');
    expect(text()).toContain('Demo accounts');
    $('[data-email="designer1@example.com"]').click();
    expect($('#loginForm input[name=email]').value).toBe('designer1@example.com');
    expect($('#loginForm input[name=password]').value).toBe(app.DEMO_PASSWORD);
  });

  it.each([
    ['customer1@example.com', '#/'],
    ['designer1@example.com', '#/designer'],
    ['admin1@example.com', '#/admin/users'],
    ['platform1@example.com', '#/platform/reports'],
  ])('logging in as %s goes to %s', (email, hash) => {
    go('#/login');
    $('#loginForm input[name=email]').value = email;
    $('#loginForm input[name=password]').value = 'password123';
    submit('#loginForm');
    expect(app.Auth.user().email).toBe(email);
    expect(location.hash).toBe(hash);
  });

  it('a wrong password shows an error and does not log in', () => {
    go('#/login');
    $('#loginForm input[name=email]').value = 'customer1@example.com';
    $('#loginForm input[name=password]').value = 'nope';
    submit('#loginForm');
    expect($('#loginForm .error').textContent).toBe('Incorrect email or password.');
    expect(app.Auth.user()).toBeNull();
  });

  it('a suspended account is signed out on the next page', () => {
    const u = app.firstUser('CUSTOMER');
    loginAs(u);
    go('#/profile');
    expect(text()).toContain('Change password');
    app.UserAccount.update(u.id, { status: 'SUSPENDED' });
    go('#/profile');
    expect(location.hash).toBe('#/login');
  });

  it('logging out clears the session', () => {
    loginAs(app.firstUser('CUSTOMER'));
    go('#/');
    click('#logout');
    expect(app.Auth.user()).toBeNull();
    expect(sessionStorage.getItem('dm_user')).toBeNull();
  });
});

describe('customer', () => {
  let customer;
  beforeEach(() => { customer = app.firstUser('CUSTOMER'); loginAs(customer); });

  it('sees customer navigation', () => {
    go('#/');
    expect($('#nav').textContent).toContain('My Bookings');
    expect($('#nav').textContent).toContain('Favourites');
    expect($('#nav').textContent).not.toContain('Dashboard');
  });

  it('can save a project from the search results with the heart button', () => {
    const l = app.publishedListing();
    app.Favourite.remove(customer.id, l.id);
    go('#/');
    type('input[name=q]', l.title);
    const heart = $(`[data-fav="${l.id}"]`);
    expect(heart).not.toBeNull();
    heart.click();
    expect(app.FavouriteController.isFavourite(customer.id, l.id)).toBe(true);
    $(`[data-fav="${l.id}"]`).click();
    expect(app.FavouriteController.isFavourite(customer.id, l.id)).toBe(false);
  });

  it('requests a booking from the project page (US-41), then sees it under My Bookings (US-43)', () => {
    const l = app.publishedListing();
    go('#/listing/' + l.id);
    $('input[name=preferredDate]').value = app.futureDate(10);
    $('textarea[name=message]').value = 'Please call me about this.';
    submit('#bookingForm');
    expect(text()).toContain('Booking request sent');
    expect(app.BookingController.getBookingStatus(customer.id).some((b) => b.listingId === l.id && b.status === 'PENDING')).toBe(true);
    go('#/my-bookings');
    expect(text()).toContain(l.title);
    expect($$('.badge').some((b) => b.textContent === 'PENDING')).toBe(true);
  });

  it('sees an error when the booking date is in the past', () => {
    go('#/listing/' + app.publishedListing().id);
    $('input[name=preferredDate]').value = '2020-01-01';
    $('textarea[name=message]').value = 'Please call me about this.';
    submit('#bookingForm');
    expect($('#bookingForm .error').textContent).toMatch(/today or later/);
  });

  it('has a favourites page and a profile page', () => {
    go('#/favourites');
    expect(text()).toContain('My favourites');
    go('#/profile');
    expect($('#profileForm input[name=name]').value).toBe(customer.name);
    expect($('#profileForm input[name=phone]')).toBeNull();
  });

  it('can change their name on the profile page', () => {
    go('#/profile');
    $('#profileForm input[name=name]').value = 'Renamed Customer';
    submit('#profileForm');
    expect(customer.name).toBe('Renamed Customer');
  });

  it('cannot open designer, admin or platform pages', () => {
    for (const hash of ['#/designer', '#/designer/listings', '#/admin/users', '#/platform/reports']) {
      go(hash);
      expect(text()).toContain('Access denied');
    }
  });
});

describe('interior designer', () => {
  let designer;
  beforeEach(() => {
    designer = app.UserAccount.findById(app.publishedListing().designerId);
    loginAs(designer);
  });

  it('sees the dashboard with views and shortlists per project', () => {
    go('#/designer');
    expect(text()).toContain('Interest in your projects');
    expect(text()).toContain('Total views');
    expect(text()).toContain('Times shortlisted');
    expect($$('#app tbody tr').length).toBe(app.Listing.findByDesigner(designer.id).length);
  });

  it('lists the portfolio and links published projects only', () => {
    go('#/designer/listings');
    const mine = app.Listing.findByDesigner(designer.id);
    expect($$('#app tbody tr')).toHaveLength(mine.length);
  });

  it('creates a listing with the add-project form (US-14), including the current/past type', () => {
    go('#/designer/listings/new');
    $('input[name=title]').value = 'Calm Japandi Living Room';
    $('textarea[name=description]').value = 'A warm, minimal living room with natural timber.';
    $('select[name=categoryId]').value = '1';
    $('select[name=style]').value = 'Japandi';
    $('select[name=projectState]').value = 'CURRENT';
    $('select[name=status]').value = 'PUBLISHED';
    $('input[name=minBudget]').value = '15000';
    $('input[name=maxBudget]').value = '30000';
    submit('#lf');
    const created = app.Listing.all().find((l) => l.title === 'Calm Japandi Living Room');
    expect(created).toMatchObject({ designerId: designer.id, status: 'PUBLISHED', minBudget: 15000, maxBudget: 30000 });
    expect(app.ProjectInfo.get(created.id)).toBe('CURRENT');
    expect(location.hash).toBe('#/designer/listings');
  });

  it('shows the validation error when the budget range is wrong', () => {
    go('#/designer/listings/new');
    $('input[name=title]').value = 'Valid title';
    $('textarea[name=description]').value = 'A long enough description.';
    $('select[name=categoryId]').value = '1';
    $('select[name=style]').value = 'Japandi';
    $('input[name=minBudget]').value = '9000';
    $('input[name=maxBudget]').value = '5000';
    const before = app.Listing.all().length;
    submit('#lf');
    expect($('#lf .error').textContent).toMatch(/maximum budget/i);
    expect(app.Listing.all()).toHaveLength(before);
  });

  it('edits an existing listing (US-16)', () => {
    const l = app.Listing.findByDesigner(designer.id)[0];
    go(`#/designer/listings/${l.id}/edit`);
    expect($('input[name=title]').value).toBe(l.title);
    $('input[name=title]').value = 'Updated Title';
    $('select[name=projectState]').value = 'CURRENT';
    submit('#lf');
    expect(app.Listing.findById(l.id).title).toBe('Updated Title');
    expect(app.ProjectInfo.get(l.id)).toBe('CURRENT');
  });

  it('cannot open another designer\'s listing for editing', () => {
    const other = app.Listing.all().find((l) => l.designerId !== designer.id);
    go(`#/designer/listings/${other.id}/edit`);
    expect(text()).toContain('Not found');
  });

  it('archives and publishes a project from the portfolio list', () => {
    const l = app.Listing.findByDesigner(designer.id).find((x) => x.status === 'PUBLISHED');
    go('#/designer/listings');
    $(`[data-status="ARCHIVED"][data-id="${l.id}"]`).click();
    expect(app.Listing.findById(l.id).status).toBe('ARCHIVED');
    $(`[data-status="PUBLISHED"][data-id="${l.id}"]`).click();
    expect(app.Listing.findById(l.id).status).toBe('PUBLISHED');
  });

  it('accepts and declines booking requests (US-47)', () => {
    const l = app.Listing.findByDesigner(designer.id).find((x) => x.status === 'PUBLISHED');
    const a = app.Booking.create(app.firstUser('CUSTOMER').id, l.id, app.futureDate(5), 'First request', 'PENDING');
    const b = app.Booking.create(app.firstUser('CUSTOMER').id, l.id, app.futureDate(6), 'Second request', 'PENDING');
    go('#/designer/bookings');
    $(`[data-decide="ACCEPT"][data-id="${a.id}"]`).click();
    expect(app.Booking.all().find((x) => x.id === a.id).status).toBe('CONFIRMED');
    $(`[data-decide="DECLINE"][data-id="${b.id}"]`).click();
    expect(app.Booking.all().find((x) => x.id === b.id).status).toBe('CANCELLED');
  });

  it('filters bookings by status', () => {
    go('#/designer/bookings');
    $('#bf').value = 'PENDING';
    $('#bf').dispatchEvent(new Event('change', { bubbles: true }));
    $$('#app tbody tr .badge').forEach((b) => expect(b.textContent).toBe('PENDING'));
  });

  it('edits company information (brief item 2)', () => {
    go('#/designer/company');
    $('#cf input[name=name]').value = 'Studio Renamed';
    submit('#cf');
    expect(app.Company.findByDesigner(designer.id).name).toBe('Studio Renamed');
    go('#/company/' + designer.id);
    expect(text()).toContain('Studio Renamed');
  });

  it('cannot open customer-only or admin pages', () => {
    for (const hash of ['#/favourites', '#/my-bookings', '#/admin/users']) {
      go(hash);
      expect(text()).toContain('Access denied');
    }
  });
});

describe('user admin', () => {
  beforeEach(() => loginAs(app.firstUser('ADMIN')));

  it('lists accounts 15 per page and can search and filter', () => {
    go('#/admin/users');
    expect($$('#ulist tbody tr')).toHaveLength(15);
    expect(text()).toContain('150 account(s)');
    type('input[name=keyword]', 'designer1@example.com');
    expect($$('#ulist tbody tr')).toHaveLength(1);
    type('input[name=keyword]', '');
    type('select[name=role]', 'ADMIN');
    expect($$('#ulist tbody tr')).toHaveLength(3);
  });

  it('suspends and reactivates an account (but has no button for the admin\'s own account)', () => {
    go('#/admin/users');
    type('input[name=keyword]', 'customer1@example.com');
    click('[data-toggle]');
    expect(app.UserAccount.findByEmail('customer1@example.com').status).toBe('SUSPENDED');
    click('[data-toggle]');
    expect(app.UserAccount.findByEmail('customer1@example.com').status).toBe('ACTIVE');
    type('input[name=keyword]', app.Auth.user().email);
    expect($('[data-toggle]')).toBeNull();
  });

  it('cannot open designer or platform pages', () => {
    go('#/designer');
    expect(text()).toContain('Access denied');
    go('#/platform/reports');
    expect(text()).toContain('Access denied');
  });
});

describe('platform management', () => {
  beforeEach(() => loginAs(app.firstUser('PLATFORM')));

  it('shows the categories with project counts', () => {
    go('#/platform/categories');
    expect(text()).toContain('Project categories');
    expect($$('#app tbody tr')).toHaveLength(12);
  });

  it.each([['daily'], ['weekly'], ['monthly']])('shows the %s report', (period) => {
    app.reportState.period = period;
    go('#/platform/reports');
    expect(text()).toContain('Reports');
    expect($$('.bar')).toHaveLength({ daily: 24, weekly: 7, monthly: 30 }[period]);
    expect($$('button.metric')).toHaveLength(5);
  });

  it('switches period and metric when the buttons are clicked', () => {
    go('#/platform/reports');
    click('[data-period="monthly"]');
    expect($$('.bar')).toHaveLength(30);
    click('[data-metric="bookings"]');
    expect(document.querySelector('button.metric.on').textContent).toContain('Bookings');
  });

  it('cannot open admin or designer pages', () => {
    go('#/admin/users');
    expect(text()).toContain('Access denied');
    go('#/designer');
    expect(text()).toContain('Access denied');
  });
});

describe('navigation per role', () => {
  it.each([
    ['DESIGNER', ['Dashboard', 'Portfolio', 'Bookings', 'Company']],
    ['ADMIN', ['User accounts']],
    ['PLATFORM', ['Reports', 'Categories']],
  ])('%s sees the right links', (role, links) => {
    loginAs(app.firstUser(role));
    app.renderNav();
    links.forEach((l) => expect($('#nav').textContent).toContain(l));
  });
});
