# Deploying the BCCWE Invoicing System to A2 Hosting

This guide is written for a non-developer. Follow it top to bottom. Where it
says "click X," click exactly that. Take your time — none of these steps can
break anything permanently.

**Before you start, make sure your A2 Hosting plan supports Node.js.** All of
A2's shared plans (Startup, Drive, Turbo Boost, Turbo Max) do. If you log into
cPanel and can find an icon called **"Setup Node.js App"**, you're good.

There are 6 parts:

1. Create the MySQL database
2. Prepare your project files (a ZIP)
3. Upload the files to A2
4. Tell A2 it's a Node.js app
5. Add your database password file
6. Install and start the app

---

## Part 1 — Create the MySQL Database

1. Log in to your A2 Hosting account and open **cPanel**.
2. In the search box at the top of cPanel, type **"MySQL"** and click
   **"MySQL® Database Wizard"**.
3. **Step 1 – New Database:** type a simple name, e.g. `bccwe`.
   - cPanel adds a prefix automatically, so the real name becomes something
     like `youracct_bccwe`. **Write down the full name it shows.**
   - Click **"Next Step"**.
4. **Step 2 – Database Users:** create a username, e.g. `bccweuser`, and a
   password. Click the **"Password Generator"** to make a strong one.
   - **Write down the full username** (it will look like `youracct_bccweuser`)
     **and the password.** You will need both in Part 5.
   - Click **"Create User"**.
5. **Step 3 – Privileges:** check the box **"ALL PRIVILEGES"**, then click
   **"Next Step"**.
6. Done. You now have a database, a user, and a password. Keep those 3 things
   handy:
   - Database name: `youracct_bccwe`
   - Username: `youracct_bccweuser`
   - Password: `the one you generated`

---

## Part 2 — Prepare Your Project Files (a ZIP)

You need to upload the project **without** the `node_modules` folder (A2 will
build that itself) and **without** any local `db-config.json`.

If you received the project as a ZIP already, you can use it as long as it does
NOT contain a `node_modules` folder. Otherwise:

1. On your computer, find the `project` folder.
2. **Delete the `node_modules` folder inside it if one exists** (it's large and
   must be rebuilt on the server anyway).
3. Select everything inside `project` (server.js, package.json, the `public`
   folder, etc.) and create a ZIP file called `bccwe.zip`.
   - Windows: select the files → right-click → **Send to → Compressed (zipped) folder**.
   - Mac: select the files → right-click → **Compress**.

---

## Part 3 — Upload the Files to A2

1. In cPanel, search for and open **"File Manager"**.
2. In the left sidebar click your home folder (usually shown at the very top,
   above `public_html`).
3. Create a new folder for the app: click **"+ Folder"** at the top, name it
   `bccwe`, and click **Create New Folder**.
4. Double-click into the `bccwe` folder.
5. Click **"Upload"** at the top, then drag your `bccwe.zip` into the page (or
   click "Select File").
6. When it reaches 100%, go back to the File Manager tab.
7. Right-click `bccwe.zip` → **"Extract"** → confirm. You should now see
   `server.js`, `package.json`, the `public` folder, etc. directly inside the
   `bccwe` folder.
   - If everything extracted into a sub-folder by mistake, move the files up so
     that `server.js` sits directly inside `bccwe`.
8. You can delete `bccwe.zip` afterward to keep things tidy.

---

## Part 4 — Tell A2 It's a Node.js App

1. In cPanel, search for and open **"Setup Node.js App"**.
2. Click **"+ CREATE APPLICATION"** (top right).
3. Fill in the form:
   - **Node.js version:** pick the highest number available (e.g. 18.x or 20.x).
   - **Application mode:** **Production**.
   - **Application root:** type `bccwe` (the folder you made in Part 3).
   - **Application URL:** choose the website address where the app should live.
     Pick your domain, or a subdomain like `invoices.yourdomain.com` from the
     dropdown.
   - **Application startup file:** type `server.js`.
4. Click **"CREATE"**.
5. Leave this page open — you'll come back to it in Part 6.

---

## Part 5 — Add Your Database Password File

The app needs to know your database name, username, and password. The easiest
way is a small text file.

