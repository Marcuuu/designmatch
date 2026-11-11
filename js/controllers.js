/* controllers.js - CONTROL layer (business logic).
   AccountController, DiscoveryController, ListingController and BookingController match the class diagram exactly:
   same method names, same parameter order, and each one makes only the calls shown in the sequence diagram.
   Everything marked EXTENSION is needed by the brief but is not on the diagrams, and lives in its own object.
   Result(success, value): value is a message (Result(true, Registered)) or the returned object (Result(true, listing)). */

function Result(success, value, data) {
  return {
    ok: success,
    value,
    message: typeof value === "string" ? value : "",
    data: typeof value === "object" && value !== null ? value : data,
  };
}
const H = 36e5,
  D = 24 * H;
const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];
const STYLES = [
  "Scandinavian",
  "Modern Minimalist",
  "Industrial",
  "Japandi",
  "Contemporary",
  "Mid-century",
  "Rustic",
  "Luxury Classic",
  "Tropical",
];
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/* ===== «control» AccountController (US-01) ===== */
const AccountController = {
  registerCustomer(name, email, password) {
    name = String(name || "").trim();
    email = String(email || "").trim();
    if (name.length < 2) return Result(false, "Please enter your name.");
    if (!emailOk(email))
      return Result(false, "Please enter a valid email address.");
    if (String(password || "").length < 8)
      return Result(false, "Password must be at least 8 characters.");
    const u = UserAccount.create(
      name,
      email,
      hashPassword(password),
      "CUSTOMER",
      "ACTIVE",
    );
    if (!u) return Result(false, "That email is already registered.");
    return Result(true, "Registered");
  },
};

/* ===== «control» DiscoveryController (US-22, US-25 which includes US-33) ===== */
const DiscoveryController = {
  searchPublished(keyword) {
    return Listing.searchByKeyword(keyword, "PUBLISHED");
  },
  getListingDetails(listingId) {
    const listing = Listing.findById(listingId);
    if (!listing || listing.status !== "PUBLISHED")
      return Result(false, "This project is not available.");
    Listing.recordView(listingId); // US-33 Record Listing View (included)
    listing.viewCount++; // show the view that was just recorded
    return Result(true, listing);
  },
};

/* ===== «control» ListingController (US-14, US-16) ===== */
const ListingController = {
  _validate(
    title,
    description,
    categoryId,
    style,
    minBudget,
    maxBudget,
    status,
  ) {
    if (String(title || "").trim().length < 3)
      return "Title must be at least 3 characters.";
    if (String(description || "").trim().length < 10)
      return "Description must be at least 10 characters.";
    if (!Category.findById(categoryId)) return "Please choose a category.";
    if (!STYLES.includes(style)) return "Please choose a style.";
    if (
      minBudget === "" ||
      maxBudget === "" ||
      !(Number(minBudget) >= 0) ||
      !(Number(maxBudget) >= 0)
    )
      return "Please enter both budget values.";
    if (Number(maxBudget) < Number(minBudget))
      return "Maximum budget cannot be lower than minimum budget.";
    if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status))
      return "Invalid status.";
    return null;
  },
  createListing(
    designerId,
    title,
    description,
    categoryId,
    style,
    minBudget,
    maxBudget,
    status,
  ) {
    const err = this._validate(
      title,
      description,
      categoryId,
      style,
      minBudget,
      maxBudget,
      status,
    );
    if (err) return Result(false, err);
    const listing = Listing.create(
      designerId,
      categoryId,
      String(title).trim(),
      String(description).trim(),
      style,
      minBudget,
      maxBudget,
      status,
      Date.now(),
    );
    return Result(true, "Listing created", listing);
  },
  updateListing(
    listingId,
    designerId,
    title,
    description,
    categoryId,
    style,
    minBudget,
    maxBudget,
    status,
  ) {
    const err = this._validate(
      title,
      description,
      categoryId,
      style,
      minBudget,
      maxBudget,
      status,
    );
    if (err) return Result(false, err);
    const listing = Listing.update(
      listingId,
      categoryId,
      String(title).trim(),
      String(description).trim(),
      style,
      minBudget,
      maxBudget,
      status,
    );
    return Result(true, "Listing updated", listing);
  },
};

