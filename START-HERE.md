# BCCWE Invoicing System — complete package

Everything as of build **20260816k**, including `node_modules` so nothing has to
be downloaded to run it.

## What is in here

```
public/            the website — index.html, admin.html, build-check.html, app/, vendor/
server.js          the Node server
node_modules/      all 9 libraries, ready to run (no npm install needed)
package.json       the dependency list
test-harness.js    288 automated checks — run before every deploy
db-config.example.json   the shape of the config file (see below)

DEPLOY.md          how to deploy to the live server, and the folder trap to avoid
PROJECT-GUIDE.md   how the system is built
FIX-PLAN.md        every bug found in the audits and how it was fixed
invoices-12pct.txt the 51 invoice numbers that were charged 12% tax
```

## The one file you must add: db-config.json

Your database and admin passwords are **not** in this package, and never in
GitHub — that is what keeps them private. The live server has the real file.

**To get your copy:** cPanel → File Manager → open the folder containing
`server.js` → download `db-config.json`. Put it next to `server.js` here.

If you would rather retype it, copy `db-config.example.json` to
`db-config.json` and fill in the four values:

```json
{
  "host": "localhost",
  "port": 3306,
  "user": "your database username",
  "password": "your database password",
  "database": "your database name",
  "adminPassword": "the password for the /admin update page"
}
```

Keep this file off GitHub, out of email, and out of any ZIP you share.

## Running it on your own computer

1. Install Node.js 18 or newer from https://nodejs.org (the "LTS" button).
2. Put `db-config.json` in place, as above.
3. Open a terminal in this folder and run:

   ```
   node server.js
   ```

4. Open http://localhost:3000 in your browser.

It talks to whichever database `db-config.json` points at. Pointing it at your
LIVE database means every change you make locally is a change to the real books —
use a copy of the database if you are experimenting.

## Before deploying any change

```
node test-harness.js
```

All 288 checks must pass. Then follow `DEPLOY.md` — note especially that release
ZIPs must have `public/` as their top folder, and that files belong in
`public/app/`, never in an `app/` folder at the server root.

## A note on node_modules

These libraries were installed on Linux. They are plain JavaScript and work
anywhere, but if you ever hit a module error on Windows or macOS, delete the
`node_modules` folder and run `npm install` to fetch fresh copies for your
system. `package.json` lists exactly what is needed.
