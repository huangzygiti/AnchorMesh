import {MeshViewer,loadModel,modelInfo,cloneModel,disposeModel,THREE} from './viewer.js';

const $=s=>document.querySelector(s);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let toastTimer;
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
function stats(root){const info=modelInfo(root);return `${info.vertices.toLocaleString()} vertices · ${info.faces.toLocaleString()} faces`;}

const menu=$('.menu-button');
function closeMenu(){menu.setAttribute('aria-expanded','false');$('#mobile-nav').hidden=true;menu.querySelector('span').textContent='+';}
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));$('#mobile-nav').hidden=!open;menu.querySelector('span').textContent=open?'−':'+';});
for(const a of $('#mobile-nav').querySelectorAll('a'))a.addEventListener('click',closeMenu);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});

// Both result sections share markup, controls and camera behavior.
class MeshExplorer {
  constructor(root,kind,entries){
    this.root=root;this.kind=kind;this.entries=entries;this.epoch=0;this.mode='hybrid';this.rotating=!reduced;this.syncing=false;this.interactions=0;
    root.innerHTML=`<div class="gallery-layout result-layout">
      <aside class="gallery-sidebar"><div class="sidebar-title"><span>Examples</span><span>${entries.length}</span></div><div class="gallery-list" id="${kind}-list" aria-label="${kind==='generation'?'Generation':'Reconstruction'} examples"></div></aside>
      <div class="viewer-shell paired-viewer-shell" id="${kind}-frame">
        <div class="viewer-topbar"><span data-role="name">Loading…</span><button class="icon-button" data-action="fullscreen" aria-label="Expand ${kind} viewer" title="Expand viewer">⤢</button></div>
        <div class="comparison-grid">
          <div class="compare-pane"><div class="pane-label"><i class="gt-dot"></i><span>Ground truth</span></div><div class="compare-viewer" id="${kind}-reference"><div class="pane-placeholder"><p>Loading…</p></div></div><div class="pane-stats" data-role="reference-stats"></div></div>
          <div class="compare-pane"><div class="pane-label"><i class="ours-dot"></i><span>AnchorMesh</span></div><div class="compare-viewer" id="${kind}-output"><div class="pane-placeholder"><p>Loading…</p></div></div><div class="pane-stats" data-role="output-stats"></div></div>
        </div>
        <div class="result-toolbar"><div class="segmented" role="group" aria-label="${kind==='generation'?'Generation':'Reconstruction'} display"><button data-mode="hybrid" class="active" aria-pressed="true">Surface + edges</button><button data-mode="wire" aria-pressed="false">Wireframe</button><button data-mode="points" aria-pressed="false">Vertices</button></div><div class="result-actions"><button class="tool-button motion-button" data-action="motion" aria-pressed="${this.rotating}">${this.rotating?'Pause rotation':'Start rotation'}</button><button class="tool-button" data-action="reset">Reset view ↺</button></div></div>
        <p class="result-status" data-role="status" role="status">Loading…</p>
      </div></div>`;
    this.list=root.querySelector('.gallery-list');
    for(const record of entries){const button=document.createElement('button');button.className='gallery-item';button.dataset.example=record.id;button.textContent=record.label;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>this.select(record,button));this.list.append(button);}
    root.addEventListener('click',event=>{
      const mode=event.target.closest('[data-mode]');
      if(mode){this.mode=mode.dataset.mode;for(const b of root.querySelectorAll('[data-mode]')){const active=b===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}this.left?.setMode(this.mode);this.right?.setMode(this.mode);}
      const action=event.target.closest('[data-action]')?.dataset.action;
      if(action==='motion'){this.rotating=!this.rotating;this.updateMotion();}
      if(action==='reset'&&this.box)this.frame();
      if(action==='fullscreen')this.fullscreen();
    });
    if(entries.length)this.select(entries[0],this.list.querySelector('button'));
  }
  role(name){return this.root.querySelector(`[data-role="${name}"]`);}
  ensureViewers(){
    if(this.left)return;
    this.left=new MeshViewer(this.root.querySelector(`#${this.kind}-reference`),{color:0xbcb0c7,edge:0x514760,linked:true});
    this.right=new MeshViewer(this.root.querySelector(`#${this.kind}-output`),{linked:true});
    for(const [source,target] of [[this.left,this.right],[this.right,this.left]]){
      source.onChange=()=>{if(this.syncing)return;this.syncing=true;target.syncFrom(source);this.syncing=false;};
      source.onInteractionStart=()=>{this.interactions++;this.updateMotion();};
      source.onInteractionEnd=()=>{this.interactions=Math.max(0,this.interactions-1);this.updateMotion();};
      source.onVisibilityChange=()=>this.updateMotion();
    }
    for(const placeholder of this.root.querySelectorAll('.pane-placeholder'))placeholder.hidden=true;
    this.updateMotion();
  }
  updateMotion(){
    // Advance one camera; its paired camera follows without a second rotation.
    const leader=this.left?.visible||!this.right?.visible?this.left:this.right;
    const active=this.rotating&&this.interactions===0;
    this.left?.setMotion(active&&leader===this.left);this.right?.setMotion(active&&leader===this.right);
    const button=this.root.querySelector('[data-action="motion"]');button.setAttribute('aria-pressed',String(this.rotating));button.textContent=this.rotating?'Pause rotation':'Start rotation';
  }
  frame(){this.syncing=true;this.left.frame(this.box,this.record.view);this.right.frame(this.box,this.record.view);this.right.syncFrom(this.left);this.syncing=false;}
  async select(record,button){
    const epoch=++this.epoch;this.role('status').hidden=false;this.role('status').textContent='Loading…';this.role('name').textContent=record.label;
    for(const b of this.list.querySelectorAll('button')){const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
    let loaded=[];
    try{
      const urls=this.kind==='generation'?[record.reference,record.mesh]:[record.gt,record.outputs.anchormesh];
      const results=await Promise.allSettled(urls.map(url=>loadModel(url,record.up||'Y')));
      loaded=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
      const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
      if(epoch!==this.epoch){for(const root of loaded)disposeModel(root);return;}
      this.ensureViewers();
      const box=new THREE.Box3();for(const root of loaded)box.union(new THREE.Box3().setFromObject(root));
      const info=loaded.map(stats);
      this.syncing=true;this.left.setModel(cloneModel(loaded[0]));this.right.setModel(cloneModel(loaded[1]));this.syncing=false;
      this.record=record;this.box=box;this.frame();this.left.setMode(this.mode);this.right.setMode(this.mode);this.updateMotion();
      this.role('reference-stats').textContent=info[0];this.role('output-stats').textContent=info[1];this.role('status').hidden=true;
      for(const root of loaded)disposeModel(root);
    }catch(error){for(const root of loaded)disposeModel(root);this.syncing=false;if(epoch===this.epoch){this.role('status').textContent='This example could not be loaded.';toast(error.message);}}
  }
  async fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await this.root.querySelector('.paired-viewer-shell').requestFullscreen();}catch{toast('Fullscreen is unavailable in this preview.');}}
}

