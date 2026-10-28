import * as THREE from 'three';
import { OrbitControls } from './assets/vendor/controls/OrbitControls.js';
import { OBJLoader } from './assets/vendor/loaders/OBJLoader.js';
import { PLYLoader } from './assets/vendor/loaders/PLYLoader.js';
import { GLTFLoader } from './assets/vendor/loaders/GLTFLoader.js';

export function demoMesh() {
  const geometry = new THREE.TorusKnotGeometry(1, .25, 108, 7, 2, 3);
  const object = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial());
  object.rotation.z = -.24;
  const group = new THREE.Group(); group.add(object);
  group.userData.info = {vertices:geometry.attributes.position.count, faces:geometry.index.count/3};
  return group;
}

export function cloneModel(source) {
  const clone = source.clone(true);
  clone.traverse(o => {
    if(o.geometry) o.geometry = o.geometry.clone();
    if(o.material) o.material = Array.isArray(o.material) ? o.material.map(m=>m.clone()) : o.material.clone();
  });
  return clone;
}

export function modelInfo(model) {
  if(model.userData.info) return model.userData.info;
  let vertices=0,faces=0;
  model.traverse(o=>{
    if(o.isMesh){vertices+=o.geometry.attributes.position?.count||0;faces+=(o.geometry.index?.count||o.geometry.attributes.position?.count||0)/3;}
    if(o.isPoints)vertices+=o.geometry.attributes.position?.count||0;
  });
  return {vertices,faces};
}

export function disposeModel(root) {
  const geometries=new Set(),materials=new Set();
  root?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
}

export async function loadModel(url,up='Y') {
  const response=await fetch(url);if(!response.ok)throw new Error('The mesh file could not be loaded.');
  const bytes=await response.arrayBuffer();
  const ext=new URL(url,location.href).pathname.split('.').pop().toLowerCase();
  let object;
  if(ext==='obj'){
    const text=new TextDecoder().decode(bytes).replace(/^\uFEFF/,'');
    object=new OBJLoader().parse(text);
    object.userData.info={vertices:(text.match(/^v\s/gm)||[]).length,faces:(text.match(/^f\s/gm)||[]).length};
  }else if(ext==='ply'){
    const geometry=new PLYLoader().parse(bytes);
    object=geometry.index?new THREE.Mesh(geometry,new THREE.MeshPhongMaterial()):new THREE.Points(geometry,new THREE.PointsMaterial());
    object.userData.info={vertices:geometry.attributes.position.count,faces:(geometry.index?.count||0)/3};
  }else if(ext==='glb'){
    object=(await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes,'',resolve,reject))).scene;
  }else throw new Error('Use an OBJ, PLY or GLB mesh.');
  if(up==='Z')object.rotation.x-=Math.PI/2;
  const box=new THREE.Box3().setFromObject(object);
  if(box.isEmpty()||!Number.isFinite(box.min.length()+box.max.length())){disposeModel(object);throw new Error('The file contains no finite mesh geometry.');}
  return object;
}

