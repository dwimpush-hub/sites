# Home Central

A small home-projects suite: one page for every project around the house (upcoming, pending drafts, ideas, done, nixed) and a page per project with tasks, photos you can mark up, an ideas board and a files shelf for contracts, quotes and schedules. It is plain HTML and JavaScript hosted on GitHub Pages; the records live in a Google Sheet and the photos and files in Google Drive, through a Google Apps Script web app.

```
home-central/
  index.html        Home Central: the project boards and the New project button
  project.html      one project: status, budget and dates, tasks, photos and mark-ups, ideas, files
  login.html        sign in (Dave, Nate or Cissy and the shared password)
  app.js, app.css   shared script and the blue-jay theme
  config.js         the one file to edit: the web-app URL and the links in the footer
  apps-script/      Code.gs, the backend that reads and writes the sheet and Drive
  logo.jpg          the crest (logo-320.jpg for the header, favicon.jpg for the tab)
```

## Where the data goes

The script creates a spreadsheet called **Home Central** with one tab per kind of record, every row keyed by the project's id:

| Tab | Holds |
| --- | --- |
| Projects | id, name, status (idea, pending, upcoming, active, done, nixed), summary, budget, start, target, cover photo, concept page URL, tags |
| Tasks | text, done (a checkbox you can also tick in the sheet), due date, who, when it was completed |
| Photos | the Drive link, caption, kind (photo or markup), and for a mark-up the photo it was drawn on |
| Files | the Drive link, kind (Contract, Quote, Invoice, Schedule, Plan, Permit, Receipt, Other), note, amount |
| Ideas | text, author, optional photo |
| Log | who did what, when (every write appends a line) |

Drive gets a folder **Home Central** holding the spreadsheet and `projects/<project name>/` for each project: photos and mark-ups go straight in that folder, documents go in its `files/` subfolder. Renaming a project renames the folder. Deleting a project removes its rows and sends the folder to the Drive trash.

Text columns are formatted as plain text in the sheet, so a task called "3/4 bath" stays text. You can edit the sheet by hand; the site reads it fresh every time.

## Set it up (about ten minutes)

1. Signed in as the Google account that should own the data, open https://script.google.com/create. Replace the contents of `Code.gs` with `apps-script/Code.gs` and save. Name the project anything (Home Central).
2. Pick `setup` in the function dropdown next to Run and run it. Accept the permission prompt (it needs Sheets and Drive). The execution log prints the links to the new spreadsheet and the Drive folder; paste them into `SHEET_URL` and `DRIVE_URL` in `config.js` if you want them in the footer.
3. Deploy > New deployment > type Web app. Execute as: **Me**. Who has access: **Anyone**. Deploy, copy the web-app URL into `API` in `config.js`.
4. Optional: run `importPatio` once to bring the patio concept in as the first pending project, with its ideas copied over and the concept page linked.
5. Commit and push the folder to the GitHub Pages repo (it works at any path, links are relative). Open it, sign in, and the demo banner is gone.

Until `API` is set the pages run in **demo mode**: the same interface on sample data kept in that browser only (handy for trying it; Reset demo data in the banner wipes it).

### Changing the script later

Edit `Code.gs`, then Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy. The URL stays the same. If the new code touches something it did not before, run `setup` once more from the editor so the script gets the permission.

## Sign-in

The sign-in page takes a name (Dave, Nate, Cissy) and the shared password. The browser hashes the password (SHA-256) and sends the hash with every request; the script refuses anything without it, so the data is not readable just by knowing the web-app URL. The name becomes the author on everything you add. It is a household lock, not a bank vault: the hash is in the page source and anyone who has it can use it.

To change the password, compute the new hash and put it in both `PASS_HASH` constants (in `apps-script/Code.gs` and `app.js`), then redeploy the script:

```bash
printf 'new password' | shasum -a 256
```

To add a person, add the lowercase name to `USERS` in both files and a button on `login.html`.

## What the project page does

- **Status**: click a step (Idea, Pending, Upcoming, In progress, Done, Nixed). Home Central groups projects by it; nixed ones collapse to the bottom.
- **Tasks**: add with an optional due date and person; tick to complete; click the text to edit. Overdue tasks turn red, the card on the home page shows progress and the next due date.
- **Photos**: Add photos or drop them on the box; each is shrunk to 1600 px in the browser before upload. The first photo becomes the cover; Set as cover changes it. **Mark up** opens the drawing tool: one colour per call-out, say what each colour means, and the drawing is saved as a mark-up next to the original with those notes as its caption. Click a caption to edit it; click a photo to see it full size.
- **Ideas**: a shared board with optional photos, editable by anyone signed in.
- **Files**: upload PDFs or anything up to 15 MB each with a kind, a note and an amount. Quotes, and invoices plus receipts, are totalled against the budget.
- **Edit details**: name, summary, budget, dates, tags and the concept page link (for a project that has its own design page, like the patio concept). Delete project is in there too.

## Local preview

```bash
node ../tools/serve.js 8765
```

then open http://localhost:8765/home-central/ (the sign-in needs localhost or https, because the password hash uses the browser's crypto API).
