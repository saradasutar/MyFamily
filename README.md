# Family Dashboard v1.0.10

A private, mobile-friendly dashboard for about 10 family members. The frontend runs on GitHub Pages. Google Apps Script supplies the protected backend, Google Sheets stores the records, Google Drive stores full photos, and Gmail sends reminders.

## What the family can use

- Expenditure: use the exact `Amt (Rs.) / Date Paid / Send to / From Acct / Reason` format; add or edit one payment, bulk-paste up to 500 old records from Excel/Google Sheets, search, filter, export CSV, and view or print an inclusive From/To date-period report with its total.
- Easier reading: expenditure and income tables use subtle alternating light-colour rows on screen; the dedicated expenditure printout uses matching light row bands.
- Regular payments: add any monthly or yearly expenditure—such as electricity, maintenance, insurance, land/holding tax, subscriptions, school fees, or another item. Search schedules, receive email reminders, mark a due item as paid, and let the dashboard calculate its next due date automatically.
- Income: add, edit, search, filter, print, and export CSV.
- Targets: create family or personal targets and record contributions.
- Reminders: birthdays, anniversaries, appointments, renewals, payments, or other dates; choose same-day and advance email reminders.
- Sticky notes: open the HR-style centred Target / Reminder organiser from any page, add a note directly in its top form, choose a colour pill, and manage active cards with visible Keep open, Collapse, Edit, Completed and Delete controls. The whole organiser can minimize into its small floating launcher. Notes can still be dragged and resized. A pinned note is locked open above all other notes and dashboard fields—even after the organiser is minimized or closed. Unpin it to allow collapsing. Completed notes move to saved history and can be restored.
- Calendar: month view combining reminders, experiences, and diary entries.
- Family Diary: daily entries with mood, writer, tags, month filter, and full-text search.
- Photos: upload, resize, caption, search, view full-size, and store privately in Drive.
- Experiences: preserve trips, celebrations, lessons, and memories with date, place, tags, and writer name.
- Search: one search box across expenditure, income, targets, reminders, sticky notes, diary, photos, and experiences.
- Administration: add about 10 members, choose exactly which sections each member can view and use, set Member/Admin roles, activate/deactivate access, reset PINs, and create or inspect private monthly Sheet backups.
- Login convenience: optionally save the username on the current device; the PIN is never saved. The current version is shown on the login page and dashboard.
- Overview visibility: shows all active family members, the total number of saved reminders, and how many fall within the next 30 days.

Each active member sees only the sections enabled for them by an administrator. Access is enforced by the backend as well as hidden in the interface. Within an enabled section, members can see shared information and add or edit records. A member can delete an item they originally added; an administrator can delete any item and manage users/settings.

## Print expenditure for a From/To period

Open **Expenditure → Print**, select the inclusive **From date** and **To date**, then choose either **View selected period** or **Print selected period**. View opens the complete on-screen statement with its own **Print this report** button. Both versions contain only payments in that period, their total, family name, selected date range, and alternating light rows for easier reading.

## Import old expenditure

Open **Expenditure → Import old records**. Copy rows from Excel or Google Sheets and paste these five columns in this order:

| Amt (Rs.) | Date Paid | Send to | From Acct | Reason |
|---:|---|---|---|---|
| 12000 | 05/01/2024 | Mani SBI | Family SBI | Monthly 12k sent to Mani SBI on 05th & 20th of each month |

The heading row is optional. Dates can be `DD/MM/YYYY`, `DD-MMM-YYYY`, `YYYY-MM-DD`, or an Excel date number. Extra blank columns are removed, additional cells are merged into Reason, and missing Send to/From Acct/Reason values receive a clear `Not specified` or `Old expenditure` label. Up to 500 rows can be added at once.

## Files in this package

```text
Family-Dashboard/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── config.js
├── apps-script/
│   ├── Code.gs
│   └── appsscript.json
└── README.md
```

## Part 1 — Create the Google backend

