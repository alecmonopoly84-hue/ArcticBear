(()=>{
  const nav=document.querySelector('.nav');
  const wrap=document.querySelector('.nav-wrap');
  if(nav&&wrap){
    wrap.classList.add('header-nav-enabled');
    const service=[...nav.querySelectorAll(':scope > a')].find(a=>a.getAttribute('href')==='../');
    let parts=[...nav.querySelectorAll(':scope > a')].find(a=>a.classList.contains('nav-parts-link'));
    if(!parts){
      parts=document.createElement('a');
      parts.href='./';
      parts.textContent='Запчасти';
      parts.className='nav-product nav-parts-link is-active';
      if(service) service.insertAdjacentElement('afterend',parts); else nav.prepend(parts);
    }
    if(service) service.classList.add('nav-product');
    parts.classList.add('nav-product','is-active');
    parts.setAttribute('aria-current','page');
    [...nav.querySelectorAll(':scope > a')].forEach(a=>{
      if(a!==service&&a!==parts) a.classList.add('nav-secondary');
    });

    const style=document.createElement('style');
    style.id='abservice-product-nav';
    style.textContent=`
      .header-nav-enabled .nav{margin-left:auto;display:flex;align-items:center;gap:8px}
      .header-nav-enabled .nav a{transition:background .18s ease,border-color .18s ease,color .18s ease,transform .18s ease}
      .header-nav-enabled .nav .nav-product{min-height:42px;padding:0 18px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(11,23,19,.18);border-radius:12px;background:rgba(255,255,255,.54);color:var(--ink);font-size:14px;font-weight:900;letter-spacing:-.015em;white-space:nowrap}
      .header-nav-enabled .nav .nav-product:hover{transform:translateY(-1px);border-color:rgba(11,23,19,.36)}
      .header-nav-enabled .nav .nav-product.is-active{background:var(--accent);border-color:var(--accent);color:var(--ink);box-shadow:0 6px 18px rgba(11,23,19,.08)}
      .header-nav-enabled .nav .nav-secondary{padding:9px 4px;color:#7a847f;font-size:11.5px;font-weight:700;white-space:nowrap}
      .header-nav-enabled .nav .nav-product + .nav-secondary{margin-left:10px}
      .header-nav-enabled .nav .nav-secondary:hover{color:var(--ink)}
      @media(max-width:1150px){
        .header-nav-enabled .nav .nav-secondary{display:none}
      }
      @media(max-width:1020px){
        .header-nav-enabled .nav{display:flex}
      }
      @media(max-width:700px){
        .header-nav-enabled{min-height:auto;flex-wrap:wrap;gap:8px 12px;padding:8px 0}
        .header-nav-enabled .brand{flex:1 1 auto}
        .header-nav-enabled .nav-actions{margin-left:auto}
        .header-nav-enabled .nav{order:3;width:100%;margin:0;display:flex;gap:8px}
        .header-nav-enabled .nav .nav-product{flex:1;min-height:42px;padding:0 12px;font-size:13px}
        .header-nav-enabled .nav .nav-secondary{display:none}
      }
    `;
    document.head.appendChild(style);
  }

  const form=document.getElementById('partsForm');
  const modeInput=document.getElementById('partsMode');
  const requestField=document.getElementById('partRequest');
  const modeButtons=[...document.querySelectorAll('.mode-btn')];
  function setMode(mode){
    const install=mode==='install';
    if(modeInput) modeInput.value=install?'Запчасть + установка':'Только запчасть';
    modeButtons.forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    const url=new URL(window.location.href);
    if(install) url.searchParams.set('service','install'); else url.searchParams.delete('service');
    history.replaceState({},'',url);
  }
  document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>{
    setMode(el.dataset.mode);
    if(el.dataset.hint&&requestField) requestField.value=el.dataset.hint;
  }));
  modeButtons.forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  const params=new URLSearchParams(location.search);
  if(params.get('service')==='install') setMode('install');
  if(form) form.addEventListener('submit',e=>{
    e.preventDefault();
    const status=document.getElementById('partsStatus');
    if(status) status.style.display='block';
  });
})();