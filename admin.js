(function(){
  'use strict';

  const passwordStorageKey = 'everrising-news-admin-password';
  const passwordPanel = document.getElementById('password-panel');
  const editorPanel = document.getElementById('editor-panel');
  const passwordForm = document.getElementById('password-form');
  const passwordInput = document.getElementById('admin-password');
  const passwordConfirm = document.getElementById('admin-password-confirm');
  const passwordConfirmWrap = document.getElementById('password-confirm-wrap');
  const passwordHeading = document.getElementById('password-heading');
  const passwordStatus = document.getElementById('password-status');
  const openNewsFileButton = document.getElementById('open-news-file');
  const sourceStatus = document.getElementById('source-status');
  const articleStatus = document.getElementById('article-status');
  const articleForm = document.getElementById('article-form');
  const articleFields = document.getElementById('article-fields');
  const savedArticles = document.getElementById('saved-articles');
  const mediaTypeSelect = document.getElementById('media-type');
  const tileMediaInput = document.getElementById('tile-media');
  const popupMediaInput = document.getElementById('popup-media');
  const mediaHelp = document.getElementById('media-help');
  let newsFileHandle = null;
  let articles = [];

  async function passwordDigest(password){
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(digest), byte=>byte.toString(16).padStart(2, '0')).join('');
  }

  function updatePasswordMode(){
    const savedPassword = localStorage.getItem(passwordStorageKey);
    passwordHeading.textContent = savedPassword ? 'Admin password' : 'Create local password';
    passwordConfirmWrap.classList.toggle('hidden', Boolean(savedPassword));
    passwordConfirm.required = !savedPassword;
    passwordInput.autocomplete = savedPassword ? 'current-password' : 'new-password';
  }

  passwordForm.addEventListener('submit', async event=>{
    event.preventDefault();
    passwordStatus.textContent = '';
    try{
      const savedPassword = localStorage.getItem(passwordStorageKey);
      const enteredPassword = await passwordDigest(passwordInput.value);
      if(savedPassword){
        if(enteredPassword !== savedPassword){
          passwordStatus.textContent = 'That password does not match.';
          passwordInput.select();
          return;
        }
      }else{
        if(passwordInput.value !== passwordConfirm.value){
          passwordStatus.textContent = 'The passwords do not match.';
          passwordConfirm.select();
          return;
        }
        localStorage.setItem(passwordStorageKey, enteredPassword);
      }
      passwordForm.reset();
      passwordPanel.classList.add('hidden');
      editorPanel.classList.remove('hidden');
    }catch(error){
      passwordStatus.textContent = 'Password storage is unavailable in this browser. Open this page through localhost and try again.';
    }
  });

  function renderArticleList(){
    savedArticles.replaceChildren();
    articles.forEach(article=>{
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = article.title || 'Untitled article';
      const date = document.createElement('span');
      date.textContent = article.date || '';
      row.append(title, date);
      savedArticles.appendChild(row);
    });
  }

  openNewsFileButton.addEventListener('click', async()=>{
    const previousFileHandle = newsFileHandle;
    articleFields.disabled = true;
    if(!window.isSecureContext || typeof window.showOpenFilePicker !== 'function'){
      sourceStatus.textContent = 'Direct editing requires a secure page (HTTPS or localhost) in a current version of Chrome or Edge.';
      articleFields.disabled = !previousFileHandle;
      return;
    }
    try{
      const [handle] = await window.showOpenFilePicker({
        types:[{description:'News data',accept:{'application/json':['.json']}}],
        multiple:false
      });
      if(handle.name.toLowerCase() !== 'news.json'){
        throw new Error('Choose the news.json file from this project folder.');
      }
      if(await handle.requestPermission({mode:'readwrite'}) !== 'granted'){
        throw new Error('Write access to news.json was not granted.');
      }
      const file = await handle.getFile();
      const data = JSON.parse(await file.text());
      if(!Array.isArray(data)) throw new Error('The news data must be a list of articles.');
      newsFileHandle = handle;
      articles = data;
      renderArticleList();
      articleFields.disabled = false;
      sourceStatus.textContent = `${articles.length} existing article${articles.length === 1 ? '' : 's'} loaded from news.json.`;
      articleStatus.textContent = '';
    }catch(error){
      newsFileHandle = previousFileHandle;
      articleFields.disabled = !previousFileHandle;
      sourceStatus.textContent = error.name === 'AbortError'
        ? 'File selection cancelled.'
        : error.message || 'Could not read the selected news.json.';
    }
  });

  function escapeHtml(value){
    return value.replace(/[&<>"']/g, character=>({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[character]);
  }

  function descriptionToHtml(value){
    return value.trim().split(/\n\s*\n/).map(paragraph=>`<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
  }

  function updateMediaInputs(){
    const isVideo = mediaTypeSelect.value === 'video';
    const accept = isVideo ? 'video/mp4,video/webm,video/quicktime,.mov' : 'image/jpeg,image/png,image/webp';
    tileMediaInput.accept = accept;
    popupMediaInput.accept = accept;
    mediaHelp.textContent = isVideo
      ? 'Choose MP4, WebM, or MOV videos under 10 MB each. Videos are embedded in news.json.'
      : 'Choose optimized JPG, PNG, or WebP images under 2 MB each. Media is embedded in news.json.';
  }

  function readMedia(file, type){
    if(!file) return Promise.reject(new Error('Choose both tile and popup media.'));
    const isMov = /\.mov$/i.test(file.name);
    const supportedTypes = type === 'video'
      ? ['video/mp4', 'video/webm', 'video/quicktime']
      : ['image/jpeg', 'image/png', 'image/webp'];
    if(!supportedTypes.includes(file.type) && !(type === 'video' && isMov)){
      const formats = type === 'video' ? 'MP4, WebM, or MOV videos' : 'JPG, PNG, or WebP images';
      return Promise.reject(new Error(`Choose ${formats}.`));
    }
    const maxSize = type === 'video' ? 10 * 1024 * 1024 : 2 * 1024 * 1024;
    if(file.size > maxSize){
      const limit = type === 'video' ? '10 MB' : '2 MB';
      return Promise.reject(new Error(`${file.name} is over ${limit}. Please choose a smaller file.`));
    }
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = ()=>reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(type === 'video' && isMov && !file.type
        ? file.slice(0, file.size, 'video/quicktime')
        : file);
    });
  }

  function today(){
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  async function saveArticles(updatedArticles){
    if(!newsFileHandle) throw new Error('Open news.json before adding an article.');
    const writable = await newsFileHandle.createWritable();
    await writable.write(`${JSON.stringify(updatedArticles, null, 2)}\n`);
    await writable.close();
  }

  articleForm.addEventListener('submit', async event=>{
    event.preventDefault();
    if(!newsFileHandle) return;
    const saveButton = document.getElementById('save-article');
    saveButton.disabled = true;
    articleStatus.textContent = 'Saving the new article to news.json...';
    try{
      const title = document.getElementById('article-title').value.trim();
      const summary = document.getElementById('article-summary').value.trim();
      const description = document.getElementById('article-description').value.trim();
      const mediaType = mediaTypeSelect.value;
      const tileMedia = await readMedia(tileMediaInput.files[0], mediaType);
      const popupMedia = await readMedia(popupMediaInput.files[0], mediaType);
      const article = {
        id: Date.now(),
        title,
        date: today(),
        summary,
        mediaType,
        content: descriptionToHtml(description)
      };
      if(mediaType === 'video'){
        article.video = tileMedia;
        article.heroVideo = popupMedia;
      }else{
        article.image = tileMedia;
        article.heroImage = popupMedia;
      }
      const updatedArticles = [article, ...articles];
      await saveArticles(updatedArticles);
      articles = updatedArticles;
      renderArticleList();
      articleForm.reset();
      articleStatus.textContent = 'Article saved to news.json. Review and commit the file to GitHub to publish it.';
    }catch(error){
      articleStatus.textContent = error.message || 'Could not save the article to news.json.';
    }finally{
      saveButton.disabled = false;
    }
  });

  mediaTypeSelect.addEventListener('change', updateMediaInputs);
  updateMediaInputs();
  updatePasswordMode();
})();
