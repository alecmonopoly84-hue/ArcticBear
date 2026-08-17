const form=document.getElementById('partsForm');
const modeInput=document.getElementById('partsMode');
const requestField=document.getElementById('partRequest');
const modeButtons=[...document.querySelectorAll('.mode-btn')];
function setMode(mode){
  const install=mode==='install';
  modeInput.value=install?'Запчасть + установка':'Только запчасть';
  modeButtons.forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  const url=new URL(window.location.href);
  if(install) url.searchParams.set('service','install'); else url.searchParams.delete('service');
  history.replaceState({},'',url);
}
document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>{
  setMode(el.dataset.mode);
  if(el.dataset.hint) requestField.value=el.dataset.hint;
}));
modeButtons.forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
const params=new URLSearchParams(location.search); if(params.get('service')==='install') setMode('install');
form.addEventListener('submit',e=>{e.preventDefault();document.getElementById('partsStatus').style.display='block';});
