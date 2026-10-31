const NEWS_HEADERS = [
  'id',
  'title',
  'date',
  'summary',
  'mediaType',
  'image',
  'heroImage',
  'content',
  'published',
  'updatedAt'
];

const NEWS_TAB_NAME = 'News';
const ADMIN_SESSION_SECONDS = 3600;
const PASSWORD_HASH_ROUNDS = 10000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ER Dance News')
    .addItem('Set up news sheet', 'setupNewsSheet_')
    .addItem('Set or change manager password', 'setNewsAdminPassword_')
    .addToUi();
}

function authorizeDriveAccess() {
  const folders = DriveApp.getFoldersByName('ER Dance News Media');
  return folders.hasNext()
    ? 'Drive access authorized. The existing ER Dance News Media folder was found.'
    : 'Drive access authorized. No media folder exists yet; it will be created on the first upload.';
}

/**
 * Run this once from the bound spreadsheet or its Apps Script project.
 * It creates the News tab only if missing and never replaces existing rows.
 */
function setupNewsSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Open the Apps Script project from the ER Dance News spreadsheet before setup.');
  }

  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty('NEWS_SPREADSHEET_ID');
  if (existingId && existingId !== spreadsheet.getId()) {
    throw new Error('This Apps Script project is already connected to another spreadsheet.');
  }

  let sheet = spreadsheet.getSheetByName(NEWS_TAB_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(NEWS_TAB_NAME);

  const firstRow = sheet.getRange(1, 1, 1, NEWS_HEADERS.length).getDisplayValues()[0];
  if (firstRow.every(value => !value)) {
    sheet.getRange(1, 1, 1, NEWS_HEADERS.length).setValues([NEWS_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, NEWS_HEADERS.length).setFontWeight('bold');
  } else if (!NEWS_HEADERS.every((header, index) => firstRow[index] === header)) {
    throw new Error('The News tab has different headers. No spreadsheet content was changed.');
  }

  properties.setProperty('NEWS_SPREADSHEET_ID', spreadsheet.getId());
  return 'News tab is ready. Existing article rows were preserved.';
}

/**
 * Run this from the spreadsheet menu once during setup, and again to rotate
 * the shared staff password. The password itself is never written to a cell.
 */
function setNewsAdminPassword_() {
  getNewsSheet_();
  const ui = SpreadsheetApp.getUi();
  const first = ui.prompt(
    'Set news manager password',
    'Enter a unique password with at least 16 characters. Share it with staff using a separate secure channel.',
    ui.ButtonSet.OK_CANCEL
  );
  if (first.getSelectedButton() !== ui.Button.OK) return;

  const password = first.getResponseText();
  if (password.length < 16 || password.length > 200) {
    throw new Error('Choose a password between 16 and 200 characters.');
  }

  const confirmation = ui.prompt(
    'Confirm news manager password',
    'Enter the same password again.',
    ui.ButtonSet.OK_CANCEL
  );
  if (confirmation.getSelectedButton() !== ui.Button.OK) return;
  if (confirmation.getResponseText() !== password) {
    throw new Error('The passwords did not match. No password was changed.');
  }

  const salt = Utilities.getUuid() + Utilities.getUuid();
  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    NEWS_ADMIN_PASSWORD_SALT: salt,
    NEWS_ADMIN_PASSWORD_HASH: hashPassword_(password, salt)
  });
  CacheService.getScriptCache().remove('news_admin_login_failures');
  ui.alert('The news manager password has been set.');
}

