(function(){
  'use strict';

  const config = window.ER_DANCE_NEWS_CONFIG || {};
  const link = document.getElementById('open-news-manager');
  const status = document.getElementById('manager-status');

  if(!config.appsScriptUrl){
    link.removeAttribute('href');
    link.setAttribute('aria-disabled','true');
    link.classList.add('is-disabled');
    status.textContent = 'The news manager is not connected yet. Follow PUBLISHING.md to deploy the Google Apps Script, then add its web app URL to news-config.js.';
    return;
  }

  const managerUrl = new URL(config.appsScriptUrl);
  managerUrl.searchParams.set('view','admin');
  link.href = managerUrl.toString();
  status.textContent = 'The secure manager opens on Google Apps Script. Sign in with the staff password to manage articles.';
})();
