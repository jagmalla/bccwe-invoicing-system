# Deploying to the live server

The live site is a cPanel **Node.js app**, not a plain static site. Getting the
folder level wrong is the single most common way a deploy silently does nothing,
so the layout is written down here rather than remembered.

## Server layout

```
testpos.canadawholesalebc.com/      <- Node app root (cPanel "Application root")
├── server.js                       <- the Node server
├── db-config.json                  <- DB credentials + adminPassword
├── public/                         <- ***THE WEB FOLDER*** — everything served lives here
│   ├── index.html
│   ├── admin.html
│   ├── build-check.html
│   ├── app/                        <- the 19 app files (screens-*.jsx, styles.css, ...)
│   └── vendor/                     <- React, Babel, JsBarcode (rarely changes)
├── uploads/                        <- invoice attachments (NEVER touch)
├── tmp/  cgi-bin/  .well-known/    <- cPanel's own, leave alone
```

`server.js` serves the site with:

```js
app.use(express.static(path.join(__dirname, "public")));
```

So **`public/` is the only folder the app reads from.** A file placed at the app
root instead is not served by Node — but cPanel/Passenger will serve a file that
physically exists at the root *before* handing the request to Node, so a stray
copy there silently shadows the real one. That is what happened on 2026-08-16:
an FTP extract at the root created a second `app/` folder that overrode
`public/app/` and made three correct uploads look like they had no effect.

**In the browser the URL is `/app/screens-b.jsx`; on disk that file is
`public/app/screens-b.jsx`.** The URL path and the disk path are not the same
thing — this is what makes the mistake easy to make.

## How release ZIPs must be packaged

The archive's **top folder must be `public/`**, so extracting it at the Node app
root drops every file exactly where it belongs and overwrites in place:

```
bccwe-<build>.zip
└── public/
    ├── index.html
    ├── build-check.html
    └── app/ ...
```

Do **not** ship an archive whose top level is `index.html` + `app/`. It gives no
clue about the intended level and extracts to the wrong place at the root.

## Always ship a ZIP, never loose files

File names lose their hyphens when downloaded through chat (`screens-b.jsx`
arrives as `screensb.jsx`). Uploading those writes new, unused files while the
real ones stay stale — an upload that reports success and changes nothing.
Names inside a ZIP are preserved, so ZIP everything, always.

## Steps

1. Bump `?v=YYYYMMDDx` on all 19 tags in `public/index.html` (cache busting).
2. `node test-harness.js` — must be all green. This is the deploy gate.
3. Build the ZIP with `public/` as the top folder (see above).
4. Extract at the Node app root, overwriting.
5. Hard-refresh (Ctrl+Shift+R), then open `/build-check.html` to confirm.
6. Restart the Node app in cPanel **only if `server.js` or `db-config.json`
   changed.** App-file-only changes need no restart.

## Faster route for app files only

`https://<site>/admin` uploads `.jsx` / `.css` / `.js` straight into
`public/app/`, backing up what it replaces. It cannot write `index.html` or
`data.js` by design.

This works without a version bump: `express.static` sends
`Cache-Control: public, max-age=0`, so browsers revalidate on every load and
pick up new file contents even when the URL still carries an old `?v=` stamp.
Verified — a cached copy returned `304 Not Modified`, and the same request
returned `200` with fresh content the moment the file changed on disk.
