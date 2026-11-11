/* app.js - session, navigation and hash router */

/* the logged-in user is cached, so the boundary pages can pass the user's id without extra entity calls */
const Auth = {
  current: null,
  user() { return this.current; },
  login(u) { this.current = u; sessionStorage.setItem('dm_user', u.id); },
  logout() { this.current = null; sessionStorage.removeItem('dm_user'); },
  restore() { const id = sessionStorage.getItem('dm_user'); const u = id && UserAccount.findById(id); this.current = u && u.status === 'ACTIVE' ? u : null; }
};

const NAV = {
  GUEST: [['#/', 'Browse'], ['#/login', 'Log in'], ['#/register', 'Register']],
  CUSTOMER: [['#/', 'Browse'], ['#/favourites', 'Favourites'], ['#/my-bookings', 'My Bookings'], ['#/profile', 'Profile']],
  DESIGNER: [['#/designer', 'Dashboard'], ['#/designer/listings', 'Portfolio'], ['#/designer/bookings', 'Bookings'], ['#/designer/company', 'Company'], ['#/', 'Browse'], ['#/profile', 'Profile']],
  ADMIN: [['#/admin/users', 'User accounts'], ['#/profile', 'Profile']],
  PLATFORM: [['#/platform/reports', 'Reports'], ['#/platform/categories', 'Categories'], ['#/profile', 'Profile']]
};

function renderNav() {
  const u = Auth.user(), cur = location.hash || '#/';
  const links = NAV[u ? u.role : 'GUEST'];
  $('#nav').innerHTML = links.map(l => '<a href="' + l[0] + '"' + (cur === l[0] || (l[0] !== '#/' && cur.startsWith(l[0] + '/')) ? ' class="active"' : '') + '>' + l[1] + '</a>').join('') +
    (u ? '<span class="who">' + esc(u.name) + '</span><a href="#" id="logout">Log out</a>' : '');
  const lo = $('#logout');
  if (lo) lo.onclick = e => { e.preventDefault(); Auth.logout(); toast('Logged out'); location.hash = '#/'; renderNav(); };
  $('#nav').classList.remove('open');
}

const ROUTES = [
  ['^/$', Pages.home],
  ['^/login$', Pages.login],
  ['^/register$', Pages.register],
  ['^/listing/(\\d+)$', Pages.listing],
  ['^/company/(\\d+)$', Pages.company],
  ['^/profile$', Pages.profile, ['CUSTOMER', 'DESIGNER', 'ADMIN', 'PLATFORM']],
  ['^/favourites$', Pages.favourites, ['CUSTOMER']],
  ['^/my-bookings$', Pages.myBookings, ['CUSTOMER']],
  ['^/designer$', Pages.designerDashboard, ['DESIGNER']],
  ['^/designer/listings$', Pages.designerListings, ['DESIGNER']],
  ['^/designer/listings/new$', () => Pages.designerListingForm(null), ['DESIGNER']],
  ['^/designer/listings/(\\d+)/edit$', Pages.designerListingForm, ['DESIGNER']],
  ['^/designer/bookings$', Pages.designerBookings, ['DESIGNER']],
  ['^/designer/company$', Pages.designerCompany, ['DESIGNER']],
  ['^/admin/users$', Pages.adminUsers, ['ADMIN']],
  ['^/platform/categories$', Pages.platformCategories, ['PLATFORM']],
  ['^/platform/reports$', Pages.platformReports, ['PLATFORM']]
];

function route() {
  Auth.restore();
  const path = (location.hash || '#/').slice(1) || '/';
  const user = Auth.user();
  renderNav();
  for (const [pattern, fn, roles] of ROUTES) {
    const m = path.match(new RegExp(pattern));
    if (!m) continue;
    if (roles && !user) { toast('Please log in first', 'err'); location.hash = '#/login'; return; }
    if (roles && !roles.includes(user.role)) return message('Access denied', 'Your account type cannot open this page.');
    return fn(...m.slice(1));
  }
  message('Page not found', 'That page does not exist.');
}

document.addEventListener('DOMContentLoaded', () => {
  DB.load();
  Auth.restore();
  $('#menuToggle').onclick = () => $('#nav').classList.toggle('open');
  $('#resetData').onclick = e => {
    e.preventDefault();
    confirmBox('Delete all changes and regenerate the random test data?', () => { DB.reset(); Auth.logout(); toast('Test data regenerated'); location.hash = '#/'; route(); }, 'Reset');
  };
  window.addEventListener('hashchange', route);
  route();
});