/* ===== «control» BookingController (US-41, US-43, US-47, US-48) ===== */
const BookingController = {
  requestBooking(customerId, listingId, preferredDate, message) {
    if (!preferredDate || preferredDate < new Date().toISOString().slice(0, 10))
      return Result(
        false,
        "Please choose a preferred date that is today or later.",
      );
    if (String(message || "").trim().length < 5)
      return Result(false, "Please add a short message for the designer.");
    const booking = Booking.create(
      customerId,
      listingId,
      preferredDate,
      String(message).trim(),
      "PENDING",
      Date.now(),
    );
    return Result(true, "Booking request sent", booking);
  },
  getBookingStatus(customerId) {
    return Booking.findByCustomerId(customerId);
  },
  decideBooking(bookingId, designerId, decision) {
    if (decision === "ACCEPT") Booking.updateStatus(bookingId, "CONFIRMED");
    else if (decision === "DECLINE")
      Booking.updateStatus(bookingId, "CANCELLED");
    else return Result(false, "Invalid decision.");
    return Result(
      true,
      decision === "ACCEPT" ? "Booking accepted" : "Booking declined",
    );
  },
  updateBookingProgress(bookingId, designerId, newStatus, note) {
    if (!BOOKING_STATUSES.includes(newStatus) || newStatus === "PENDING")
      return Result(false, "Invalid status.");
    Booking.updateStatus(bookingId, newStatus);
    Booking.addNote(bookingId, note); // blank notes are ignored by the entity
    return Result(true, "Booking updated");
  },
};

/* =====================================================================
   EXTENSIONS (not on the diagrams) - needed to satisfy the brief
   ===================================================================== */

/* login, own profile (brief item 1) */
const AuthController = {
  login(email, password) {
    const u = UserAccount.findByEmail(String(email || "").trim());
    if (!u || u.passwordHash !== hashPassword(String(password || "")))
      return Result(false, "Incorrect email or password.");
    if (u.status !== "ACTIVE")
      return Result(
        false,
        "This account is suspended. Please contact a User Admin.",
      );
    return Result(true, u);
  },
  updateProfile(userId, name) {
    name = String(name || "").trim();
    if (name.length < 2) return Result(false, "Please enter your name.");
    return Result(true, UserAccount.update(userId, { name }));
  },
  changePassword(userId, current, next) {
    const u = UserAccount.findById(userId);
    if (u.passwordHash !== hashPassword(String(current || "")))
      return Result(false, "Current password is incorrect.");
    if (String(next || "").length < 8)
      return Result(false, "New password must be at least 8 characters.");
    UserAccount.update(userId, { passwordHash: hashPassword(next) });
    return Result(true, "Password changed");
  },
};

