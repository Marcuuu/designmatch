/* boundary.js - BOUNDARY layer: the four page classes from the class diagram.
   Method names and parameters match the diagram. Each method does what the sequence diagram shows:
   it passes the request to the controller (adding the logged-in user's id where the controller needs customerId / designerId)
   and returns the controller's Result. The HTML rendering lives in pages.js and calls these methods. */

/* «boundary» Registration / Login Page */
const RegistrationLoginPage = {
  register(name, email, password) { return AccountController.registerCustomer(name, email, password); }
};

/* «boundary» Search / Listing Details Pages */
const SearchListingDetailsPages = {
  search(keyword) { return DiscoveryController.searchPublished(keyword); },
  viewDetails(listingId) { return DiscoveryController.getListingDetails(listingId); }
};

/* «boundary» Company / Portfolio Pages */
const CompanyPortfolioPages = {
  createListing(title, description, categoryId, style, minBudget, maxBudget, status) {
    return ListingController.createListing(Auth.user().id, title, description, categoryId, style, minBudget, maxBudget, status);
  },
  editListing(listingId, title, description, categoryId, style, minBudget, maxBudget, status) {
    return ListingController.updateListing(listingId, Auth.user().id, title, description, categoryId, style, minBudget, maxBudget, status);
  }
};

/* «boundary» Booking Pages */
const BookingPages = {
  requestBooking(listingId, preferredDate, message) { return BookingController.requestBooking(Auth.user().id, listingId, preferredDate, message); },
  viewStatus() { return BookingController.getBookingStatus(Auth.user().id); },
  acceptOrDecline(bookingId, decision) { return BookingController.decideBooking(bookingId, Auth.user().id, decision); },
  updateProgress(bookingId, newStatus, note) { return BookingController.updateBookingProgress(bookingId, Auth.user().id, newStatus, note); }
};
