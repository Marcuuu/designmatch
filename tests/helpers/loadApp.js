/* Loads the site's plain <script> files (no import/export) into an isolated scope, so every test starts from fresh seed data.
   loadApp()  : data, entities, controllers, boundary classes and UI helpers (no DOM needed)
   loadSite() : everything, including pages.js and app.js (needs a jsdom environment) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');

const NAMES = {
  seed: ['mulberry32', 'hashPassword', 'generateSeedData', 'SEED_CONFIG', 'DEMO_PASSWORD'],
  entities: ['DB', 'UserAccount', 'Listing', 'Booking', 'Company', 'Category', 'Favourite', 'ProjectInfo'],
  controllers: [
    'Result', 'BOOKING_STATUSES', 'STYLES', 'AccountController', 'DiscoveryController', 'ListingController',
    'BookingController', 'AuthController', 'AdminController', 'DesignerWorkspaceController', 'CompanyController',
    'FavouriteController', 'CategoryController', 'ReportController',
  ],
  boundary: ['RegistrationLoginPage', 'SearchListingDetailsPages', 'CompanyPortfolioPages', 'BookingPages'],
  ui: ['esc', 'fmtDate', 'money', 'label', 'badge', 'options', 'paginate', 'pager', 'thumb'],
  pages: ['Pages', 'searchState', 'adminState', 'reportState', 'applyFilters'],
  app: ['Auth', 'NAV', 'ROUTES', 'route', 'renderNav'],
};

/* in-memory stand-in for localStorage / sessionStorage when the test runs without a DOM */
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

function build(files) {
  const names = files.flatMap((f) => NAMES[f]);
  const code = files.map(read).join('\n;\n');
  // app.js defines the real Auth. Without it, tests get a minimal stand-in with the same shape.
  const stub = files.includes('app')
    ? ''
    : 'const Auth = { current: null, user() { return this.current; }, login(u) { this.current = u; }, logout() { this.current = null; } };';
  const exportList = [...names, ...(files.includes('app') ? [] : ['Auth'])].join(', ');
  const factory = new Function('localStorage', 'sessionStorage', `${code}\n${stub}\nDB.load();\nreturn { ${exportList} };`);
  const local = globalThis.localStorage ?? memoryStorage();
  const session = globalThis.sessionStorage ?? memoryStorage();
  const app = factory(local, session);
  app.storage = local;
  return app;
}

function addHelpers(app) {
  const users = () => app.UserAccount.all();
  app.firstUser = (role) => users().find((u) => u.role === role && u.status === 'ACTIVE');
  app.publishedListing = () => app.Listing.all().find((l) => l.status === 'PUBLISHED');
  app.as = (user) => { app.Auth.current = user; return user; };
  app.futureDate = (days = 7) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  return app;
}

export const loadApp = () => addHelpers(build(['seed', 'entities', 'controllers', 'boundary', 'ui']));
export const loadSite = () => addHelpers(build(['seed', 'entities', 'controllers', 'boundary', 'ui', 'pages', 'app']));
export const siteBodyHtml = () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  return html.replace(/[\s\S]*<body[^>]*>/i, '').replace(/<\/body>[\s\S]*/i, '').replace(/<script[\s\S]*?<\/script>/gi, '');
};

/* parameter names of a function, e.g. "create(a, b = 1)" -> ['a', 'b'] */
export const paramNames = (fn) => {
  const m = fn.toString().match(/^[^(]*\(([^)]*)\)/);
  return m ? m[1].split(',').map((s) => s.trim().replace(/\s*=.*$/, '')).filter(Boolean) : [];
};
