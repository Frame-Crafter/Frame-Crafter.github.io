// Interactive 3D camera-rig viewer (three.js). Cameras are given as 3x4 row-major
// camera-to-world matrices in OpenGL convention (x right, y up, looking down -z),
// already normalized to roughly unit extent.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BLUE = 0x3b82f6, ORANGE = 0xf97316;

function mat(c) {
  const m = new THREE.Matrix4();
  m.set(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], 0, 0, 0, 1);
  return m;
}

export class Rig {
  constructor(container, opts = {}) {
    this.c = container;
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x08090b, 1);
    container.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.enableZoom = false; // keep the mouse wheel for page scrolling
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 9;
    this.interacted = false;
    this.controls.addEventListener('start', () => { this.interacted = true; });
    this.group = new THREE.Group();
    this.scene.add(this.group);
    const grid = new THREE.GridHelper(6, 24, 0x23262c, 0x16181c);
    grid.position.y = -1.25;
    this.scene.add(grid);
    this.loader = new THREE.TextureLoader();
    this.pickables = [];
    this.onPick = null;
    this.onFrame = null;
    this.visible = false;
    this.t0 = performance.now();

    new IntersectionObserver(es => { this.visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(container);
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();

    // click picking (ignore drags)
    const ray = new THREE.Raycaster();
    let down = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !this.onPick) return;
      const r = el.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, this.camera);
      const hit = ray.intersectObjects(this.pickables, false)[0];
      if (hit) this.onPick(hit.object.userData.idx);
    });
    el.addEventListener('pointermove', e => {
      if (!this.onPick || !this.pickables.length) return;
      const r = el.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, this.camera);
      el.style.cursor = ray.intersectObjects(this.pickables, false).length ? 'pointer' : 'grab';
    });

    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.visible) return;
      if (!this.interacted && this.home) {
        const t = (performance.now() - this.t0) / 1000;
        const a = this.home.az + 0.38 * Math.sin(t * 0.32);
        const { r, el: elv, target } = this.home;
        this.camera.position.set(target.x + r * Math.cos(elv) * Math.sin(a), target.y + r * Math.sin(elv), target.z + r * Math.cos(elv) * Math.cos(a));
        this.camera.lookAt(target);
        this.controls.target.copy(target);
      } else {
        this.controls.update();
      }
      if (this.onFrame) this.onFrame();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  resize() {
    const w = this.c.clientWidth || 300, h = this.c.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clear() {
    this.pickables = [];
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    this.group.clear();
  }

  frustum(c2w, { fovx = 60, fovy = 40, size = 0.18, color = BLUE, tex = null, opacity = 0.95, idx = null } = {}) {
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.matrix.copy(mat(c2w));
    const hx = size * Math.tan((fovx * Math.PI) / 360), hy = size * Math.tan((fovy * Math.PI) / 360), z = -size;
    const P = [[0, 0, 0], [-hx, -hy, z], [hx, -hy, z], [hx, hy, z], [-hx, hy, z]];
    const E = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1]];
    const pos = [];
    E.forEach(([a, b]) => pos.push(...P[a], ...P[b]));
    // little "up" marker
    pos.push(-hx * 0.35, hy * 1.08, z, 0, hy * 1.45, z, 0, hy * 1.45, z, hx * 0.35, hy * 1.08, z);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    g.add(lines);
    const pg = new THREE.PlaneGeometry(2 * hx, 2 * hy);
    const pm = new THREE.MeshBasicMaterial({ color: tex ? 0xffffff : color, transparent: true, opacity: tex ? opacity : 0.18, side: THREE.DoubleSide, depthWrite: false });
    if (tex) {
      this.loader.load(tex, t => { t.colorSpace = THREE.SRGBColorSpace; pm.map = t; pm.needsUpdate = true; });
    }
    const plane = new THREE.Mesh(pg, pm);
    plane.position.z = z;
    g.add(plane);
    if (idx !== null) { plane.userData.idx = idx; this.pickables.push(plane); }
    g.userData = { lines, plane, color, tex };
    this.group.add(g);
    return g;
  }

  setColor(f, color, planeOpacity) {
    f.userData.lines.material.color.setHex(color);
    if (!f.userData.tex) f.userData.plane.material.color.setHex(color); // keep textures untinted
    if (planeOpacity !== undefined) f.userData.plane.material.opacity = planeOpacity;
  }

  path(points, color = 0xf97316, opacity = 0.55) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.04, gapSize: 0.03 }));
    l.computeLineDistances();
    this.group.add(l);
    return l;
  }

  setMatrix(obj, c2w) { obj.matrix.copy(mat(c2w)); }

  // Place the viewer behind/above the mean camera so image planes read correctly.
  home_(centers, { dist = 3.0, elev = 0.42, az = 0 } = {}) {
    const box = new THREE.Box3();
    centers.forEach(c => box.expandByPoint(new THREE.Vector3(c[0], c[1], c[2])));
    const target = box.getCenter(new THREE.Vector3());
    let rad = 0;
    centers.forEach(c => { rad = Math.max(rad, target.distanceTo(new THREE.Vector3(c[0], c[1], c[2]))); });
    rad += this.margin || 0.25;
    const vf = this.camera.fov * Math.PI / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const r = rad / Math.sin(Math.min(vf, hf) / 2) * (dist / 3.0);
    this.home = { target, r, el: elev, az };
    this.interacted = false;
    this.t0 = performance.now();
    this.controls.target.copy(target);
  }
}

export const COLORS = { BLUE, ORANGE };
