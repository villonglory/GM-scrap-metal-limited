# GM Scrapmetal Limited website (HTML, CSS, JavaScript)

A plain website: no frameworks, no build step, nothing to install.

## Open it

Double-click **`index.html`** to open it in your browser.

(Optional) To view it like a real website, run a small local server in this folder, for example `npx serve .` and open the address it prints.

## Files

```
index.html               Home page
what-we-buy.html         Materials we buy
services.html            Services
gallery.html             Our Work (photo gallery)
industrial-buyers.html   Buyer enquiry form
sell-your-scrap.html     Supplier enquiry form ("Sell Your Scrap")
about.html               About us (+ image credits)
contact.html             Contact details, form and map
privacy.html             Privacy notice
admin.html               Admin dashboard: login, gallery, enquiries, website settings
404.html                 "Page not found" page

css/style.css            All the styling (colours are at the top, section 1)
css/admin.css            Extra styling for the admin dashboard only
js/config.js             ★ WEBSITE SETTINGS: phones, WhatsApp, email, address, map, Supabase keys
js/main.js               Website behaviour (menu, WhatsApp, forms, counters, gallery)
js/admin.js              Admin dashboard behaviour (login, upload, edit, enquiries, settings)
setup/supabase-setup.sql One-time database setup for the admin (run in Supabase)
images/logo.png          GM Scrapmetal Limited logo
images/favicon.svg       Browser tab icon
images/stock/            Illustrative photos (Unsplash License, credited on the About page)
images/gallery/          (optional) photos added by hand instead of through admin
```

## How the pieces work together

- **HTML** files hold the content of each page. Each page repeats the same header (menu) and footer, so if you change the menu, change it in every `.html` file.
- **css/style.css** controls how everything looks. Brand colours are variables at the top (`--charcoal`, `--steel`...).
- **js/config.js** holds the details that may change. Elements in the HTML with `data-field="email"` (etc.) are filled in from this file, and buttons with `data-whatsapp="supplier"` become WhatsApp links.
- **js/main.js** makes the site interactive. It is split into numbered, commented sections.

## Common changes

| I want to… | Edit |
| --- | --- |
| Change phone numbers / WhatsApp / email / address / hours / map | `admin.html` → Website Settings (or `js/config.js`) |
| Change the pre-written WhatsApp messages | `js/config.js` → `whatsappMessages` |
| Add, edit, hide, reorder or delete gallery photos | `admin.html` → Gallery |
| Read and follow up enquiries | `admin.html` → Supplier Enquiries / Buyer Enquiries / Messages (copies also arrive by email) |
| Change the gallery categories | `js/config.js` → `galleryCategories` |
| Change the statistics (25+ companies, 100+ people, 10+ institutions) | `index.html` and `about.html`: change both `data-count="25"` and the `25` inside the tag |
| Change page text | the relevant `.html` file |
| Add / remove a material category | `what-we-buy.html` (copy an `<article class="material-card">` block); also update the drop-downs in `sell-your-scrap.html` and `industrial-buyers.html` |
| Change colours or fonts | top of `css/style.css` |

Empty values in `config.js` show as "To be confirmed" on the site, never as a broken link.

## Statistics

The row of numbers (25+ Companies, 100+ People, 10+ Institutions) counts up from 0 when a visitor scrolls to it. It is always one row of three, on phones too. Visitors who have "reduce motion" turned on, or have JavaScript off, simply see the final numbers.

## How the forms work

All three forms (Sell Your Scrap, Industrial Buyers, Contact):

1. check the answers in the browser (required fields, phone number, email, quantity, consent) and show clear error messages;
2. **email the enquiry to you through Formspree** (`https://formspree.io/f/xrpedbbw`). It arrives in the email inbox linked to your Formspree account;
3. **save the enquiry in the admin dashboard** (once Supabase is set up, see below), under Supplier Enquiries, Buyer Enquiries or Messages, where you can track its status;
4. **open WhatsApp** to the business number (+255 748 207 225) with the same enquiry ready. The visitor presses Send in WhatsApp and can attach photos there.

