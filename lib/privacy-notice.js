(function () {
  'use strict';
  function mount() {
    if (document.getElementById('privacy-notice')) return;
    const footer = document.querySelector('footer');
    if (!footer) return;
    const style = document.createElement('style');
    style.textContent = '#privacy-notice{box-sizing:border-box;max-width:1050px;width:calc(100% - 32px);margin:16px auto;padding:18px 20px;border:1px solid #94a3b8;border-radius:14px;background:#fff;color:#111;text-align:left;font:14px/1.5 system-ui,sans-serif}#privacy-notice[hidden]{display:none}#privacy-notice h2{margin:0 0 8px;font-size:16px;font-weight:750;color:#111}#privacy-notice p{margin:6px 0;color:#111}#privacy-notice a{color:#123d63;text-decoration:underline}#privacy-notice button{padding:9px 14px;margin:10px 12px 0 0;border:1px solid #111;border-radius:8px;background:#fff;color:#111;font:inherit;font-weight:650;cursor:pointer}#privacy-notice :focus-visible,#privacy-notice-open:focus-visible{outline:3px solid #111;outline-offset:3px}#privacy-notice-open{color:inherit;background:transparent;border:0;text-decoration:underline;font:inherit;cursor:pointer;padding:8px}#privacy-notice .privacy-notice-small{font-size:12px}@media print{#privacy-notice,#privacy-notice-open{display:none!important}}';
    document.head.appendChild(style);
    const notice = document.createElement('aside');
    notice.id = 'privacy-notice';
    notice.setAttribute('aria-labelledby', 'privacy-notice-title');
    notice.innerHTML = '<h2 id="privacy-notice-title" tabindex="-1">Cookie e tecnologie del sito</h2><p>L’applicazione non imposta cookie e non integra pubblicità o strumenti di analisi del comportamento. La sessione di accesso è mantenuta in memoria; i servizi necessari di hosting e autenticazione trattano dati tecnici come descritto nell’informativa.</p><p class="privacy-notice-small">Questo è un avviso informativo: non occorre acconsentire al tracciamento per votare. La chiusura vale fino al prossimo caricamento della pagina e non viene salvata sul dispositivo.</p><button type="button" data-privacy-close>Ho letto, chiudi avviso</button><a href="note-legali.html#strumenti" target="_blank" rel="noopener noreferrer">Leggi l’informativa completa</a>';
    footer.before(notice);
    const reopen = document.createElement('button');
    reopen.id = 'privacy-notice-open';
    reopen.type = 'button';
    reopen.textContent = 'Cookie e tecnologie';
    reopen.setAttribute('aria-controls', notice.id);
    reopen.setAttribute('aria-expanded', 'true');
    footer.appendChild(reopen);
    notice.querySelector('[data-privacy-close]').addEventListener('click', function () {
      notice.hidden = true;
      reopen.setAttribute('aria-expanded', 'false');
      reopen.focus();
    });
    reopen.addEventListener('click', function () {
      notice.hidden = false;
      reopen.setAttribute('aria-expanded', 'true');
      notice.querySelector('h2').focus();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
