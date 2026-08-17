(()=>{
  const LEAD_API_URL='https://abservice-leads.vercel.app/api/lead';

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
      @media(max-width:1150px){.header-nav-enabled .nav .nav-secondary{display:none}}
      @media(max-width:1020px){.header-nav-enabled .nav{display:flex}}
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

  const blobToBase64=blob=>new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
    reader.onerror=reject;
    reader.readAsDataURL(blob);
  });

  async function compressImage(file){
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();
      img.src=url;
      await img.decode();
      const maxSide=1600;
      const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const toBlob=quality=>new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      let blob=await toBlob(.78);
      if(blob&&blob.size>1_400_000) blob=await toBlob(.62);
      return blob||file;
    }finally{URL.revokeObjectURL(url)}
  }

  async function collectAttachments(form){
    const selected=[...form.querySelectorAll('input[type="file"]')].flatMap(input=>[...(input.files||[])]).slice(0,2);
    const attachments=[];
    let skipped=0;
    for(const file of selected){
      let blob=file;
      let name=file.name;
      let type=file.type||'application/octet-stream';
      if(type.startsWith('image/')){
        blob=await compressImage(file);
        name=file.name.replace(/\.[^.]+$/, '')+'.jpg';
        type='image/jpeg';
      }
      if(blob.size>1_500_000){skipped++;continue}
      attachments.push({name,type,data:await blobToBase64(blob)});
    }
    return {attachments,skipped};
  }

  const leadForm=document.getElementById('leadForm');
  if(leadForm) leadForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const status=document.getElementById('status');
    const button=leadForm.querySelector('button[type="submit"]');
    if(!LEAD_API_URL){
      if(status){status.textContent='Интеграция с Telegram настраивается. Для срочного обращения позвоните 8 800 555-44-33.';status.style.display='block'}
      return;
    }
    if(button){button.disabled=true;button.textContent='Отправляем…'}
    if(status){status.textContent='Отправляем заявку…';status.style.display='block'}
    try{
      const data=new FormData(leadForm);
      const {attachments,skipped}=await collectAttachments(leadForm);
      const payload={
        kind:'service',
        source:location.href,
        name:data.get('name')||'',
        phone:data.get('phone')||'',
        machine:data.get('machine')||'',
        location:data.get('location')||'',
        issue:data.get('issue')||'',
        attachments,
        attachmentsSkipped:skipped
      };
      const response=await fetch(LEAD_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!response.ok) throw new Error('send failed');
      leadForm.reset();
      if(status) status.textContent=skipped?'Заявка отправлена в ABService. Большой файл не приложен — при необходимости мы запросим его отдельно.':'Заявка отправлена в ABService. Мы свяжемся с вами по указанному телефону.';
    }catch(err){
      console.error(err);
      if(status) status.textContent='Не удалось отправить заявку. Позвоните нам: 8 800 555-44-33.';
    }finally{
      if(button){button.disabled=false;button.textContent='Отправить заявку'}
    }
  });
})();