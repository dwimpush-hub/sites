# Patio and Side Yard Concept

Before/after concept renders of the backyard patio and side yard, built from site photos and hand-drawn markups, with an ideas board on every station.

- `index.html` is the site (built from `patio-concept.html` by `tools/build.py`; edit the fragment, run the build, commit both).
- `Renders/` holds the before, after and markup images and the material swatches.
- `tools/` holds the scripts that lift the scribbles off the markup photos and refill them with built materials (see `tools/README.md`).
- `apps-script/Code.gs` is the Google Apps Script that lets the page read and write the shared ideas sheet.

## Ideas board

Every station has an ideas box. Posts go to a Google Sheet through an Apps Script web app and are shown back under the station, where anyone with the link can edit or delete them. To connect it:

1. Open the sheet, then Extensions > Apps Script. Replace the contents of `Code.gs` with `apps-script/Code.gs` and save.
2. Deploy > New deployment > type Web app. Execute as: Me. Who has access: Anyone. Deploy, and authorize when asked.
3. Copy the web app URL into `IDEAS_API` near the bottom of `patio-concept.html`, run `python3 tools/build.py`, commit and push.

Ideas can carry a photo (a marked-up screenshot, say). The page shrinks it to 1600 px in the browser, the script saves it to the Drive folder "Patio ideas photos" shared view-only by link, and the sheet row holds the Drive link. Tapping a thumbnail under a station opens it full size.

Anyone who can open the page can post and edit ideas; nothing on the page can read anything in your Google account except that one sheet and that one folder. Changing the script later needs a new deployment version (Deploy > Manage deployments > edit > new version). If the new code touches something it did not before (as the photo folder did), pick `authorize` next to Run in the editor, run it once and accept the permission prompt, or posts fail with "You do not have permission".