/* User Admin: manage accounts of every type (brief item 1) */
const AdminController = {
  listUsers({ keyword = "", role = "", status = "" } = {}) {
    const k = keyword.trim().toLowerCase();
    return UserAccount.all()
      .filter(
        (u) =>
          (!role || u.role === role) &&
          (!status || u.status === status) &&
          (!k || (u.name + " " + u.email).toLowerCase().includes(k)),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  },
  createUser(d) {
    const name = String(d.name || "").trim(),
      email = String(d.email || "").trim();
    if (name.length < 2) return Result(false, "Please enter a name.");
    if (!emailOk(email))
      return Result(false, "Please enter a valid email address.");
    if (String(d.password || "").length < 8)
      return Result(false, "Password must be at least 8 characters.");
    if (!["ADMIN", "PLATFORM", "DESIGNER", "CUSTOMER"].includes(d.role))
      return Result(false, "Invalid role.");
    const u = UserAccount.create(
      name,
      email,
      hashPassword(d.password),
      d.role,
      "ACTIVE",
    );
    if (!u) return Result(false, "That email is already registered.");
    if (d.role === "DESIGNER")
      Company.save(u.id, {
        name: name + " Interiors",
        description: "",
        address: "",
        phone: "",
        email: u.email,
        website: "",
        yearEstablished: new Date().getFullYear(),
      });
    return Result(true, "Account created", u);
  },
  updateUser(adminId, userId, d) {
    const u = UserAccount.findById(userId);
    if (!u) return Result(false, "User not found.");
    if (String(d.name || "").trim().length < 2)
      return Result(false, "Please enter a name.");
    if (+adminId === +userId && (d.role !== u.role || d.status !== "ACTIVE"))
      return Result(
        false,
        "You cannot change your own role or suspend yourself.",
      );
    if (
      !["ADMIN", "PLATFORM", "DESIGNER", "CUSTOMER"].includes(d.role) ||
      !["ACTIVE", "SUSPENDED"].includes(d.status)
    )
      return Result(false, "Invalid role or status.");
    UserAccount.update(userId, {
      name: d.name.trim(),
      role: d.role,
      status: d.status,
    });
    if (d.role === "DESIGNER" && !Company.findByDesigner(userId))
      Company.save(userId, {
        name: u.name + " Interiors",
        description: "",
        address: "",
        phone: "",
        email: u.email,
        website: "",
        yearEstablished: new Date().getFullYear(),
      });
    return Result(true, "Account updated", u);
  },
  setStatus(adminId, userId, status) {
    const u = UserAccount.findById(userId);
    return this.updateUser(adminId, userId, {
      name: u.name,
      role: u.role,
      status,
    });
  },
};

/* Interior Designer workspace: portfolio list, interest tracking, incoming bookings, current/past flag (brief items 3 and 5) */
const DesignerWorkspaceController = {
  getMyListings(designerId) {
    return Listing.findByDesigner(designerId)
      .map((l) =>
        Object.assign(l, {
          bookingCount: Booking.all().filter((b) => b.listingId === l.id)
            .length,
        }),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  },
  setListingStatus(listingId, designerId, status) {
    const l = Listing.all().find((x) => x.id === +listingId);
    if (!l || l.designerId !== +designerId)
      return Result(false, "Project not found.");
    Listing.setStatus(listingId, status);
    return Result(true, "Status updated");
  },
  setProjectState(listingId, designerId, projectState) {
    const l = Listing.all().find((x) => x.id === +listingId);
    if (
      !l ||
      l.designerId !== +designerId ||
      !["CURRENT", "PAST"].includes(projectState)
    )
      return Result(false, "Could not save project type.");
    ProjectInfo.set(listingId, projectState);
    return Result(true, "Project type saved");
  },
  getDesignerBookings(designerId) {
    return Booking.findByDesignerId(designerId).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  },
};

const CompanyController = {
  getCompany(designerId) {
    return Company.findByDesigner(designerId) || {};
  },
  saveCompany(designerId, d) {
    if (String(d.name || "").trim().length < 2)
      return Result(false, "Company name is required.");
    if (d.email && !emailOk(d.email))
      return Result(false, "Please enter a valid company email.");
    const y = Number(d.yearEstablished);
    if (d.yearEstablished && (y < 1900 || y > new Date().getFullYear()))
      return Result(false, "Please enter a valid year established.");
    return Result(
      true,
      "Company information saved",
      Company.save(designerId, {
        name: d.name.trim(),
        description: d.description || "",
        address: d.address || "",
        phone: d.phone || "",
        email: d.email || "",
        website: d.website || "",
        yearEstablished: y || "",
      }),
    );
  },
  getCompanyPage(designerId) {
    const company = Company.findByDesigner(designerId),
      designer = UserAccount.findById(designerId);
    if (!company || !designer || designer.role !== "DESIGNER")
      return Result(false, "Company not found.");
    return Result(true, {
      company,
      designer,
      listings: Listing.findByDesigner(designerId).filter(
        (l) => l.status === "PUBLISHED",
      ),
    });
  },
};

/* customers save projects for reference (brief item 4) */
const FavouriteController = {
  toggle(customerId, listingId) {
    const l = Listing.all().find((x) => x.id === +listingId);
    if (!l || l.status !== "PUBLISHED")
      return Result(false, "Project not available.");
    if (Favourite.find(customerId, listingId)) {
      Favourite.remove(customerId, listingId);
      return Result(true, "Removed from favourites", false);
    }
    Favourite.add(customerId, listingId);
    return Result(true, "Saved to favourites", true);
  },
  isFavourite(customerId, listingId) {
    return !!Favourite.find(customerId, listingId);
  },
  getFavourites(customerId) {
    return Favourite.findByCustomerId(customerId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((f) => Listing.findById(f.listingId))
      .filter(Boolean);
  },
};

/* Platform Management: IDP categories (brief item 6) */
const CategoryController = {
  list() {
    return Category.all().map((c) =>
      Object.assign({}, c, {
        listingCount: Listing.all().filter((l) => l.categoryId === c.id).length,
      }),
    );
  },
  create(name, description) {
    name = String(name || "").trim();
    if (name.length < 2) return Result(false, "Category name is required.");
    if (Category.all().some((c) => c.name.toLowerCase() === name.toLowerCase()))
      return Result(false, "That category already exists.");
    return Result(
      true,
      "Category added",
      Category.create(name, description || ""),
    );
  },
  update(id, name, description, status) {
    name = String(name || "").trim();
    if (name.length < 2) return Result(false, "Category name is required.");
    if (
      Category.all().some(
        (c) => c.id !== +id && c.name.toLowerCase() === name.toLowerCase(),
      )
    )
      return Result(false, "That category already exists.");
    Category.update(id, { name, description: description || "", status });
    return Result(true, "Category updated");
  },
  remove(id) {
    if (Listing.all().some((l) => l.categoryId === +id))
      return Result(
        false,
        "This category is used by projects. Deactivate it instead.",
      );
    Category.remove(id);
    return Result(true, "Category deleted");
  },
};

/* Platform Management: daily / weekly / monthly reports (brief item 6) */
const ReportController = {
  generate(period) {
    const cfg = {
      daily: [D, H, "hour"],
      weekly: [7 * D, D, "day"],
      monthly: [30 * D, D, "day"],
    }[period];
    if (!cfg) return Result(false, "Unknown period.");
    const [span, step, unit] = cfg,
      end = Date.now(),
      start = end - span,
      n = Math.round(span / step);
    const buckets = Array.from({ length: n }, (_, i) => {
      const d = new Date(start + i * step);
      return {
        label:
          unit === "hour"
            ? String(d.getHours()).padStart(2, "0") + ":00"
            : d.getDate() + " " + d.toLocaleString("en-GB", { month: "short" }),
        views: 0,
        shortlists: 0,
        bookings: 0,
        listings: 0,
        users: 0,
      };
    });
    const put = (ts, key) => {
      const i = Math.floor((ts - start) / step);
      if (i >= 0 && i < n) {
        buckets[i][key]++;
        return true;
      }
      return false;
    };
    const topMap = {},
      catMap = {},
      roleMap = { CUSTOMER: 0, DESIGNER: 0, ADMIN: 0, PLATFORM: 0 };
    DB.data.views.forEach((v) => {
      if (!put(v.at, "views")) return;
      topMap[v.listingId] = (topMap[v.listingId] || 0) + 1;
      const l = Listing.all().find((x) => x.id === v.listingId),
        c = l && Category.findById(l.categoryId);
      if (c) catMap[c.name] = (catMap[c.name] || 0) + 1;
    });
    DB.data.favourites.forEach((f) => put(f.createdAt, "shortlists"));
    DB.data.bookings.forEach((b) => put(b.createdAt, "bookings"));
    DB.data.listings.forEach((l) => put(l.createdAt, "listings"));
    DB.data.users.forEach((u) => {
      if (put(u.createdAt, "users")) roleMap[u.role]++;
    });
    const sum = (k) => buckets.reduce((s, b) => s + b[k], 0);
    const topListings = Object.entries(topMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, views]) =>
        Object.assign(Listing.findById(id), { periodViews: views }),
      );
    return Result(true, {
      period,
      start,
      end,
      buckets,
      totals: {
        views: sum("views"),
        shortlists: sum("shortlists"),
        bookings: sum("bookings"),
        listings: sum("listings"),
        users: sum("users"),
      },
      topListings,
      categoryViews: Object.entries(catMap).sort((a, b) => b[1] - a[1]),
      newUsersByRole: roleMap,
    });
  },
  toCSV(report) {
    const rows = [
      [
        "Period",
        "Views",
        "Shortlists",
        "Bookings",
        "New projects",
        "New users",
      ],
    ];
    report.buckets.forEach((b) =>
      rows.push([
        b.label,
        b.views,
        b.shortlists,
        b.bookings,
        b.listings,
        b.users,
      ]),
    );
    return rows.map((r) => r.join(",")).join("\n");
  },
};
