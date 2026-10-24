export const $ = (selector,root=document) => root.querySelector(selector);
export const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function api(path,body,method) {
  let response;
  try { response=await fetch('/api'+path,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)}); }
  catch { throw new Error('Cannot reach the host Mac. Check the local Wi-Fi connection and try again.'); }
  const data=await response.json();
  if(!response.ok){const e=new Error(data.error||'Please try again.');e.status=response.status;e.code=data.code;throw e;}
  return data;
}
export const icons = {
  arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 2v6m-5 1h10"/></svg>',
  wheel:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="6"/><path d="m6 18 13 3m23-3-13 3m-5 9v13M8 14c9-5 23-5 32 0"/></svg>',
  road:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M15 4 4 44M33 4l11 40M24 4v8m0 8v8m0 8v8"/></svg>',
  bolt:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m28 3-19 25h14l-3 17 20-26H26l2-16Z"/></svg>'
};
export const brandLogo = '<img class="brand-lockup" src="/assets/brand-lockup.svg" alt="MHERO and Al Ghurair" width="1040" height="180">';
export function header(config,active='') {return `<header class="site-header"><div class="brand">${brandLogo}</div><span class="screen-label">${active==='scores'?'LIVE LEADERBOARD':'REGISTRATION'}</span></header>`;}
export function footer(config){return `<footer class="site-footer"><span>NEVER BACK DOWN.</span><span>${esc(config.venueName)}</span></footer>`;}
export function countryOptions(config,selected){return config.countries.map(c=>`<option value="${c.code}" ${c.code===selected?'selected':''}>${c.dial} · ${esc(c.name)}</option>`).join('');}
export function phoneFields(config,country,number=''){return `<div class="phone-fields"><label>Country code<select name="country" autocomplete="country" required>${countryOptions(config,country||config.country)}</select></label><label>Phone number<input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="50 123 4567" maxlength="40" value="${esc(number)}" required></label></div>`;}
export function formError(form,message){let box=$('.form-error',form);if(!box){box=document.createElement('p');box.className='form-error';box.setAttribute('role','alert');form.append(box);}box.textContent=message;}
export function toast(message){const node=$('#toast');node.textContent=message;node.classList.add('visible');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>node.classList.remove('visible'),4500);}
export const formatScore = score => new Intl.NumberFormat('en',{maximumFractionDigits:3}).format(score);
export function dateLabel(date){return date?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',dateStyle:'medium',timeStyle:'short'}).format(new Date(date)):'—';}
export async function submit(form,action){const button=$('button[type="submit"]',form);if(button)button.disabled=true;$('.form-error',form)?.remove();try{await action(Object.fromEntries(new FormData(form)));}catch(e){formError(form,e.message);}finally{if(button)button.disabled=false;}}
