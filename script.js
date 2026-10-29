(function(){
  'use strict';
  const doc = document;
  const html = doc.documentElement;

  // NAV
  const navToggle = doc.querySelector('.nav-toggle');
  const primaryNav = doc.getElementById('primary-nav');
  function setNavExpanded(expanded){
    if(!navToggle) return;
    navToggle.setAttribute('aria-expanded', String(expanded));
    const label = navToggle.querySelector('.nav-toggle-label');
    if(label) label.textContent = expanded ? 'Close' : 'Menu';
  }
  function openNav(){ html.classList.add('nav-open'); setNavExpanded(true); }
  function closeNav(){ html.classList.remove('nav-open'); setNavExpanded(false); }
  if(primaryNav){
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    primaryNav.querySelectorAll('a').forEach(link=>{
      const isCurrentPage = link.pathname.split('/').pop() === currentPage;
      link.classList.toggle('active', isCurrentPage);
      if(isCurrentPage) link.setAttribute('aria-current','page');
    });
  }
  if(navToggle){
    navToggle.addEventListener('click', ()=>{ const expanded = navToggle.getAttribute('aria-expanded')==='true'; if(expanded) closeNav(); else openNav(); });
    doc.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && html.classList.contains('nav-open')){ closeNav(); navToggle.focus(); } });
    doc.addEventListener('click', (e)=>{ if(!html.classList.contains('nav-open')) return; if(e.target.closest('.primary-nav')||e.target.closest('.nav-toggle')) return; closeNav(); });
    if(primaryNav){ primaryNav.addEventListener('click',(e)=>{ if(e.target.closest('a')) closeNav(); }); }
  }

  // SMOOTH SCROLL FOR INTERNAL LINKS
  doc.addEventListener('click', function(e){
    const a = e.target.closest('a');
    if(!a) return;
    const href = a.getAttribute('href');
    if(!href || href === '#' || !href.startsWith('#')) return;
    const target = doc.querySelector(href);
    if(target){ e.preventDefault(); target.scrollIntoView({behavior:'smooth',block:'start'}); }
  });

  // NEWS RENDERING — retrieves only published articles from Google Apps Script
  let newsData = [];

  function createNewsMedia(src, isVideo, className, alt, controls){
    const driveId = getDriveFileId(src);
    if(isVideo && driveId){
      const frame = doc.createElement('iframe');
      frame.className = className;
      frame.src = `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`;
      frame.title = alt;
      frame.allow = 'autoplay; fullscreen; picture-in-picture';
      return frame;
    }
    const media = doc.createElement(isVideo ? 'video' : 'img');
    media.className = className;
    media.src = !isVideo && driveId
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1600`
      : src;
    if(isVideo){
      media.preload = 'metadata';
      media.playsInline = true;
      if(controls){
        media.controls = true;
      }else{
        media.muted = true;
        media.loop = true;
        media.autoplay = true;
      }
    }else{
      media.alt = alt;
    }
    return media;
  }

  function getDriveFileId(src){
    if(!src) return '';
    try{
      const mediaUrl = new URL(src,window.location.href);
      if(!/(^|\.)drive\.google\.com$/i.test(mediaUrl.hostname)) return '';
      const match = mediaUrl.pathname.match(/\/file\/d\/([^/]+)/);
      return match ? match[1] : mediaUrl.searchParams.get('id') || '';
    }catch(_error){
      return '';
    }
  }

  function isVideoMedia(item, mediaSrc){
    return item.mediaType === 'video'
      || Boolean(item.video || item.heroVideo)
      || /\.(mp4|webm|mov)(?:[?#]|$)/i.test(mediaSrc || '');
  }

  function renderNews(container, data, limit){
    if(!container) return;
    container.innerHTML = '';
    const list = data.slice(0, limit || data.length);
    if(!list.length){
      const emptyMessage = doc.createElement('p');
      emptyMessage.className = 'news-empty';
      emptyMessage.textContent = 'There are no published news articles yet. Please check back soon.';
      container.appendChild(emptyMessage);
      return;
    }
    list.forEach(item=>{
      const el = doc.createElement('article');
      el.className = 'news-item';
      const mediaSrc = item.video || item.image;
      const isVideo = isVideoMedia(item, mediaSrc);
      const mediaFrame = doc.createElement('div');
      mediaFrame.className = 'news-media-frame';
      if(mediaSrc){
        mediaFrame.appendChild(createNewsMedia(mediaSrc, isVideo, 'news-thumb', item.title || 'News image', false));
      }else{
        mediaFrame.classList.add('news-media-placeholder');
        mediaFrame.setAttribute('aria-label', 'No news image provided');
      }

      const content = doc.createElement('div');
      content.className = 'news-content';
      const heading = doc.createElement('h3');
      heading.textContent = item.title || '';
      const date = doc.createElement('div');
      date.className = 'muted';
      date.textContent = item.date || '';
      const summary = doc.createElement('p');
      summary.textContent = item.summary || '';
      const readMore = doc.createElement('a');
      readMore.className = 'link read-more';
      readMore.href = '#';
      readMore.dataset.id = item.id == null ? '' : String(item.id);
      readMore.textContent = 'Read more';
      const readMoreRow = doc.createElement('p');
      readMoreRow.appendChild(readMore);
      content.append(heading, date, summary, readMoreRow);
      el.append(mediaFrame, content);
      container.appendChild(el);
    });
  }

  // On index: preview latest 3
  const previewEl = doc.getElementById('news-preview');
  const allNewsEl = doc.getElementById('news-list');
  if(previewEl || allNewsEl){
    const config = window.ER_DANCE_NEWS_CONFIG || {};
    const apiUrl = config.appsScriptUrl || '';
    const loading = doc.createElement('p');
    loading.className = 'news-loading';
    loading.textContent = apiUrl ? 'Loading news...' : 'News is not configured yet.';
    if(previewEl) previewEl.replaceChildren(loading.cloneNode(true));
    if(allNewsEl) allNewsEl.replaceChildren(loading.cloneNode(true));
    function fetchNews(){
      return new Promise((resolve,reject)=>{
        if(!apiUrl){
          reject(new Error('Add the Google Apps Script web app URL to news-config.js.'));
          return;
        }
        const callbackName = `__erDanceNews_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = doc.createElement('script');
        let timeout;
        function cleanup(){
          window.clearTimeout(timeout);
          delete window[callbackName];
          script.remove();
        }
        window[callbackName] = result=>{
          cleanup();
          if(!result || result.ok !== true){
            reject(new Error(result?.error?.message || 'The news service returned an error.'));
            return;
          }
          if(!Array.isArray(result.data)){
            reject(new Error('The news service returned an invalid article list.'));
            return;
          }
          resolve(result.data);
        };
        script.onerror = ()=>{
          cleanup();
          reject(new Error('The Google Apps Script news service could not be reached.'));
        };
        timeout = window.setTimeout(()=>{
          cleanup();
          reject(new Error('The Google Apps Script news service took too long to respond.'));
        },12000);
        const url = new URL(apiUrl);
        url.searchParams.set('action','articles');
        url.searchParams.set('callback',callbackName);
        script.src = url.toString();
        doc.head.appendChild(script);
      });
    }
    const newsRequest = fetchNews();
    newsRequest.then(data=>{
        newsData = data.filter(article=>article && article.published !== false)
          .sort((left,right)=>(Date.parse(right.date) || 0)-(Date.parse(left.date) || 0));
        if(previewEl) renderNews(previewEl, newsData, 3);
        if(allNewsEl) renderNews(allNewsEl, newsData);
      })
      .catch(error=>{
        console.error('Could not load published news', error);
        if(previewEl || allNewsEl){
          const message = doc.createElement('p');
          message.className = 'news-load-error';
          message.textContent = 'News is temporarily unavailable. Please try again later.';
          if(previewEl) previewEl.replaceChildren(message.cloneNode(true));
          if(allNewsEl) allNewsEl.replaceChildren(message);
        }
      });
  }

  // NEWS MODAL HANDLING
    function openNewsModal(item, trigger){
      const overlay = doc.createElement('div');
      overlay.className = 'news-overlay';
      const modal = doc.createElement('div');
      modal.className = 'news-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', item.title || 'News article');
      const mediaFrame = doc.createElement('div');
      mediaFrame.className = 'modal-media-frame';
      const isVideo = isVideoMedia(item, item.heroVideo || item.video || item.heroImage || item.image);
      const mediaSrc = isVideo
        ? (item.heroVideo || item.video || item.heroImage || item.image)
        : (item.heroImage || item.image);
      if(mediaSrc){
        mediaFrame.appendChild(createNewsMedia(mediaSrc, isVideo, 'modal-image', item.title || 'News image', true));
      }

      const body = doc.createElement('div');
      body.className = 'modal-body';
      const close = doc.createElement('button');
      close.className = 'modal-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Close');
      close.textContent = '×';
      const heading = doc.createElement('h3');
      heading.textContent = item.title || '';
      const date = doc.createElement('div');
      date.className = 'muted';
      date.textContent = item.date || '';
      const description = doc.createElement('div');
      description.className = 'modal-description';
      description.appendChild(safeArticleContent(item.content || ''));
      body.append(close, heading, date, description);
      modal.append(mediaFrame, body);
      overlay.appendChild(modal);
      doc.body.appendChild(overlay);
      function remove(){
        const video = overlay.querySelector('video');
        if(video) video.pause();
        doc.body.removeChild(overlay);
        doc.removeEventListener('keydown', onKey);
        if(trigger && trigger.isConnected) trigger.focus();
      }
      function onKey(e){ if(e.key==='Escape') remove(); }
      overlay.addEventListener('click',(e)=>{ if(e.target===overlay) remove(); });
      close.addEventListener('click', remove);
      doc.addEventListener('keydown', onKey);
      close.focus();
    }

    function safeArticleContent(content){
      if(!/<[a-z][^>]*>/i.test(content)){
        const fragment = doc.createDocumentFragment();
        content.split(/\n\s*\n/).filter(Boolean).forEach(paragraph=>{
          const element = doc.createElement('p');
          paragraph.split('\n').forEach((line,index)=>{
            if(index) element.appendChild(doc.createElement('br'));
            element.appendChild(doc.createTextNode(line));
          });
          fragment.appendChild(element);
        });
        return fragment;
      }
      const parsed = new DOMParser().parseFromString(`<body>${content}</body>`,'text/html');
      const allowed = new Set(['P','BR','STRONG','B','EM','I','UL','OL','LI','BLOCKQUOTE','A']);
      function copyNode(node){
        if(node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent || '');
        if(node.nodeType !== Node.ELEMENT_NODE) return doc.createDocumentFragment();
        if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG'].includes(node.tagName)) return doc.createDocumentFragment();
        const fragment = doc.createDocumentFragment();
        Array.from(node.childNodes).forEach(child=>fragment.appendChild(copyNode(child)));
        if(!allowed.has(node.tagName)) return fragment;
        const element = doc.createElement(node.tagName.toLowerCase());
        if(node.tagName === 'A'){
          try{
            const href = new URL(node.getAttribute('href') || '',window.location.href);
            if(['http:','https:','mailto:'].includes(href.protocol)){
              element.href = href.href;
              element.rel = 'noopener noreferrer';
              element.target = '_blank';
            }
          }catch(_error){}
        }
        element.appendChild(fragment);
        return element;
      }
      const result = doc.createDocumentFragment();
      Array.from(parsed.body.childNodes).forEach(child=>result.appendChild(copyNode(child)));
      return result;
    }

  // attach read-more handlers (delegated)
  doc.addEventListener('click', (e)=>{
    const a = e.target.closest('.read-more');
    if(!a) return;
    e.preventDefault();
    const id = a.dataset.id;
    if(id){
      const item = newsData.find(n=>String(n.id)===String(id));
      if(item) return openNewsModal(item, a);
      return;
    }
    // fallback: find nearest article DOM and build item from DOM
    const article = a.closest('.news-item');
    if(article){
      const media = article.querySelector('.news-thumb');
      const title = article.querySelector('h3') ? article.querySelector('h3').textContent : '';
      const date = article.querySelector('.muted') ? article.querySelector('.muted').textContent : '';
      const summary = article.querySelector('p') ? article.querySelector('p').textContent : '';
      const mediaIsVideo = media && media.tagName === 'VIDEO';
      const newsItem = {
        title,
        date,
        summary,
        mediaType: mediaIsVideo ? 'video' : 'image',
        content: `<p>${summary}</p>`
      };
      if(mediaIsVideo) newsItem.video = media.currentSrc || media.src;
      else if(media) newsItem.image = media.currentSrc || media.src;
      openNewsModal(newsItem, a);
    }
  });

  const bookingForm = doc.getElementById('book-form');
  if(bookingForm){
    const submitButton = bookingForm.querySelector('button[type="submit"]');
    const resultMessage = doc.getElementById('book-result');
    bookingForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if(bookingForm.dataset.submitting === 'true'){
        return;
      }
      const classField = bookingForm.querySelector('#class');
      const notesField = bookingForm.querySelector('#notes');
      const messageField = bookingForm.querySelector('[name="message"]');
      if(classField && messageField){
        const notes = notesField ? notesField.value.trim() : '';
        messageField.value = `Class: ${classField.value}${notes ? `\n\nNotes: ${notes}` : ''}`;
      }
      bookingForm.dataset.submitting = 'true';
      if(submitButton){
        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy','true');
        submitButton.textContent = 'Sending booking request...';
      }
      try{
        const response = await fetch(bookingForm.action, {
          method: bookingForm.method.toUpperCase(),
          body: new FormData(bookingForm)
        });
        const result = await response.json();
        if(!response.ok || result.success !== true){
          throw new Error(result.message || 'Your booking request could not be sent. Please try again.');
        }
        bookingForm.hidden = true;
        if(resultMessage){
          resultMessage.textContent = "Thank you. Your booking request has been sent, and we'll be in touch to confirm.";
          resultMessage.classList.remove('hidden');
        }
      }catch(error){
        if(resultMessage){
          resultMessage.textContent = error.message || 'Could not connect to the booking service. Please try again.';
          resultMessage.classList.remove('hidden');
        }
      }finally{
        bookingForm.dataset.submitting = 'false';
        if(submitButton){
          submitButton.disabled = false;
          submitButton.removeAttribute('aria-busy');
          submitButton.textContent = 'Request Booking';
        }
      }
    });
  }

  // CLASS CARDS INTERACTIONS
  function setupClassCards(){
    const cards = doc.querySelectorAll('.card');
    if(!cards || cards.length===0) return;
    cards.forEach(card=>{
      const toggle = card.querySelector('.toggle-details');
      const details = card.querySelector('.details');
      // ensure initial state
      card.classList.remove('open');
      if(toggle){
        toggle.addEventListener('click', (e)=>{
          e.stopPropagation();
          const isOpen = card.classList.toggle('open');
          toggle.setAttribute('aria-expanded', String(isOpen));
          toggle.textContent = isOpen ? 'Hide details' : 'View details';
        });
      }
      // toggle on card click (but ignore clicks on links/buttons)
      card.addEventListener('click', (e)=>{
        if(e.target.closest('a') || e.target.closest('button')) return;
        const isOpen = card.classList.toggle('open');
        if(toggle) toggle.setAttribute('aria-expanded', String(isOpen));
        if(toggle) toggle.textContent = isOpen ? 'Hide details' : 'View details';
      });
      // keyboard support
      card.setAttribute('tabindex','0');
      card.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          const isOpen = card.classList.toggle('open');
          if(toggle) toggle.setAttribute('aria-expanded', String(isOpen));
          if(toggle) toggle.textContent = isOpen ? 'Hide details' : 'View details';
        }
      });
    });
  }
  setupClassCards();

  // small UX: reveal appear animation
  if('IntersectionObserver' in window){
    const els = doc.querySelectorAll('.card, .news-item, .hero-image');
    const obs = new IntersectionObserver(entries=>{ entries.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add('in-view'); obs.unobserve(en.target); } }); }, {threshold:0.12});
    els.forEach(el=>obs.observe(el));
  }
})();