1. Go back to **File Manager** and open your `bccwe` folder.
2. Find the file **`db-config.example.json`**. Right-click it → **"Copy"**.
   - In the popup, set the destination to `/bccwe/db-config.json` (same folder,
     new name) and click **Copy File**.
   - (If copy is awkward, instead click **"+ File"**, name it
     `db-config.json`, and create it empty.)
3. Right-click your new **`db-config.json`** → **"Edit"** → **Edit** again to
   confirm.
4. Replace the contents so it looks exactly like this, but with **your** values
   from Part 1:

   ```json
   {
     "host": "localhost",
     "port": 3306,
     "user": "youracct_bccweuser",
     "password": "your-database-password",
     "database": "youracct_bccwe",
     "adminPassword": "pick-a-strong-update-password"
   }
   ```

   - Keep `"host"` as `"localhost"` (that's correct for A2).
   - `"adminPassword"` is a password **you choose** — it protects the in-app
     Update page (see "Updating the app later" below). Make it strong and
     keep it private.
   - Keep all the quotation marks and commas exactly as shown.
5. Click **"Save Changes"** (top right), then close the editor.

---

## Part 6 — Install and Start the App

1. Return to the **"Setup Node.js App"** page (reopen it from cPanel if needed)
   and click the **pencil/edit icon** next to your `bccwe` app.
2. Click the **"Run NPM Install"** button. Wait ~1–3 minutes. This downloads
   the pieces the app needs (Express, the MySQL driver, etc.). When it finishes
   you'll see a success message.
3. Click **"RESTART"** (or **"START APP"**).
4. Open a new browser tab and go to your Application URL from Part 4
   (e.g. `https://invoices.yourdomain.com`).
5. The first time it loads, you'll briefly see the "Loading BCCWE Invoicing..."
   screen, then the dashboard with sample starter data. **That sample data is
   now saved in your MySQL database.**

You're live. 🎉

---

## Everyday Use

- Just bookmark your Application URL. Create invoices, add inventory, manage
  clients — everything saves automatically to your database.
- Your data lives in MySQL on A2, so it stays safe even if the app restarts.

## Backing Up Your Data

Your business data is in the MySQL database, not in the files. To back it up:

1. In cPanel, open **"phpMyAdmin"**.
2. On the left, click your database (`youracct_bccwe`).
3. Click the **"Export"** tab at the top → **"Go"**. This downloads a `.sql`
   backup file. Do this occasionally (or set up cPanel's automatic backups).

---

## Troubleshooting

**The page says "database_error" or won't load past the loading screen.**
- Re-open `db-config.json` (Part 5) and double-check the database name, user,
  and password match exactly what you created in Part 1. A single wrong
  character (or a missing quote/comma) will stop the connection.
- In "Setup Node.js App," click **RESTART** after fixing the file.

**"Run NPM Install" failed.**
- Make sure `package.json` is directly inside the `bccwe` folder (not in a
  sub-folder). Re-check Part 3 step 7.

**I see a generic Passenger/500 error page.**
- In "Setup Node.js App," confirm the **Application startup file** is exactly
  `server.js` and the **Application root** is `bccwe`.

**I need to update the app later (the easy in-app way).**
- Your site has a built-in Update page at **`https://your-app-url/admin`**.
- Open it, enter your **adminPassword** (the one from `db-config.json`), pick
  the new design files exported from Claude Design (`.jsx` / `.css`), and click
  **Upload & Update**.
- Then open the main site and hard-refresh (**Ctrl+Shift+R**, or
  **Cmd+Shift+R** on Mac) to see the changes.
- This only updates the look/screens. It cannot touch `server.js`, your
  database, or the save logic, so your data and saving stay safe. A backup of
  every replaced file is kept on the server automatically.
- (You generally won't need to touch cPanel for design updates anymore. You'd
  only re-upload via File Manager + **RESTART** if `server.js` or `package.json`
  themselves change — which is rare.)

**Still stuck?**
- A2 Hosting has 24/7 support ("Guru Crew") via live chat in your account.
  Tell them: "I'm running a Node.js app via Setup Node.js App and need help
  starting it." They can see your setup and help.
