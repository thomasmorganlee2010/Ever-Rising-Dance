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
  const sourceInput = document.getElementById('news-file');
  const sourceStatus = document.getElementById('source-status');
  const articleStatus = document.getElementById('article-status');
  const articleForm = document.getElementById('article-form');
  const articleFields = document.getElementById('article-fields');
  const savedArticles = document.getElementById('saved-articles');
  let newsDocument = null;
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

  sourceInput.addEventListener('change', async()=>{
    const file = sourceInput.files[0];
    newsDocument = null;
    articleFields.disabled = true;
    if(!file) return;
    if(file.name.toLowerCase() !== 'news.html'){
      sourceStatus.textContent = 'Choose the website file named news.html.';
      return;
    }
    try{
      const parsed = new DOMParser().parseFromString(await file.text(), 'text/html');
      const dataScript = parsed.getElementById('news-data');
      if(!dataScript) throw new Error('This news.html does not contain its news data block.');
      const data = JSON.parse(dataScript.textContent);
      if(!Array.isArray(data)) throw new Error('The news data must be a list of articles.');
      newsDocument = parsed;
      articles = data;
      renderArticleList();
      articleFields.disabled = false;
      sourceStatus.textContent = `${articles.length} existing article${articles.length === 1 ? '' : 's'} loaded.`;
      articleStatus.textContent = '';
    }catch(error){
      sourceStatus.textContent = error.message || 'Could not read the selected news.html.';
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

  function readImage(file){
    if(!file) return Promise.reject(new Error('Choose both images.'));
    if(!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)){
      return Promise.reject(new Error('Images must be JPG, PNG, or WebP files.'));
    }
    if(file.size > 2 * 1024 * 1024){
      return Promise.reject(new Error(`${file.name} is over 2 MB. Please choose a smaller image.`));
    }
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = ()=>reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function today(){
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function downloadUpdatedNews(){
    const dataScript = newsDocument.getElementById('news-data');
    dataScript.textContent = JSON.stringify(articles, null, 2).replace(/<\/script/gi, '<\\/script');
    const doctype = newsDocument.doctype ? `<!doctype ${newsDocument.doctype.name}>\n` : '<!doctype html>\n';
    const output = `${doctype}${newsDocument.documentElement.outerHTML}`;
    const url = URL.createObjectURL(new Blob([output], {type:'text/html'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'news.html';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  articleForm.addEventListener('submit', async event=>{
    event.preventDefault();
    if(!newsDocument) return;
    const downloadButton = document.getElementById('download-article');
    downloadButton.disabled = true;
    articleStatus.textContent = 'Preparing updated news.html...';
    try{
      const title = document.getElementById('article-title').value.trim();
      const summary = document.getElementById('article-summary').value.trim();
      const description = document.getElementById('article-description').value.trim();
      const tileImage = await readImage(document.getElementById('tile-image').files[0]);
      const popupImage = await readImage(document.getElementById('popup-image').files[0]);
      articles.unshift({
        id: Date.now(),
        title,
        date: today(),
        summary,
        image: tileImage,
        heroImage: popupImage,
        content: descriptionToHtml(description)
      });
      downloadUpdatedNews();
      renderArticleList();
      articleForm.reset();
      articleStatus.textContent = 'Updated news.html downloaded. Upload this file to your repository to publish the article.';
    }catch(error){
      articleStatus.textContent = error.message || 'Could not prepare the article.';
    }finally{
      downloadButton.disabled = false;
    }
  });

  updatePasswordMode();
})();