function doGet(event) {
  const parameters = event && event.parameter ? event.parameter : {};
  if (parameters.view === 'admin') {
    return HtmlService.createHtmlOutputFromFile('Manager')
      .setTitle('ER Dance News Manager')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  try {
    const articles = getPublicArticles_();
    let result;
    if (parameters.action === 'article') {
      const article = articles.find(item => item.id === String(parameters.id || ''));
      result = article
        ? { ok: true, data: article }
        : { ok: false, error: { code: 'NOT_FOUND', message: 'Published article not found.' } };
    } else if (!parameters.action || parameters.action === 'articles') {
      result = { ok: true, data: articles };
    } else {
      result = { ok: false, error: { code: 'INVALID_ACTION', message: 'Unknown read action.' } };
    }

    return publicResponse_(result, parameters.callback);
  } catch (error) {
    console.error('Could not read published news:', error);
    return publicResponse_({
      ok: false,
      error: { code: 'NEWS_UNAVAILABLE', message: 'Published news is temporarily unavailable.' }
    }, parameters.callback);
  }
}

function doPost() {
  return ContentService.createTextOutput(JSON.stringify({
    ok: false,
    error: { code: 'READ_ONLY', message: 'Public API requests cannot modify news.' }
  })).setMimeType(ContentService.MimeType.JSON);
}

function publicResponse_(response, callback) {
  if (callback) {
    if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(callback)) {
      response = { ok: false, error: { code: 'INVALID_CALLBACK', message: 'Invalid callback name.' } };
      callback = '';
    }
  }

  const json = JSON.stringify(response)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getPublicArticles_() {
  const sheet = getNewsSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length || values[0].every(value => !value)) return [];
  validateHeaders_(values[0]);
  if (values.length < 2) return [];

  const articles = values.slice(1)
    .filter(row => row.some(value => value !== ''))
    .map(row => rowToArticle_(row))
    .filter(article => article.published)
    .sort((left, right) => dateValue_(right.date) - dateValue_(left.date));

  return articles;
}

function getAdminArticles(sessionToken) {
  requireAdminSession_(sessionToken);
  const sheet = getNewsSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length || values[0].every(value => !value)) return [];
  validateHeaders_(values[0]);
  if (values.length < 2) return [];

  return values.slice(1)
    .filter(row => row.some(value => value !== ''))
    .map(row => rowToArticle_(row))
    .sort((left, right) => dateValue_(right.date) - dateValue_(left.date));
}

function loginNewsAdmin(password) {
  const properties = PropertiesService.getScriptProperties();
  const salt = properties.getProperty('NEWS_ADMIN_PASSWORD_SALT');
  const expectedHash = properties.getProperty('NEWS_ADMIN_PASSWORD_HASH');
  if (!salt || !expectedHash) {
    throw new Error('The manager password has not been configured. Ask the spreadsheet owner to set it from the ER Dance News menu.');
  }
  if (isLoginLocked_()) {
    throw new Error('Too many unsuccessful attempts. Wait 10 minutes before trying again.');
  }

  const provided = String(password || '');
  const actualHash = hashPassword_(provided, salt);
  if (!constantTimeEqual_(actualHash, expectedHash)) {
    recordFailedLogin_();
    throw new Error('The password was not accepted.');
  }

  CacheService.getScriptCache().remove('news_admin_login_failures');
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(sessionCacheKey_(token), 'authorized', ADMIN_SESSION_SECONDS);
  return { token: token, expiresInSeconds: ADMIN_SESSION_SECONDS };
}

function logoutNewsAdmin(sessionToken) {
  if (sessionToken) CacheService.getScriptCache().remove(sessionCacheKey_(sessionToken));
  return { ok: true };
}

function saveNewsArticle(sessionToken, input) {
  requireAdminSession_(sessionToken);
  const article = validateArticle_(input);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getNewsSheet_();
    const headers = sheet.getRange(1, 1, 1, NEWS_HEADERS.length).getDisplayValues()[0];
    validateHeaders_(headers);
    const idColumn = headers.indexOf('id') + 1;
    const lastRow = sheet.getLastRow();
    let targetRow = 0;

    if (article.id) {
      if (lastRow < 2) throw new Error('That article no longer exists. Reload the manager.');
      const ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues();
      const index = ids.findIndex(row => row[0] === article.id);
      if (index < 0) throw new Error('That article no longer exists. Reload the manager.');
      targetRow = index + 2;
    } else {
      article.id = Utilities.getUuid();
      targetRow = lastRow + 1;
    }

    article.updatedAt = new Date().toISOString();
    const row = articleToRow_(article);
    sheet.getRange(targetRow, 1, 1, NEWS_HEADERS.length).setValues([row]);
    return { ok: true, article: article };
  } finally {
    lock.releaseLock();
  }
}

