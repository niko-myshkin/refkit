// Выбор элемента на экране для комментария (как у Doop): в режиме комментария элемент под курсором подсвечивается, клик отдаёт его
// родителю. Экран живёт в двух вложенных песочницах без доступа родителя к DOM, поэтому в оба документа при показе подмешиваются
// скрипты: внутри — слежение за мышью, снаружи — пересылка сообщений. Работает и для уже собранных экранов (в файле они не меняются).
export type PickedElement = { tag: string; sel: string; text: string; rect: [number, number, number, number] }

const INNER = `(function(){var on=false,last=null;
function path(el){var p=[];while(el&&el.nodeType===1&&el!==document.body&&p.length<6){var s=el.tagName.toLowerCase(),i=0,n=el;while((n=n.previousElementSibling))if(n.tagName===el.tagName)i++;if(i)s+=':nth('+(i+1)+')';p.unshift(s);el=el.parentElement}return p.join(' > ')}
function info(el){var r=el.getBoundingClientRect();return{tag:el.tagName.toLowerCase(),sel:path(el),text:(el.innerText||el.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,80),rect:[Math.round(r.left+scrollX),Math.round(r.top+scrollY),Math.round(r.width),Math.round(r.height)]}}
function at(e){var el=document.elementFromPoint(e.clientX,e.clientY);return !el||el===document.documentElement||el===document.body?null:el}
addEventListener('message',function(e){if(e.data&&e.data.refkitPickMode!==undefined){on=!!e.data.refkitPickMode;document.documentElement.style.cursor=on?'crosshair':'';if(!on){last=null;parent.postMessage({refkitHover:null},'*')}}});
addEventListener('mousemove',function(e){if(!on)return;var el=at(e);if(el!==last){last=el;parent.postMessage({refkitHover:el?info(el):null},'*')}},true);
addEventListener('click',function(e){if(!on)return;e.preventDefault();e.stopPropagation();var el=at(e);if(el)parent.postMessage({refkitPicked:info(el),refkitPage:[Math.max(document.documentElement.scrollWidth,innerWidth),Math.max(document.documentElement.scrollHeight,innerHeight)]},'*')},true);
var edit=false,cur=null,orig='',mark=null;
function leaf(el){return !!el&&el.children.length===0&&!!(el.textContent||'').trim()&&!/^(SCRIPT|STYLE|SVG|IMG|BUTTON|INPUT)$/i.test(el.tagName)}
function unmark(){if(mark&&mark!==cur){mark.style.outline=''}mark=null}
function start(el){cur=el;orig=el.textContent;el.contentEditable='plaintext-only';el.style.outline='2px solid #3b82f6';el.style.outlineOffset='2px';el.focus();var r=document.createRange();r.selectNodeContents(el);var s=getSelection();s.removeAllRanges();s.addRange(r)}
function done(save){if(!cur)return;var el=cur;cur=null;el.contentEditable='false';el.style.outline='';el.style.outlineOffset='';var now=(el.textContent||'').replace(/\\s+/g,' ').trim(),was=orig.replace(/\\s+/g,' ').trim();if(save&&now&&now!==was)parent.postMessage({refkitEdited:{from:was,to:now}},'*');else el.textContent=orig}
addEventListener('message',function(e){if(e.data&&e.data.refkitEditMode!==undefined){edit=!!e.data.refkitEditMode;document.documentElement.style.cursor=edit?'text':'';if(!edit){unmark();done(false)}}});
addEventListener('mousemove',function(e){if(!edit||cur)return;var el=at(e);if(el===mark)return;unmark();if(leaf(el)){mark=el;el.style.outline='1px dashed #3b82f6';el.style.outlineOffset='2px'}},true);
addEventListener('click',function(e){if(!edit)return;var el=at(e);if(cur&&el===cur)return;if(cur)done(true);if(!leaf(el)){return}e.preventDefault();e.stopPropagation();unmark();start(el)},true);
addEventListener('keydown',function(e){if(!cur)return;if(e.key==='Enter'){e.preventDefault();done(true)}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(false)}},true);
})()`
const OUTER = `addEventListener('message',function(e){var f=document.querySelector('iframe');if(!f)return;if(e.source===parent){if(e.data&&(e.data.refkitPickMode!==undefined||e.data.refkitEditMode!==undefined))f.contentWindow.postMessage(e.data,'*')}else if(e.source===f.contentWindow&&e.data&&(e.data.refkitHover!==undefined||e.data.refkitPicked||e.data.refkitEdited))parent.postMessage(e.data,'*')})`

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const beforeLastBody = (html: string, marker: string, add: string) => {
  const at = html.lastIndexOf(marker)
  return at < 0 ? html : html.slice(0, at) + add + html.slice(at)
}
/** Экран React с подмешанными скриптами выбора элемента; чужой HTML (старые без скриптов) возвращается как есть */
export function withPicker(html: string) {
  if (!html.includes('data-refkit-screen="react"') || html.includes('refkitPickMode')) return html
  const inner = beforeLastBody(html, '&lt;/body&gt;', `&lt;script&gt;${escape(INNER)}&lt;/script&gt;`)
  return beforeLastBody(inner, '</body>', `<script>${OUTER}</script>`)
}
