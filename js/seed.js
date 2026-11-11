/* seed.js - random test data generator.
   Uses a seeded random number generator, so the same data is produced every time.
   Called automatically on first load, or from the "Reset test data" link in the footer. */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Demo-only hash (djb2). NOT secure - a real system must hash on the server (bcrypt/argon2). */
function hashPassword(p) {
  let h = 5381;
  for (let i = 0; i < p.length; i++) h = ((h << 5) + h + p.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(16);
}

const SEED_CONFIG = { admins: 3, platform: 2, designers: 35, customers: 110, listings: 100, bookings: 100, favourites: 100, views: 400 };
const DEMO_PASSWORD = 'password123';

function generateSeedData() {
  const rnd = mulberry32(20261110);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const now = Date.now(), H = 36e5, D = 24 * H;
  // 20% of activity in the last 24h, 30% in the last week, 50% in the last 60 days (so daily/weekly/monthly reports all have data)
  const randTime = () => { const r = rnd(); return Math.round(r < .2 ? now - rnd() * D : r < .5 ? now - rnd() * 7 * D : now - rnd() * 60 * D); };

  const first = ['Wei', 'Mei', 'Jun', 'Hui', 'Priya', 'Arjun', 'Siti', 'Ahmad', 'Daniel', 'Sarah', 'Kevin', 'Rachel', 'Nur', 'Farah', 'Ravi', 'Aisha', 'Jia', 'Xin', 'Marcus', 'Emily', 'Zhi', 'Li', 'Ethan', 'Chloe', 'Kai', 'Nadia', 'Isaac', 'Grace', 'Hafiz', 'Divya'];
  const last = ['Tan', 'Lim', 'Lee', 'Ng', 'Wong', 'Chua', 'Goh', 'Koh', 'Teo', 'Ong', 'Singh', 'Kumar', 'Rahman', 'Ali', 'Chan', 'Yeo', 'Ho', 'Sim', 'Lau', 'Chew'];
  const streets = ['Orchard Rd', 'Tampines St 81', 'Jurong East Ave 1', 'Bukit Timah Rd', 'Ubi Ave 3', 'Kallang Way', 'Tiong Bahru Rd', 'Woodlands Ave 9', 'Serangoon Ave 2', 'Paya Lebar Way'];
  const styles = ['Scandinavian', 'Modern Minimalist', 'Industrial', 'Japandi', 'Contemporary', 'Mid-century', 'Rustic', 'Luxury Classic', 'Tropical'];
  const adjectives = ['Bright', 'Cosy', 'Serene', 'Bold', 'Warm', 'Airy', 'Elegant', 'Compact', 'Timeless', 'Playful', 'Refined', 'Urban'];
  const suffixes = ['Makeover', 'Concept', 'Transformation', 'Redesign', 'Retreat', 'Refresh'];
  const features = ['custom carpentry', 'warm wood accents', 'built-in storage', 'statement lighting', 'a muted colour palette', 'natural stone surfaces', 'open-plan zoning', 'textured feature walls', 'smart-home controls', 'greenery and planters'];
  const msgs = ['Hi, I love this style. Can we discuss a similar look for my flat?', 'Interested in a quotation for a similar project. Please advise on the timeline.', 'We are renovating next month and would like a consultation.', 'Could we arrange a site visit to discuss the scope?', 'Looking for a full-home package within a similar budget.'];
  const notes = ['Site visit completed.', 'Initial mood board shared with client.', 'Quotation sent for approval.', 'Materials ordered.', 'Carpentry works started.', 'Final walkthrough scheduled.', 'Handover completed.'];
  const catNames = [
    ['Living Room', 'Lounges and family spaces'], ['Bedroom', 'Master and guest bedrooms'], ['Kitchen', 'Kitchens and pantries'], ['Bathroom', 'Bathrooms and wet areas'],
    ['Home Office', 'Work-from-home spaces'], ['Dining Room', 'Dining areas'], ['Kids Room', 'Nurseries and children rooms'], ['Commercial / Retail', 'Shops and showrooms'],
    ['Restaurant & Cafe', 'F&B outlets'], ['Whole Home Renovation', 'Full-home projects'], ['Outdoor & Balcony', 'Balconies, patios and gardens'], ['Studio / Small Space', 'Compact living']
  ];

  const db = { users: [], companies: [], categories: [], listings: [], bookings: [], favourites: [], views: [], projectInfo: [] };
  const pw = hashPassword(DEMO_PASSWORD);
  const phone = () => '+65 ' + pick(['8', '9']) + int(100, 999) + ' ' + int(1000, 9999);
  const fullName = () => pick(first) + ' ' + pick(last);

  catNames.forEach((c, i) => db.categories.push({ id: i + 1, name: c[0], description: c[1], status: 'ACTIVE' }));

  const addUsers = (n, role, prefix) => {
    for (let i = 1; i <= n; i++) {
      const id = db.users.length + 1;
      db.users.push({
        id, name: fullName(), email: prefix + i + '@example.com', passwordHash: pw, role,
        status: role === 'CUSTOMER' && rnd() < 0.05 ? 'SUSPENDED' : 'ACTIVE',
        createdAt: randTime() - (rnd() < .5 ? 30 * D : 0)
      });
    }
  };
  addUsers(SEED_CONFIG.admins, 'ADMIN', 'admin');
  addUsers(SEED_CONFIG.platform, 'PLATFORM', 'platform');
  addUsers(SEED_CONFIG.designers, 'DESIGNER', 'designer');
  addUsers(SEED_CONFIG.customers, 'CUSTOMER', 'customer');
  db.users.filter(u => u.email === 'customer1@example.com' || u.email === 'designer1@example.com').forEach(u => u.status = 'ACTIVE');

  const designers = db.users.filter(u => u.role === 'DESIGNER');
  const customers = db.users.filter(u => u.role === 'CUSTOMER' && u.status === 'ACTIVE');

  designers.forEach((d, i) => {
    const surname = d.name.split(' ')[1];
    db.companies.push({
      id: i + 1, designerId: d.id,
      name: surname + ' ' + pick(['Interiors', 'Design Studio', 'Atelier', '& Co', 'Spaces', 'Home Concepts']),
      description: 'We craft ' + pick(styles).toLowerCase() + ' and ' + pick(styles).toLowerCase() + ' interiors for homes and businesses across Singapore, from first sketch to handover.',
      address: int(1, 300) + ' ' + pick(streets) + ', Singapore ' + int(100000, 829999),
      phone: phone(), email: 'hello@' + surname.toLowerCase() + int(1, 99) + '.example.com',
      website: 'https://www.' + surname.toLowerCase() + int(1, 99) + '-design.example.com',
      yearEstablished: int(1995, 2022)
    });
  });

  for (let i = 0; i < SEED_CONFIG.listings; i++) {
    const cat = pick(db.categories), style = pick(styles), min = int(5, 50) * 1000;
    const status = i < 85 ? 'PUBLISHED' : i < 95 ? 'DRAFT' : 'ARCHIVED';
    db.projectInfo.push({ listingId: i + 1, projectState: rnd() < .6 ? 'PAST' : 'CURRENT' });
    db.listings.push({
      id: i + 1, designerId: (i < 70 ? designers[i % designers.length] : pick(designers)).id, categoryId: cat.id,
      title: pick(adjectives) + ' ' + cat.name + ' ' + pick(suffixes),
      description: 'A ' + style.toLowerCase() + ' take on a ' + cat.name.toLowerCase() + ' project featuring ' + pick(features) + ' and ' + pick(features) + '. Designed around the client\'s daily routine, with a focus on light, storage and easy maintenance.',
      style, minBudget: min, maxBudget: min + int(5, 60) * 1000,
      status, viewCount: 0, createdAt: randTime()
    });
  }
  const published = db.listings.filter(l => l.status === 'PUBLISHED');

  for (let i = 0; i < SEED_CONFIG.views; i++) {
    const l = pick(published); l.viewCount++;
    db.views.push({ listingId: l.id, at: randTime() });
  }

  const seen = new Set();
  while (db.favourites.length < SEED_CONFIG.favourites) {
    const c = pick(customers), l = pick(published), k = c.id + '-' + l.id;
    if (seen.has(k)) continue;
    seen.add(k);
    db.favourites.push({ id: db.favourites.length + 1, customerId: c.id, listingId: l.id, createdAt: randTime() });
  }

  const statusPlan = [].concat(Array(30).fill('PENDING'), Array(25).fill('CONFIRMED'), Array(20).fill('IN_PROGRESS'), Array(15).fill('COMPLETED'), Array(10).fill('CANCELLED'));
  for (let i = 0; i < SEED_CONFIG.bookings; i++) {
    const status = statusPlan[i];
    const progressNotes = [];
    if (status !== 'PENDING') for (let n = 0; n < int(0, 2); n++) progressNotes.push({ note: pick(notes), at: randTime() });
    db.bookings.push({
      id: i + 1, listingId: pick(published).id, customerId: pick(customers).id,
      preferredDate: new Date(now + int(3, 60) * D).toISOString().slice(0, 10),
      message: pick(msgs), status, progressNotes, createdAt: randTime()
    });
  }
  return db;
}
