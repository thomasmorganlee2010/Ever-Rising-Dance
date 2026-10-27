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
    if(!href || !href.startsWith('#')) return;
    const target = doc.querySelector(href);
    if(target){ e.preventDefault(); target.scrollIntoView({behavior:'smooth',block:'start'}); }
  });

  // NEWS RENDERING — reads JSON from <script id="news-data"> when present
  function renderNews(container, data, limit){
    if(!container) return;
    container.innerHTML = '';
    const list = data.slice(0, limit || data.length);
    list.forEach(item=>{
      const el = doc.createElement('article');
      el.className = 'news-item';
      const imgSrc = item.image || 'news-placeholder.jpg';
      el.innerHTML = `<img src="${imgSrc}" class="news-thumb" alt="${item.title}">` +
                     `<div class="news-content"><h3>${item.title}</h3><div class="muted">${item.date}</div><p>${item.summary}</p><p><a class="link read-more" href="#" data-id="${item.id||''}">Read more</a></p></div>`;
      container.appendChild(el);
    });
  }

  // On index: preview latest 3
  const previewEl = doc.getElementById('news-preview');
  const newsScript = doc.getElementById('news-data');
  if(newsScript){
    try{
      const newsData = JSON.parse(newsScript.textContent);
      const allNewsEl = doc.getElementById('news-list');
      if(previewEl) renderNews(previewEl, newsData, 3);
      if(allNewsEl) renderNews(allNewsEl, newsData);
    }catch(err){ console.error('Invalid news JSON', err); }
  }

  // NEWS MODAL HANDLING
    function openNewsModal(item){
    // build overlay
    const overlay = doc.createElement('div');
    overlay.className = 'news-overlay';
    overlay.innerHTML = `
      <div class="news-modal" role="dialog" aria-modal="true">
        <img src="${item.heroImage||item.image||'news-placeholder.jpg'}" class="modal-image" alt="${item.title}">
        <div class="modal-body">
          <button class="modal-close" aria-label="Close">×</button>
          <h3>${item.title}</h3>
          <div class="muted">${item.date}</div>
          <div class="modal-description">${item.content || ''}</div>
        </div>
      </div>`;
    doc.body.appendChild(overlay);
    const close = overlay.querySelector('.modal-close');
    function remove(){ doc.body.removeChild(overlay); doc.removeEventListener('keydown', onKey); }
    function onKey(e){ if(e.key==='Escape') remove(); }
    overlay.addEventListener('click',(e)=>{ if(e.target===overlay) remove(); });
    close.addEventListener('click', remove);
    doc.addEventListener('keydown', onKey);
  }

  // attach read-more handlers (delegated)
  doc.addEventListener('click', (e)=>{
    const a = e.target.closest('.read-more');
    if(!a) return;
    e.preventDefault();
    // find data-id or fallback to nearest news-item content
    const id = a.dataset.id;
    if(id && newsScript){
      try{
        const newsData = JSON.parse(newsScript.textContent);
        const item = newsData.find(n=>String(n.id)===String(id));
        if(item) return openNewsModal(item);
      }catch(err){}
    }
    // fallback: find nearest article DOM and build item from DOM
    const article = a.closest('.news-item');
    if(article){
      const img = article.querySelector('.news-thumb');
      const title = article.querySelector('h3') ? article.querySelector('h3').textContent : '';
      const date = article.querySelector('.muted') ? article.querySelector('.muted').textContent : '';
      const summary = article.querySelector('p') ? article.querySelector('p').textContent : '';
      openNewsModal({ image: img ? img.src : 'news-placeholder.jpg', title, date, summary });
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