So even if a visitor never presses Send in WhatsApp, you still receive the enquiry. The confirmation screen tells the visitor whether the copy went through.

Settings in `js/config.js` → `forms`:
- `openWhatsApp: false` = email only (the button becomes "Send enquiry" and the visitor sees "Enquiry sent").
- `formspreeEndpoint: ""` = WhatsApp only.

Spam protection: a hidden "honeypot" field blocks simple bots, and Formspree filters spam too. In your Formspree form settings you can also restrict submissions to your website's domain once it is online.

**First submission:** Formspree may ask you to confirm the form by email the first time it receives a submission. Check the inbox (and spam folder) of your Formspree account.

## Admin dashboard

`admin.html` is the staff area. After signing in you get:

- **Overview**: counts of photos and new enquiries, and the latest enquiries.
- **Gallery**: add photos (several at once, with previews, title, caption, category, project date), edit details, publish or hide, reorder, search, filter, and delete. Changes appear on the public "Our Work" gallery immediately, with no code change or re-upload of the website.
- **Supplier Enquiries / Buyer Enquiries / Messages**: everything sent through the website forms, with search, status filter, pages, contact buttons (call, WhatsApp, email), status (New, Contacted, In Discussion, Completed, Archived) and private notes.
- **Website Settings**: phone numbers, WhatsApp number, email, address, business hours and map. Saved values replace those in `js/config.js` on the live site.
- **Log out**, plus **Forgot password?** on the sign-in page.

A plain HTML site cannot check passwords or store uploads by itself, so the dashboard uses **Supabase** (free plan) for secure login, the database and image storage. The website itself stays plain HTML, CSS and JavaScript.

### Admin dashboard setup (one time, about 15 minutes)

**1. Create a Supabase project**
Go to **supabase.com**, create a free account, click **New project**, give it a name (e.g. *gm-scrapmetal*), set a strong database password (save it somewhere safe), choose a region (e.g. a European or African region), and click **Create**. Wait until it says the project is ready.
*(Your project ID is `apxdppjggckucftegnox`; its URL is already filled in.)*

**2. Find the project URL and public key**
In your project: **Project Settings** (gear icon) →
- **Data API** (or **API**) → **Project URL**, e.g. `https://apxdppjggckucftegnox.supabase.co`
- **API Keys** → the **anon public** key (a long text starting `eyJ…`) *or* the **publishable** key (starting `sb_publishable_…`). Either works.

⚠️ Never copy the **service_role** or **secret** key into the website. Those keys bypass all security.

**3. Put them in `js/config.js`**
Open `js/config.js` in a text editor and fill in:
```js
supabase: {
  url: "https://apxdppjggckucftegnox.supabase.co",
  anonKey: "PASTE-YOUR-ANON-OR-PUBLISHABLE-KEY-HERE",
},
```
Save the file. (These two values are designed to be public; the database rules decide what each visitor may do.)

**4. Create your administrator account and switch off public sign-ups**
- **Authentication → Users → Add user → Create new user.** Enter your email and a strong password (at least 10 characters), tick **Auto Confirm User**, and click **Create user**.
- **Authentication → Sign In / Providers → Email**: switch **off** "Allow new users to sign up" and save. Now nobody can create an account except you, from this screen.

**5. Run the database setup script**
- Open `setup/supabase-setup.sql` in a text editor and copy everything.
- In Supabase: **SQL Editor → New query**, paste it in.
- In section 1, replace `YOUR-ADMIN-EMAIL@example.com` (the line marked ←) with the email from step 4.
- Click **Run**. You should see *"Success. No rows returned"*.

This creates the photo table, the enquiries table, the settings table, the **gallery** image storage bucket (public viewing, admin-only uploads, images only, max 5 MB), and all the security rules. It is safe to run again later.