const paperTabs=[...document.querySelectorAll('[data-method-figure]')];
function selectPaperFigure(tab){for(const button of paperTabs){const active=button===tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$('#method-panel-'+button.dataset.methodFigure).hidden=!active;}}
for(const tab of paperTabs){tab.addEventListener('click',()=>selectPaperFigure(tab));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?paperTabs.length-1:(paperTabs.indexOf(tab)+(event.key==='ArrowRight'?1:-1)+paperTabs.length)%paperTabs.length;selectPaperFigure(paperTabs[next]);paperTabs[next].focus();});}

// Empty URLs keep the current placeholders. Published URLs enable the links later.
const resourceUrls={paper:null,code:null};
function publicationUrl(value){if(!value)return null;try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}}
for(const button of document.querySelectorAll('[data-resource]'))button.addEventListener('click',()=>{
  const url=resourceUrls[button.dataset.resource];
  if(url){window.open(url,'_blank','noopener,noreferrer');return;}
  button.classList.remove('clicked');void button.offsetWidth;button.classList.add('clicked');setTimeout(()=>button.classList.remove('clicked'),220);
});

async function loadContent(){
  try{
    const response=await fetch('./content.json');if(!response.ok)throw new Error('Content unavailable');const config=await response.json();const p=config.project||{};
    if(p.title)document.title=p.title;
    if(!p.anonymous&&p.authors?.length){$('#author-line').textContent=p.authors.join(' · ');$('#author-line').hidden=false;}
    if(p.intro)$('#project-intro').textContent=p.intro;
    resourceUrls.paper=publicationUrl(p.paperUrl);resourceUrls.code=publicationUrl(p.codeUrl);
    new MeshExplorer($('#generation-explorer'),'generation',config.gallery||[]);
    new MeshExplorer($('#reconstruction-explorer'),'reconstruction',config.reconstructions||[]);
    if(p.bibtex){$('#citation').hidden=false;$('#bibtex-text').textContent=p.bibtex;}
  }catch(error){console.warn(error);toast('Project content could not be loaded. Please reload the page.');}
}
$('#copy-citation').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#bibtex-text').textContent);$('#copy-status').textContent='BibTeX copied.';}catch{$('#copy-status').textContent='Select the BibTeX above and copy it.';}});
for(const root of document.querySelectorAll('.mesh-explorer'))root.addEventListener('viewer-error',event=>toast(event.detail));
loadContent();