export class MeshViewer {
  constructor(element,{color=0xbaa490,edge=0x877568,animated=false,linked=false}={}) {
    this.element=element;this.color=color;this.edge=edge;this.mode='hybrid';this.visible=true;this.dirty=true;this.animated=animated;this.model=null;this.onChange=null;this.interacting=false;this.onInteractionStart=null;this.onInteractionEnd=null;
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));
    this.renderer.setClearColor(0x000000,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.NoToneMapping;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.canvas=this.renderer.domElement;this.canvas.setAttribute('aria-label','Interactive 3D mesh. Left drag to rotate, right drag to pan, and scroll to zoom.');
    this.canvas.tabIndex=0;element.append(this.canvas);
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(34,1,.001,1000);
    this.camera.position.set(3,1.7,-5);
    this.controls=new OrbitControls(this.camera,this.canvas);
    this.controls.enableDamping=!linked;this.controls.dampingFactor=.09;this.controls.autoRotate=animated;this.controls.autoRotateSpeed=.6;
    this.controls.enablePan=true;this.controls.enableRotate=true;this.controls.enableZoom=true;this.controls.screenSpacePanning=true;
    this.controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
    this.controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
    this.controls.addEventListener('start',()=>{this.interacting=true;this.onInteractionStart?.(this);});
    this.controls.addEventListener('end',()=>{this.interacting=false;this.onInteractionEnd?.(this);});
    this.canvas.addEventListener('contextmenu',event=>event.preventDefault());
    this.controls.addEventListener('change',()=>{this.dirty=true;this.onChange?.(this);});
    this.scene.add(new THREE.AmbientLight(0xffffff,1.25));
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xe6dfd1,1.4));
    this.key=new THREE.DirectionalLight(0xfff8ed,2.2);this.key.position.set(-4,7,-5);this.key.castShadow=true;
    this.key.shadow.mapSize.set(1024,1024);this.key.shadow.bias=-.0004;this.key.shadow.normalBias=.015;
    this.scene.add(this.key);this.scene.add(this.key.target);
    this.floor=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShadowMaterial({opacity:.09}));this.floor.rotation.x=-Math.PI/2;this.floor.receiveShadow=true;this.scene.add(this.floor);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(element);
    this.intersectionObserver=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.dirty=true;this.onVisibilityChange?.(this.visible);},{rootMargin:'120px'});this.intersectionObserver.observe(element);
    this.resize();this.last=performance.now();
    const tick=now=>{this.raf=requestAnimationFrame(tick);const dt=Math.min((now-this.last)/1000,.05);this.last=now;
      if(document.hidden||!this.visible||!this.model)return;
      this.controls.update(dt);
      if(this.dirty||this.controls.autoRotate){this.renderer.render(this.scene,this.camera);this.dirty=false;}
    };this.raf=requestAnimationFrame(tick);
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.element.dispatchEvent(new CustomEvent('viewer-error',{detail:'The 3D viewer paused. Reload this page to restore it.'}));});
  }
  resize(){const w=this.element.clientWidth,h=this.element.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.dirty=true;if(this.box&&!this.interacting){this.frame(this.box,this.direction);}}
  setModel(model){
    if(this.model){this.scene.remove(this.model);disposeModel(this.model);}
    this.model=model;const targets=[];model.traverse(o=>{if(o.isMesh||o.isPoints)targets.push(o);});
    const bounds=new THREE.Box3().setFromObject(model);const radius=Math.max(bounds.getSize(new THREE.Vector3()).length()/2,1e-4);
    for(const o of targets){
      if(o.isPoints){o.material=new THREE.PointsMaterial({color:this.color,size:radius*.009,sizeAttenuation:true});continue;}
      if(!o.geometry.attributes.normal)o.geometry.computeVertexNormals();
      o.material=new THREE.MeshPhongMaterial({color:this.color,flatShading:true,side:THREE.DoubleSide,shininess:8,specular:0x222222,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2});
      // Cast onto the floor without shadow-map acne on the triangular surface.
      o.castShadow=true;o.receiveShadow=false;
      const wire=new THREE.LineSegments(new THREE.WireframeGeometry(o.geometry),new THREE.LineBasicMaterial({color:this.edge,transparent:true,opacity:.40,depthTest:true,depthWrite:false}));
      wire.userData.layer='wire';wire.renderOrder=2;o.add(wire);
      const pg=new THREE.BufferGeometry();pg.setAttribute('position',o.geometry.attributes.position);
      const points=new THREE.Points(pg,new THREE.PointsMaterial({color:this.edge,size:radius*.009,transparent:true,opacity:.82,depthWrite:false}));points.userData.layer='points';points.renderOrder=3;o.add(points);
    }
    this.scene.add(model);this.setMode(this.mode);this.frame(bounds);this.dirty=true;
  }
  frame(box,direction=[3,1.8,-5]){
    this.box=box.clone();this.direction=Array.isArray(direction)?direction:[3,1.8,-5];
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),radius=Math.max(size.length()/2,1e-4);
    const distance=radius/Math.sin(THREE.MathUtils.degToRad(this.camera.fov/2))*1.10*Math.max(1,1/this.camera.aspect);
    const offset=new THREE.Vector3(...this.direction).normalize().multiplyScalar(distance);
    this.camera.position.copy(center).add(offset);this.controls.target.copy(center);
    // Match depth precision to this mesh; retain room for the full zoom range.
    this.camera.near=Math.max(radius*.025,1e-6);this.camera.far=distance*16;this.camera.updateProjectionMatrix();
    this.controls.minDistance=radius*.35;this.controls.maxDistance=distance*12;
    this.floor.position.set(center.x,box.min.y-radius*.015,center.z);this.floor.scale.setScalar(radius*8);
    this.key.position.copy(center).add(new THREE.Vector3(-3,5,-4).multiplyScalar(radius));this.key.target.position.copy(center);
    const sc=this.key.shadow.camera;sc.left=sc.bottom=-radius*3;sc.right=sc.top=radius*3;sc.near=radius*.1;sc.far=radius*15;sc.updateProjectionMatrix();
    this.key.shadow.normalBias=radius*.008;this.controls.update();this.dirty=true;
  }
  setMode(mode){this.mode=mode;if(!this.model)return;this.model.traverse(o=>{if(o.isMesh)o.material.visible=mode==='hybrid';if(o.userData.layer==='wire')o.visible=mode!=='points';if(o.userData.layer==='points')o.visible=mode==='points';});this.dirty=true;}
  reset(){if(this.box)this.frame(this.box,this.direction);}
  setMotion(value){this.controls.autoRotate=value;this.dirty=true;}
  syncFrom(other){const auto=this.controls.autoRotate;this.controls.autoRotate=false;this.camera.position.copy(other.camera.position);this.camera.quaternion.copy(other.camera.quaternion);this.camera.zoom=other.camera.zoom;this.controls.target.copy(other.controls.target);this.camera.updateProjectionMatrix();this.controls.update();this.controls.autoRotate=auto;this.dirty=true;}
}

export {THREE};