function deleteNewsArticle(sessionToken, articleId) {
  requireAdminSession_(sessionToken);
  const id = String(articleId || '');
  if (!id || id.length > 100) throw new Error('A valid article ID is required.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getNewsSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('That article no longer exists.');
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    const index = ids.findIndex(row => row[0] === id);
    if (index < 0) throw new Error('That article no longer exists.');
    sheet.deleteRow(index + 2);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function uploadNewsMedia(sessionToken, base64Data, fileName, mimeType) {
  requireAdminSession_(sessionToken);
  const supportedTypes = {
    'image/jpeg': { extension: /\.(jpe?g)$/i, maxBytes: MAX_IMAGE_BYTES },
    'image/png': { extension: /\.png$/i, maxBytes: MAX_IMAGE_BYTES },
    'image/webp': { extension: /\.webp$/i, maxBytes: MAX_IMAGE_BYTES },
    'video/mp4': { extension: /\.mp4$/i, maxBytes: MAX_VIDEO_BYTES },
    'video/webm': { extension: /\.webm$/i, maxBytes: MAX_VIDEO_BYTES },
    'video/quicktime': { extension: /\.mov$/i, maxBytes: MAX_VIDEO_BYTES }
  };
  const type = supportedTypes[String(mimeType || '').toLowerCase()];
  if (!type || !type.extension.test(String(fileName || ''))) {
    throw new Error('Choose a supported JPG, PNG, WebP, MP4, WebM, or MOV file.');
  }
  if (typeof base64Data !== 'string' || !base64Data || base64Data.length > Math.ceil(type.maxBytes * 4 / 3) + 16) {
    throw new Error('The selected media file is too large.');
  }

  const bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > type.maxBytes) throw new Error('The selected media file is too large.');

  const safeName = String(fileName).replace(/[^\w.-]/g, '_').slice(0, 100);
  const blob = Utilities.newBlob(bytes, mimeType, 'ER-Dance-' + Date.now() + '-' + safeName);
  const folder = getOrCreateMediaFolder_();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: file.getUrl(), fileId: file.getId() };
}

function validateArticle_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Article data is missing or invalid.');
  }
  const article = {
    id: cleanText_(input.id, 100, 'Article ID', false),
    title: cleanText_(input.title, 120, 'Headline', true),
    date: cleanText_(input.date, 10, 'Date', true),
    summary: cleanText_(input.summary, 500, 'Summary', true),
    mediaType: cleanText_(input.mediaType, 10, 'Media type', true),
    image: validateMediaUrl_(input.image, 'Tile media URL'),
    heroImage: validateMediaUrl_(input.heroImage, 'Popup media URL'),
    content: cleanText_(input.content, 20000, 'Article text', true),
    published: input.published === true || String(input.published).toLowerCase() === 'true'
  };

  const dateParts = article.date.split('-').map(Number);
  const dateValue = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(article.date)
      || isNaN(dateValue.getTime())
      || dateValue.toISOString().slice(0, 10) !== article.date) {
    throw new Error('Enter a valid publication date.');
  }
  if (article.mediaType !== 'image' && article.mediaType !== 'video') {
    throw new Error('Choose either image or video media.');
  }
  if (!article.image || !article.heroImage) {
    throw new Error('Add both tile media and popup media.');
  }
  return article;
}

function cleanText_(value, maxLength, label, required) {
  const text = value == null ? '' : String(value).trim();
  if (required && !text) throw new Error(label + ' is required.');
  if (text.length > maxLength) throw new Error(label + ' must be ' + maxLength + ' characters or fewer.');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    throw new Error(label + ' contains unsupported control characters.');
  }
  return text;
}

