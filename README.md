# DesignMatch - Interior Design Marketplace (prototype)

Plain HTML, CSS and JavaScript. No build step, no server needed.

## Run
Open `index.html` in a browser. Data is stored in the browser's localStorage and is generated automatically on first load.

## Demo accounts (password for all: password123)
| Role | Email |
|---|---|
| Customer | customer1@example.com |
| Interior Designer | designer1@example.com |
| User Admin | admin1@example.com |
| Platform Management | platform1@example.com |

Registering on the site creates a customer (as in the diagram). Designer, admin and platform accounts are created by a User Admin.

## Structure
- `js/entities.js`    ENTITY layer
- `js/controllers.js` CONTROL layer
- `js/boundary.js`    BOUNDARY classes from the class diagram; `js/pages.js` renders the HTML
- `js/seed.js`        random test data (150 users, 35 companies, 12 categories, 100 listings, 100 bookings, 100 favourites, 400 view logs)
- `DIAGRAM_MAP.md`    how every diagram element maps to code
- `audit/`            `node audit/audit.js . audit/sequence.drawio` checks the code against your diagrams
