(()=>{
  const nav=document.querySelector('.nav');
  const wrap=document.querySelector('.nav-wrap');
  if(nav&&wrap){
    wrap.classList.add('header-nav-enabled');
    const links=[...nav.querySelectorAll(':scope > a')];
    const service=links.find(a=>a.getAttribute('href')==='#services');
    const parts=links.find(a=>a.getAttribute('href')==='parts/');
    if(service){
      service.textContent='Сервис';
      service.classList.add('nav-product','is-active');
      service.setAttribute('aria-current','page');
    }
    if(parts) parts.classList.add('nav-product');
    links.forEach(a=>{
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

  document.querySelectorAll('[data-photo]').forEach(el=>el.addEventListener('click',()=>{
    setTimeout(()=>{
      const file=document.querySelector('input[type="file"]');
      if(file) file.closest('label').scrollIntoView({behavior:'smooth',block:'center'});
    },400);
  }));
  const leadForm=document.getElementById('leadForm');
  if(leadForm) leadForm.addEventListener('submit',e=>{
    e.preventDefault();
    const status=document.getElementById('status');
    if(status) status.style.display='block';
  });

  const hero=document.querySelector('.hero-photo');
  if(hero) hero.style.backgroundImage='linear-gradient(180deg,rgba(11,23,19,.02),rgba(11,23,19,.18)),url("media/hero-abservice.jpg")';

  const servicePhotos=[...document.querySelectorAll('.service-card img')];
  const serviceSources=[
    'media/diag-repair-abservice.jpg',
    'media/field-service-abservice.jpg',
    'media/closeup-service-abservice.jpg',
    'media/closeup-service-abservice.jpg'
  ];
  servicePhotos.forEach((img,i)=>{if(serviceSources[i]) img.src=serviceSources[i];});

  const team=document.querySelector('.team-photo');
  if(team) team.style.backgroundImage='url("media/team-abservice.jpg")';

  const galleryPhotos=[...document.querySelectorAll('.gallery-item img')];
  const gallerySources=[
    'media/field-service-abservice.jpg',
    'media/closeup-service-abservice.jpg',
    'media/team-abservice.jpg'
  ];
  galleryPhotos.forEach((img,i)=>{if(gallerySources[i]) img.src=gallerySources[i];});
})();