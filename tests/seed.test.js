import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

describe('seed data', () => {
  let app, db;
  beforeEach(() => { app = loadApp(); db = app.DB.data; });

  it('creates enough records of every data type', () => {
    const c = app.SEED_CONFIG;
    expect(db.users).toHaveLength(c.admins + c.platform + c.designers + c.customers);
    expect(db.users.length).toBeGreaterThanOrEqual(100);
    expect(db.listings).toHaveLength(100);
    expect(db.bookings).toHaveLength(100);
    expect(db.favourites).toHaveLength(100);
    expect(db.views).toHaveLength(400);
    expect(db.companies).toHaveLength(c.designers);
    expect(db.categories).toHaveLength(12);
    expect(db.projectInfo).toHaveLength(100);
  });

  it('has all four account types', () => {
    const count = (role) => db.users.filter((u) => u.role === role).length;
    expect(count('ADMIN')).toBe(3);
    expect(count('PLATFORM')).toBe(2);
    expect(count('DESIGNER')).toBe(35);
    expect(count('CUSTOMER')).toBe(110);
  });

  it('has unique, lowercase emails', () => {
    const emails = db.users.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
    emails.forEach((e) => expect(e).toBe(e.toLowerCase()));
  });

  it('has working demo accounts that share the demo password', () => {
    for (const email of ['customer1@example.com', 'designer1@example.com', 'admin1@example.com', 'platform1@example.com']) {
      const u = db.users.find((x) => x.email === email);
      expect(u, email).toBeDefined();
      expect(u.status).toBe('ACTIVE');
      expect(u.passwordHash).toBe(app.hashPassword(app.DEMO_PASSWORD));
    }
  });

  it('never stores a plain-text password', () => {
    db.users.forEach((u) => expect(u.passwordHash).not.toBe(app.DEMO_PASSWORD));
  });

  it('gives every designer exactly one company', () => {
    const designers = db.users.filter((u) => u.role === 'DESIGNER');
    designers.forEach((d) => expect(db.companies.filter((c) => c.designerId === d.id)).toHaveLength(1));
  });

  it('keeps listings valid and linked to real designers and categories', () => {
    const designerIds = new Set(db.users.filter((u) => u.role === 'DESIGNER').map((u) => u.id));
    const categoryIds = new Set(db.categories.map((c) => c.id));
    db.listings.forEach((l) => {
      expect(designerIds.has(l.designerId)).toBe(true);
      expect(categoryIds.has(l.categoryId)).toBe(true);
      expect(l.maxBudget).toBeGreaterThan(l.minBudget);
      expect(app.STYLES).toContain(l.style);
    });
  });

  it('has the planned mix of listing statuses', () => {
    const count = (s) => db.listings.filter((l) => l.status === s).length;
    expect([count('PUBLISHED'), count('DRAFT'), count('ARCHIVED')]).toEqual([85, 10, 5]);
  });

  it('has a project type (current or past) for every listing', () => {
    db.listings.forEach((l) => {
      const info = db.projectInfo.find((p) => p.listingId === l.id);
      expect(['CURRENT', 'PAST']).toContain(info.projectState);
    });
  });

  it('only logs views for published listings and keeps viewCount in step with the log', () => {
    const published = new Set(db.listings.filter((l) => l.status === 'PUBLISHED').map((l) => l.id));
    db.views.forEach((v) => expect(published.has(v.listingId)).toBe(true));
    db.listings.forEach((l) => expect(l.viewCount).toBe(db.views.filter((v) => v.listingId === l.id).length));
  });

  it('has no duplicate favourites, and only active customers favouriting published listings', () => {
    const keys = db.favourites.map((f) => `${f.customerId}-${f.listingId}`);
    expect(new Set(keys).size).toBe(keys.length);
    db.favourites.forEach((f) => {
      const u = db.users.find((x) => x.id === f.customerId);
      const l = db.listings.find((x) => x.id === f.listingId);
      expect(u.role).toBe('CUSTOMER');
      expect(u.status).toBe('ACTIVE');
      expect(l.status).toBe('PUBLISHED');
    });
  });

  it('creates bookings with the planned status mix and sensible data', () => {
    const count = (s) => db.bookings.filter((b) => b.status === s).length;
    expect([count('PENDING'), count('CONFIRMED'), count('IN_PROGRESS'), count('COMPLETED'), count('CANCELLED')]).toEqual([30, 25, 20, 15, 10]);
    const today = new Date().toISOString().slice(0, 10);
    db.bookings.forEach((b) => {
      expect(b.preferredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(b.preferredDate >= today).toBe(true);
      expect(db.users.find((u) => u.id === b.customerId).role).toBe('CUSTOMER');
      expect(db.listings.find((l) => l.id === b.listingId).status).toBe('PUBLISHED');
      if (b.status === 'PENDING') expect(b.progressNotes).toEqual([]);
    });
  });

  it('spreads activity over time so daily, weekly and monthly reports all have data', () => {
    const now = Date.now();
    const within = (ms) => db.views.filter((v) => now - v.at <= ms).length;
    expect(within(24 * 36e5)).toBeGreaterThan(0);
    expect(within(7 * 24 * 36e5)).toBeGreaterThan(within(24 * 36e5));
    expect(within(30 * 24 * 36e5)).toBeGreaterThan(within(7 * 24 * 36e5));
    db.views.forEach((v) => expect(v.at).toBeLessThanOrEqual(now));
  });

  it('stores exactly the fields shown on the class diagram', () => {
    const keys = (o) => Object.keys(o).sort();
    expect(keys(db.users[0])).toEqual(['createdAt', 'email', 'id', 'name', 'passwordHash', 'role', 'status']);
    expect(keys(db.listings[0])).toEqual(['categoryId', 'createdAt', 'description', 'designerId', 'id', 'maxBudget', 'minBudget', 'status', 'style', 'title', 'viewCount']);
    expect(keys(db.bookings[0])).toEqual(['createdAt', 'customerId', 'id', 'listingId', 'message', 'preferredDate', 'progressNotes', 'status']);
  });
});

describe('seed determinism', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-10T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it('produces identical data every time it runs', () => {
    const app = loadApp();
    expect(JSON.stringify(app.generateSeedData())).toBe(JSON.stringify(app.generateSeedData()));
  });
});

describe('hashPassword', () => {
  it('is stable, different for different inputs, and not the input', () => {
    const { hashPassword } = loadApp();
    expect(hashPassword('password123')).toBe(hashPassword('password123'));
    expect(hashPassword('password123')).not.toBe(hashPassword('password124'));
    expect(hashPassword('password123')).not.toContain('password123');
  });
});