1. Open [Google Apps Script](https://script.google.com/) while signed in to the Google account that should own the family data.
2. Click **New project** and rename it **Family Dashboard Backend**.
3. Open `apps-script/Code.gs` from this package. Copy everything and replace all text in the Apps Script `Code.gs` editor.
4. At the top of `Code.gs`, change any desired values in `APP_SETUP`:
   - `FAMILY_NAME`: the name shown on the dashboard.
   - `ALLOWED_ORIGIN`: already set to `https://saradasutar.github.io`. If a different GitHub account or custom domain will host the page, change it to that origin only—do not include the repository path or a final `/`.
   - `TIME_ZONE`: normally keep `Asia/Kolkata`.
   - `CURRENCY`: normally keep `INR`.
   - First administrator name, username, and optional reminder email.
5. To show the manifest file, click **Project Settings** (gear icon), enable **Show “appsscript.json” manifest file in editor**, then return to **Editor**.
6. Open `appsscript.json`. Replace it with the contents of `apps-script/appsscript.json` from this package.
7. Select `setupFamilyDashboard` in the function list and click **Run**.
8. Google will request permission to create the Sheet/folder, send reminder email, and create a daily trigger. Choose your account and allow it. If the project is marked unverified, use **Advanced → Go to Family Dashboard Backend → Allow** because this is your own script.
9. Open the execution log. Copy and keep the returned:
   - administrator username;
   - 6-digit administrator PIN;
   - database spreadsheet URL;
   - private photo folder URL.

Running setup automatically creates all Sheet tabs, the private Drive photo folder, a secure application secret, and the daily reminder trigger.

## Part 2 — Deploy the Apps Script Web App

1. In Apps Script click **Deploy → New deployment**.
2. Click the gear beside **Select type** and choose **Web app**.
3. Description: `Family Dashboard v1.0.10`.
4. **Execute as:** `Me`.
5. **Who has access:** `Anyone`.
6. Click **Deploy**, approve if asked, and copy the Web App URL ending in `/exec`.
7. Open that URL in a browser. It should show **Family Dashboard backend · Active**.

“Anyone” allows the GitHub page to reach the endpoint. It does not expose the Sheet or private Drive folder. Dashboard data still requires a valid username, PIN, and expiring session token.

## Part 3 — Put the frontend on GitHub Pages

1. Sign in to [GitHub](https://github.com/) and create a new public repository, for example `Family-Dashboard`.
2. Upload the four files inside this package’s `frontend` folder to the root of the repository:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js`
3. Edit `config.js` on GitHub. Replace:

   ```js
   API_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE"
   ```

   with the `/exec` URL copied in Part 2. Keep the quotes and comma.
4. Open the repository’s **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then click **Save**.
6. Wait about 1–3 minutes and open the Pages address, normally:

   ```text
   https://saradasutar.github.io/Family-Dashboard/
   ```

7. Sign in using the administrator username and PIN returned by setup.

## Part 4 — Add the family members

1. Sign in as administrator.
2. Open **Administration → Add family member**.
3. Enter name, username, reminder email, role, and a private 6-digit PIN.
4. Give each person only their own username and PIN.
5. Add email addresses for members who should receive important-date notifications.
6. For each member, tick only the sections they may view and use. For example, untick **Expenditure** to prevent that member from receiving or changing expenditure data.

Use the Member role for normal family access. Give Administrator only to someone who should manage users, reset PINs, change settings, and delete any shared item.

## Email reminder behaviour

- The daily trigger checks reminders at approximately 8 AM in the script’s time zone.
- Each reminder can notify all active members with email or only selected members.
- Available schedules include same day, 1 day, 3 days, 7 days, or 14 days in advance.
- Yearly repeat is suitable for birthdays and anniversaries.
- Email is sent from the Google account that owns the Apps Script project.
- Duplicate emails for the same date/reminder interval are prevented by the `NotificationLog` sheet.
- Monthly and yearly expenditure schedules use the same reminder system and can notify everyone or selected family members.

To test email immediately, add a reminder for today with **Same day only**, then manually run `sendImportantDateReminders` once in Apps Script.

## Monthly backup behaviour

- Setup creates a private Drive folder named `Family Name · Monthly Backups`.
- A trigger copies the complete dashboard Google Sheet on the first day of each month at approximately 2 AM.
- Administration shows the most recent backup and provides **Create backup now** and **Open backup folder**.
- The latest 24 copies are retained automatically. Photos remain in their original private Drive photo folder.

## Privacy and security choices

- The GitHub repository contains only interface code—no family records, PINs, or photos.
- PINs are salted and hashed in the Sheet; the original PIN is not stored.
- Sign-in sessions expire after 7 days and are invalidated after a PIN reset/deactivation.
- Repeated failed sign-in attempts are temporarily blocked.
- Full photos remain in a private Drive folder and are returned only after session validation.
- Only small photo previews are stored in the Sheet to make the gallery fast.
- The backend sends responses only to the configured GitHub origin.
- An `Audit` tab records important actions.

Do not publish the Apps Script source with real account details, share the administrator PIN, or manually rename Sheet tabs/headers. This is a family organiser, not a banking or formal accounting system.

## Updating later

Frontend change:

1. Replace the required file on GitHub.
2. Keep your existing `config.js` Web App URL.
3. Refresh with `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac) if the browser shows an older copy.

Backend change:

1. Replace `Code.gs` in Apps Script.
2. Run `setupFamilyDashboard()` once. Version 1.0.10 safely preserves existing rows, adds sticky-note storage plus any previously missing regular-payment or backup storage, appends missing columns, and treats older member/reminder rows without an `active` value as active.
3. Open **Deploy → Manage deployments → Edit**.
4. Choose **New version** and click **Deploy**. The `/exec` URL normally remains the same.

## Quick troubleshooting

| Problem | Check |
|---|---|
| Login page says to configure the backend | Paste the `/exec` URL—not `/dev`—in `config.js`. |
| “Server took too long” | Confirm the Web App is deployed for `Anyone`, the URL opens directly, and `ALLOWED_ORIGIN` exactly matches the GitHub origin. |
| Updated backend has no effect | Create a **New version** under Manage deployments. |
| Email did not arrive | Confirm the member has an email, the reminder includes that member, the daily trigger exists, and check Apps Script Executions/`NotificationLog`. |
| Photo upload fails | Try a normal JPG/PNG/WebP. The browser resizes it, but the processed full image must remain under 3 MB. |
| Old page still appears | Use a hard refresh or test in an incognito window. |
| Administrator PIN was lost | Run `resetFirstAdminPin()` manually in Apps Script and read the execution result/log. |

## Backup

The Google Sheet and Drive photo folder are normal Google files owned by the backend account. Periodically download the Sheet as Excel and copy the photo folder if you want an offline backup.
