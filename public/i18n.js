// Site translation and the language picker in the header.
// The page is written in English. Other languages swap text in place from a dictionary
// (i18n-<lang>.js sets window.I18N_DICTS[lang], loaded only when that language is used),
// and a MutationObserver keeps every re-rendered view translated, so the views themselves
// don't need to know about languages.
// Mark user content with class="notranslate" (or data-no-i18n) to leave it untouched.
(function () {
  const LANGS = {
    en: { name: 'English', flag: 'gb', from: "You're browsing from" },
    de: { name: 'Deutsch', flag: 'de', from: 'Sie surfen aus' },
    fr: { name: 'Français', flag: 'fr', from: 'Vous naviguez depuis' },
    es: { name: 'Español', flag: 'es', from: 'Navegas desde' },
    it: { name: 'Italiano', flag: 'it', from: 'Stai navigando da' },
    ro: { name: 'Română', flag: 'ro', from: 'Navighezi din' },
    he: { name: 'עברית', flag: 'il', from: 'המיקום שלך:', rtl: true },
  };
  // Default language for a first visit, by the visitor's country.
  const BY_COUNTRY = {
    RO: 'ro', MD: 'ro', IL: 'he', DE: 'de', AT: 'de', LI: 'de',
    FR: 'fr', MC: 'fr', ES: 'es', IT: 'it', SM: 'it', VA: 'it',
  };
  const KEY = 'lf-lang';
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT', 'SVG']);
  const enText = new WeakMap();  // text node -> its English text
  const shown = new WeakMap();   // text node -> the text we last put there
  const enAttrs = new WeakMap(); // element -> { attr: English, ['=' + attr]: shown }
  let lang = 'en';
  let country = null;

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const dict = () => (lang === 'en' ? null : (window.I18N_DICTS || {})[lang] || {});

  function tr(text) {
    const d = dict();
    if (!d) return text;
    const k = norm(text);
    if (!k) return text;
    let t = d[k];
    if (t == null) {
      for (const [re, fn] of (window.I18N_PATTERNS || {})[lang] || []) {
        const m = k.match(re);
        if (m) { t = fn(...m.slice(1)); break; }
      }
    }
    if (t == null) return text;
    return text.match(/^\s*/)[0] + t + text.match(/\s*$/)[0];
  }

  const skipped = (el) => !!(el.closest && el.closest('[data-no-i18n], .notranslate'));

  function doText(n) {
    const p = n.parentElement;
    if (!p || SKIP.has(p.tagName.toUpperCase()) || skipped(p)) return;
    // Text that differs from what we last wrote was (re)set by the app: that's the new English.
    if (!enText.has(n) || n.nodeValue !== shown.get(n)) enText.set(n, n.nodeValue);
    const en = enText.get(n);
    // <option> without a value submits its text: pin the English text so forms send the same data.
    if (p.tagName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', norm(en));
    const v = tr(en);
    shown.set(n, v);
    if (n.nodeValue !== v) n.nodeValue = v;
  }

  function doAttrs(el) {
    if (!el.getAttribute) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const store = enAttrs.get(el) || {};
      const cur = el.getAttribute(a);
      if (!(a in store) || cur !== store['=' + a]) store[a] = cur;
      const v = tr(store[a]);
      store['=' + a] = v;
      enAttrs.set(el, store);
      if (cur !== v) el.setAttribute(a, v);
    }
  }

  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || SKIP.has(root.tagName.toUpperCase()) || skipped(root)) return;
    doAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && (SKIP.has(n.tagName.toUpperCase()) || skipped(n))
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) doText(n); else doAttrs(n);
    }
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') doText(m.target);
      else doAttrs(m.target);
    }
  }).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS,
  });

  // ---- language picker (top right of the header) ----
  const flagUrl = (cc) => `https://flagcdn.com/${cc.toLowerCase()}.svg`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function countryName(cc) {
    try { return new Intl.DisplayNames([lang], { type: 'region' }).of(cc); } catch (e) { return cc; }
  }

  function renderPicker() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    let box = nav.querySelector('.lang');
    if (!box) {
      box = document.createElement('div');
      box.className = 'lang';
      box.setAttribute('data-no-i18n', '');
      nav.appendChild(box);
    }
    const open = box.classList.contains('open');
    const flag = country || LANGS[lang].flag;
    box.innerHTML = `
      <button type="button" class="lang-btn" aria-haspopup="true" aria-expanded="${open}" title="${esc(LANGS[lang].name)}">
        <img class="lang-flag" src="${flagUrl(flag)}" alt="" width="20" height="15">
        <span>${lang.toUpperCase()}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="lang-menu" role="menu">
        ${country ? `<div class="lang-from">${esc(LANGS[lang].from)} <b>${esc(countryName(country))}</b></div>` : ''}
        ${Object.entries(LANGS).map(([k, l]) => `
          <button type="button" role="menuitemradio" aria-checked="${k === lang}" data-lang="${k}">
            <img class="lang-flag" src="${flagUrl(l.flag)}" alt="" width="20" height="15"><span>${esc(l.name)}</span>${k === lang ? '<b class="lang-tick">✓</b>' : ''}
          </button>`).join('')}
      </div>`;
    box.querySelector('.lang-btn').onclick = (e) => {
      e.stopPropagation();
      box.classList.toggle('open');
      box.querySelector('.lang-btn').setAttribute('aria-expanded', box.classList.contains('open'));
    };
    box.querySelectorAll('[data-lang]').forEach((b) => {
      b.onclick = () => { box.classList.remove('open'); setLang(b.dataset.lang, true); };
    });
  }
  document.addEventListener('click', (e) => {
    const box = document.querySelector('.nav .lang.open');
    if (box && !box.contains(e.target)) box.classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelector('.nav .lang.open')?.classList.remove('open');
  });

  const dictUrl = (l) => `/i18n-${l}.js?v=${window.I18N_VERSION || 1}`;
  const loading = {};
  function loadDict(l) {
    if (l === 'en' || (window.I18N_DICTS || {})[l]) return Promise.resolve();
    return loading[l] || (loading[l] = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = dictUrl(l);
      s.onload = ok;
      s.onerror = () => { delete loading[l]; fail(new Error('Could not load ' + l)); };
      document.head.appendChild(s);
    }));
  }

  async function setLang(l, remember) {
    if (!LANGS[l]) l = 'en';
    if (remember) { try { localStorage.setItem(KEY, l); } catch (e) { /* private mode */ } }
    try { await loadDict(l); } catch (e) { l = 'en'; }
    lang = l;
    document.documentElement.lang = l;
    document.documentElement.dir = LANGS[l].rtl ? 'rtl' : 'ltr';
    walk(document.documentElement);
    renderPicker();
  }

  function saved() { try { const l = localStorage.getItem(KEY); return LANGS[l] ? l : null; } catch (e) { return null; } }
  function fromBrowser() {
    for (const x of navigator.languages || [navigator.language || '']) {
      const l = String(x).slice(0, 2).toLowerCase();
      if (l === 'iw') return 'he';
      if (LANGS[l]) return l;
    }
    return 'en';
  }

  window.I18N = {
    get lang() { return lang; },
    get country() { return country; },
    set: (l) => setLang(l, true),
    t: tr,
  };

  // Start fetching the likely dictionary right away (while the page parses), to avoid a flash of English.
  const first = saved() || fromBrowser();
  if (first !== 'en') loadDict(first).catch(() => {});

  function start() {
    setLang(first);
    fetch('/api/geo').then((r) => r.json()).then((d) => {
      country = d.country || null;
      const byCountry = BY_COUNTRY[country];
      // First visit: follow the visitor's country when the browser didn't already pick a language.
      if (!saved() && byCountry && byCountry !== lang && first === 'en') setLang(byCountry);
      else renderPicker();
    }).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  const css = document.createElement('style');
  css.textContent = `
    .nav .lang{position:relative;order:3;margin-left:12px}
    .lang-btn{display:flex;align-items:center;gap:7px;height:38px;padding:0 10px;border:1px solid var(--line2);border-radius:999px;background:transparent;color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
    .lang-btn:hover{border-color:var(--accent)}
    .lang-flag{width:20px;height:15px;border-radius:3px;object-fit:cover;flex:none;box-shadow:0 0 0 1px rgba(255,255,255,.12)}
    [dir=rtl] .nav .lang{margin-left:0;margin-right:12px}
    [dir=rtl] .btn span[aria-hidden="true"]{display:inline-block;transform:scaleX(-1)}
    [dir=rtl] .lang-menu{right:auto;left:0}
    [dir=rtl] .lang-menu [data-lang]{text-align:right}
    [dir=rtl] .lang-tick{margin-left:0;margin-right:auto}
    .lang-menu{display:none;position:absolute;right:0;top:calc(100% + 8px);min-width:210px;max-height:70vh;overflow-y:auto;padding:6px;background:var(--panel);border:1px solid var(--line2);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.45);z-index:60}
    .lang.open .lang-menu{display:block}
    .lang-from{padding:8px 10px 10px;margin-bottom:4px;border-bottom:1px solid var(--line);color:var(--muted);font-size:13px}
    .lang-from b{color:var(--ink);font-weight:600}
    .lang-menu [data-lang]{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:9px;background:transparent;color:var(--ink);font:inherit;font-size:14.5px;text-align:left;cursor:pointer}
    .lang-menu [data-lang]:hover{background:var(--panel2)}
    .lang-tick{margin-left:auto;color:var(--accent)}
    .nav .menu-btn{order:4}
    @media (max-width:1180px){ .nav .lang{margin-left:auto} .nav .menu-btn{margin-left:8px} [dir=rtl] .nav .lang{margin-left:0;margin-right:auto} [dir=rtl] .nav .menu-btn{margin-left:0;margin-right:8px} }`;
  document.head.appendChild(css);
})();