function validateMediaUrl_(value, label) {
  const url = cleanText_(value, 2000, label, false);
  if (!url) return '';
  if (/^https:\/\//i.test(url)) {
    if (/\s/.test(url)) throw new Error(label + ' is not a valid HTTPS URL.');
    return url;
  }
  if (/^(?!\/)[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*(?:\?[A-Za-z0-9_~!$&'()*+,;=:@%/?-]*)?$/.test(url) && !url.split('/').includes('..')) {
    return url;
  }
  throw new Error(label + ' must be a secure HTTPS link or a safe website-relative file path.');
}

function rowToArticle_(row) {
  const values = {};
  NEWS_HEADERS.forEach((header, index) => { values[header] = row[index] || ''; });
  return {
    id: String(values.id),
    title: values.title,
    date: values.date,
    summary: values.summary,
    mediaType: values.mediaType === 'video' ? 'video' : 'image',
    image: values.image,
    heroImage: values.heroImage,
    content: values.content,
    published: String(values.published).toLowerCase() === 'true',
    updatedAt: values.updatedAt
  };
}

function articleToRow_(article) {
  const values = {
    id: article.id,
    title: article.title,
    date: article.date,
    summary: article.summary,
    mediaType: article.mediaType,
    image: article.image,
    heroImage: article.heroImage,
    content: article.content,
    published: article.published ? 'TRUE' : 'FALSE',
    updatedAt: article.updatedAt
  };
  return NEWS_HEADERS.map(header => safeCellValue_(values[header]));
}

function safeCellValue_(value) {
  const text = value == null ? '' : String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function validateHeaders_(headers) {
  if (!NEWS_HEADERS.every((header, index) => headers[index] === header)) {
    throw new Error('The News tab does not have the required header row. No article data was changed.');
  }
}

function getNewsSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('NEWS_SPREADSHEET_ID');
  if (!id) throw new Error('Run Set up news sheet from the ER Dance News spreadsheet menu first.');
  const spreadsheet = SpreadsheetApp.openById(id);
  const sheet = spreadsheet.getSheetByName(NEWS_TAB_NAME);
  if (!sheet) throw new Error('The News tab was not found. Run Set up news sheet again.');
  return sheet;
}

function getOrCreateMediaFolder_() {
  const folders = DriveApp.getFoldersByName('ER Dance News Media');
  return folders.hasNext() ? folders.next() : DriveApp.createFolder('ER Dance News Media');
}

function requireAdminSession_(token) {
  if (typeof token !== 'string' || !token || !CacheService.getScriptCache().get(sessionCacheKey_(token))) {
    throw new Error('Your manager session has expired. Sign in again.');
  }
}

function sessionCacheKey_(token) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token);
  return 'news_admin_session_' + Utilities.base64EncodeWebSafe(digest);
}

function hashPassword_(password, salt) {
  let digest = Utilities.computeHmacSha256Signature(String(password), salt);
  for (let index = 0; index < PASSWORD_HASH_ROUNDS; index++) {
    digest = Utilities.computeHmacSha256Signature(Utilities.base64Encode(digest), salt);
  }
  return Utilities.base64Encode(digest);
}

function constantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function recordFailedLogin_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const cache = CacheService.getScriptCache();
    const failures = Number(cache.get('news_admin_login_failures') || 0) + 1;
    cache.put('news_admin_login_failures', String(failures), 600);
    if (failures >= 10) {
      cache.put('news_admin_login_locked', 'locked', 600);
    }
  } finally {
    lock.releaseLock();
  }
}

function isLoginLocked_() {
  return CacheService.getScriptCache().get('news_admin_login_locked') === 'locked';
}

function dateValue_(date) {
  const value = Date.parse(date);
  return isNaN(value) ? 0 : value;
}