**6. How administrator access works**
Logging in is not enough: the email must also be on the **admin list** created in step 5. To add another admin later, create their user (step 4), then run this in the SQL Editor:
```sql
insert into public.admin_users (email) values ('new-person@example.com');
```
To remove someone: delete them under **Authentication → Users** and run:
```sql
delete from public.admin_users where email = 'person@example.com';
```

**7. Storage bucket and rules**
Step 5 creates them for you. To check: **Storage** should show a bucket called **gallery** marked *Public*. Do not change it to private, or the website cannot show the photos. You don't need to add any policies by hand.

**8. Allow the password-reset link**
**Authentication → URL Configuration**: set **Site URL** to your website address (e.g. `https://www.your-domain.co.tz`) and add `https://www.your-domain.co.tz/admin.html` under **Redirect URLs**. For testing on your computer also add `http://localhost:3000/admin.html`.

**9. Run the website on your computer**
In this folder run `npx serve . -l 3000` and open **http://localhost:3000**. (Double-clicking `index.html` works for viewing the site, but use the local server for the admin dashboard.)

**10. Test it**
1. Open **http://localhost:3000/admin.html**. You should see the sign-in page (no warning box).
2. Try a wrong password: you should see "Incorrect email or password".
3. Sign in with your admin account: the dashboard opens.
4. **Gallery → + Add Photos**: choose 2–3 photos, add titles, pick a category, click **Upload**. They appear in the list.
5. Refresh the page: you stay signed in and the photos are still there.
6. Open **http://localhost:3000/gallery.html** in another tab: the photos are shown. Click one to enlarge it.
7. Back in the dashboard, **Edit** a title, **Hide** a photo, **Delete** one. Refresh the gallery tab and check the changes.
8. Send a test enquiry from **Sell Your Scrap**: it appears under **Supplier Enquiries**.
9. **Website Settings**: change business hours, save, refresh the Contact page.
10. **Log out**, then open `admin.html#gallery`: you're sent back to the sign-in page.

### Putting the dashboard online

Upload the whole website (including the updated `js/config.js` and `admin.html`) to your host as described under "Putting it online" below, then complete step 8 with your real domain. Sign in at `https://your-domain/admin.html`.

### How it stays secure

- No public sign-up; accounts are created only by you in Supabase, and must also be on the admin list.
- Passwords are hashed and checked by Supabase, with built-in limits on repeated login attempts.
- Security rules run **inside the database**, not in the website code, and Row Level Security stays on for every table:
  - visitors can only see **published** photos and the contact details, and can **send** an enquiry but never read one;
  - only listed admins can upload, edit, publish, reorder or delete photos, read enquiries, or change settings;
  - logged-in accounts that aren't on the admin list are refused everything above.
- Uploads must be real JPG, JPEG, PNG or WebP images (file contents checked in the browser, and type and size enforced again by Supabase). Photos are resized to 1600 px and re-saved as JPEG, which also removes hidden GPS location data.
- A basic flood limit stops more than 60 form enquiries arriving within 10 minutes.

Note: free Supabase projects pause after a long period with no activity. If the gallery stops showing uploaded photos, sign in at supabase.com and click **Restore project**.

## Still to provide

- Confirm the second phone number. You sent `+657440267`; the site shows it as **+255 657 440 267**. Correct it in `js/config.js` if that's wrong.
- **Business hours** (in `js/config.js`)
- **Supabase setup** for the admin dashboard (steps above). Your project URL is filled in; the **anon key** is still needed.
- Genuine **project photographs** for the gallery (upload through admin)
- Optional: year established, registration number, leadership names (add to `about.html`)
- Partner names (Azam Mbagala, Azania Investments, Dar es Salaam Port) only after the relationship is confirmed and written permission is given

## Putting it online

Upload the whole folder's contents (you can leave out `README.md` and `setup/`) to any web host: cPanel/shared hosting (into `public_html`), Netlify (drag and drop the folder at app.netlify.com/drop), GitHub Pages, or Cloudflare Pages. No server software is needed.

After it is online, you can add a `sitemap.xml` listing your page addresses (it needs the final domain name).
