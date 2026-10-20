MYFAMILY v1.0.61 — ORIGINAL PHOTOS & CONNECTED FAMILY TREE
===========================================================

Versions
--------
- Frontend: FE v1.0.61
- Backend: BE v1.0.43

What is new
-----------
1. Public Apps Script function runAll() performs the safe upgrade, creates missing sheets/folders, refreshes Odia calendar automation and removes abandoned upload sessions.
2. New photos are preserved as private originals in dedicated Google Drive folders (JPG, PNG or WebP; maximum 20 MB each).
3. The dashboard loads only thumbnails and optimized viewing copies for faster mobile use.
4. The same original-photo pipeline is used for Family Memories, member profiles, family-tree people, important-date reminders, the parents' portrait and tradition-guide galleries.
5. Every tradition/celebration guide can hold a controlled photo archive. The administrator chooses a cover image, caption, photo date and source/photographer.
6. Administration controls the maximum photographs per tradition guide (1–20).
7. Family-tree couples are grouped as family units with clear generation connectors. Screen and print layouts have been improved.
8. Existing data and existing older photos are retained.

BACKEND UPDATE — DO THIS FIRST
------------------------------
1. Open the existing MyFamily Apps Script project.
2. Replace Code.gs with apps-script/Code.gs from this package.
3. In Apps Script, open Project Settings and enable “Show appsscript.json manifest file in editor”.
4. Replace appsscript.json with apps-script/appsscript.json from this package. The external-request scope is required for resumable 20 MB Drive uploads.
5. Save both files.
6. Select runAll from the function list and click Run once.
7. Approve the requested Google permissions. The execution log must end with success:true.
8. Choose Deploy > Manage deployments > Edit (pencil) > New version > Deploy.
9. Keep the same /exec URL.
10. Open the /exec URL and confirm BE v1.0.43.

FRONTEND UPDATE
---------------
Upload every file inside frontend directly to the root of the GitHub repository. Do not upload the frontend folder itself. config.js already retains the existing Apps Script /exec URL.

After GitHub Pages finishes deploying, open:
https://saradasutar.github.io/MyFamily/?fresh=1061

If an older version appears, close installed MyFamily shortcuts/PWA windows, clear the site's cached data once, and reopen the fresh link. The login page should show FE v1.0.61 and BE v1.0.43.

USING THE NEW PHOTO ARCHIVE
---------------------------
- Family Memories: Photos > Add memory photo.
- Member photo: Administration > Family members > Add/Update photo.
- Parents: Administration > Parents portrait.
- Important date: add/edit a reminder and attach the photo.
- Family person: Family Tree > Add/Edit family member.
- Tradition gallery: Calendar/Reminders > open or add a Tradition Guide, save the guide, reopen it, then upload photographs in Photo Archive.

Original files remain private in Google Drive. Dashboard members receive only authenticated thumbnails or optimized viewing copies according to their module permissions.

ROLLBACK
--------
Re-deploy the previous Apps Script version and previous frontend commit. The additive sheets and columns may remain; they do not delete existing records.
