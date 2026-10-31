# Free Google Sheets news setup

The public news pages retrieve published articles from a Google Apps Script web app. News metadata is stored in a private Google spreadsheet; image/video files added through the manager are stored in the account owner's Google Drive and shared publicly by link.

The Apps Script manager requires a staff password checked on Google's servers. The password and its salted hash are not placed in this website or in the spreadsheet. The public website can read published articles only; its read endpoint and HTTP POST handler cannot create, edit, or delete content.

## What is and is not configured

The website code and Apps Script source are prepared, but no Google sheet, Apps Script deployment, or staff password has been created. Those steps must be completed manually in Google's interface before the news feed works. No Google Cloud billing account, paid API, Azure, or other paid hosting is required.

## 1. Create the spreadsheet

1. Sign in to the Google account that will own the news system.
2. In Google Sheets, create a blank spreadsheet and name the file **ER Dance News**.
3. Keep the spreadsheet private. Do not share it publicly; visitors will receive only published article fields through the web app.
4. Open **Extensions → Apps Script** to create a script bound to this spreadsheet.

The script creates a worksheet tab named `News` with the following columns:

| Column | Purpose |
|---|---|
| `id` | Unique article ID assigned by the backend |
| `title` | Headline |
| `date` | Publication date in `YYYY-MM-DD` format |
| `summary` | Short news-card text |
| `mediaType` | `image` or `video` |
| `image` | News-card image/video URL |
| `heroImage` | Popup image/video URL |
| `content` | Long description text |
| `published` | `TRUE` to show publicly, `FALSE` to keep as a draft |
| `updatedAt` | Backend update timestamp |

The `Set up news sheet` menu checks the headers and will not replace existing article rows. If the `News` tab already exists with different headers, it reports an error without changing the sheet.

## 2. Add the Apps Script files

1. In the bound Apps Script project, open `Code.gs` and replace its contents with the complete contents of this repository's `Code.gs`.
2. Select **+ → HTML**, name the file exactly `Manager`, and paste in this repository's `Manager.html`. In the Apps Script editor, the file is called `Manager`; the `.html` suffix is added automatically.
3. In Apps Script, open **Project Settings**, enable **Show "appsscript.json" manifest file in editor**, then return to the editor. Open the manifest and replace its contents with this repository's `appsscript.json`.
4. Save the project.
5. In the Apps Script editor, select `authorizeDriveAccess` from the function dropdown and click **Run**. Review the requested Google Drive permission, choose the spreadsheet owner's account, and click **Allow**. This helper only checks whether the existing media folder is present; it does not create folders or modify articles.
6. Return to the spreadsheet and reload it. The **ER Dance News** menu should appear.
7. Select **ER Dance News → Set up news sheet** once and approve the requested spreadsheet access.
8. Select **ER Dance News → Set or change manager password**. Choose a unique password of at least 16 characters, confirm it, and share it with staff through a separate secure channel.

The script never logs or stores the password itself. It stores a salted password hash in Apps Script Script Properties and uses short-lived server-side sessions. Ten incorrect passwords lock sign-in for 10 minutes. Because this is a shared-password system, it does not identify individual staff; rotate the password whenever a staff member should lose access. A staff member can still copy or share the password, so share it only with trusted editors.

The two setup actions are private to the spreadsheet menu and are not callable from the website's manager page.

The manifest explicitly requests Drive, spreadsheet, and spreadsheet-container UI scopes used by the project. If the web app has already been deployed, update its existing deployment to a new version after saving the manifest and code; keep the deployment settings unchanged. The `/exec` URL stays the same. The one-time Drive authorization itself is granted by running `authorizeDriveAccess` in the editor, not by opening the web app.

## 3. Deploy the web app

1. In Apps Script, select **Deploy → New deployment**.
2. Click the gear icon and choose **Web app**.
3. Set **Execute as** to **Me** (the spreadsheet owner).
4. Set **Who has access** to **Anyone** so visitors can retrieve published news without Google sign-in.
5. Select **Deploy**, review the authorization prompt, and approve it as the spreadsheet owner.
6. Copy the web app URL ending in `/exec`.

The web app's public `doGet` endpoint returns published content only. Article creation, editing, deletion, and media upload are separate Apps Script server functions called by the Google-hosted manager, and every such function verifies a session created after staff password verification. Public GET requests cannot write; POST requests are explicitly rejected.

If Google presents a warning for your own unverified script, check that the project belongs to the account you expect before proceeding. No OAuth client or separately created Google Cloud project is needed for this password-based setup. Apps Script uses its automatically associated Google project; do not enable billing.

## 4. Connect GitHub Pages

1. Open `news-config.js` in the website files.
2. Set `appsScriptUrl` to the copied `/exec` URL, for example:

   ```js
   window.ER_DANCE_NEWS_CONFIG = {
     appsScriptUrl: 'https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec'
   };
   ```

3. Commit/publish that website configuration change to GitHub Pages.
4. Open the public site's `news.html`. It should list published rows from the `News` tab. The homepage uses the same feed for its latest-news cards.
5. Open the site's `admin.html` and select **Open secure news manager**. This opens the Google-hosted editor; staff enter the password there.

The URL is public configuration, not a secret. Do not place the staff password, a password hash, or other credentials in `news-config.js` or any website JavaScript.

## 5. Use the news manager

- **Create:** enter the headline, date, summary, full text, and media; choose whether to publish immediately; select **Create article**.
- **Edit:** choose **Edit** beside an article, make changes, and select **Save changes**. To keep existing media, leave the file inputs empty.
- **Publish/unpublish:** edit an article and toggle **Publish this article**. Drafts are visible to signed-in managers but not to the public endpoint.
- **Delete:** choose **Delete** and confirm. Deletion removes the article row; it does not automatically delete Drive files, since a file might be reused by another article. Remove unused media from the `ER Dance News Media` Drive folder manually when appropriate.

Images support JPG, PNG, and WebP files up to 2 MB. Videos support MP4, WebM, and MOV up to 5 MB per file to keep uploads reliable through Apps Script. Drive files are shared as **Anyone with the link — Viewer** so visitors can see public article media. Do not upload private or sensitive media.

## 6. Test the setup

1. In the manager, create a test article and publish it.
2. Confirm it appears on `news.html` and the homepage, newest first.
3. Edit its title, save, and verify the updated title is shown.
4. Unpublish it and confirm it disappears from the public pages but remains in the manager.
5. Publish it again, then delete it and confirm it is removed.
6. Open the public Apps Script URL with `?action=articles` to inspect the published JSON response. A JSONP callback is used by the site to work around cross-origin restrictions.
7. Test a wrong manager password; the server must reject it.

Until these manual deployment steps and live tests are complete, the news system is not live. Apps Script and Drive are subject to Google's account-specific quotas, storage limits, and terms. Check the current [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas) and [Google Drive storage details](https://support.google.com/drive/answer/6374270); do not rely on the service for unlimited traffic or file storage.
