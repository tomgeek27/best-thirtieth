import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Maximize2, Minimize2 } from 'lucide-react';

const RADIUS = 1;

function coordinates(latitude, longitude, radius = RADIUS) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(radius * Math.cos(lat) * Math.sin(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.cos(lon));
}

function createMapTexture(geojson) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  const land = new Path2D();
  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) continue;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        ring.forEach(([longitude, latitude], index) => {
          const x = (longitude + 180) * canvas.width / 360;
          const y = (90 - latitude) * canvas.height / 180;
          if (index === 0) land.moveTo(x, y); else land.lineTo(x, y);
        });
        land.closePath();
      }
    }
  }
  context.fillStyle = '#073b85';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#1263bd';
  context.fill(land, 'evenodd');
  context.save();
  context.clip(land, 'evenodd');
  context.strokeStyle = 'rgba(217, 240, 255, 0.7)';
  context.lineWidth = 1.15;
  context.beginPath();
  for (let x = 0; x <= canvas.width; x += 8) { context.moveTo(x, 0); context.lineTo(x, canvas.height); }
  for (let y = 0; y <= canvas.height; y += 8) { context.moveTo(0, y); context.lineTo(canvas.width, y); }
  context.stroke();
  context.restore();
  context.strokeStyle = '#d7efff';
  context.lineWidth = 1.5;
  context.stroke(land);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.offset.x = 0.25;
  return texture;
}

function PinAvatar({ user }) {
  const [failed, setFailed] = useState(false);
  const initials = user.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  return <span className="pin-face" title={user.name}>{failed ? initials : <img src={user.avatarUrl} alt={user.name} onError={() => setFailed(true)} />}</span>;
}

export default function GlobeMap({ destinations }) {
  const containerRef = useRef(null);
  const pinsRef = useRef(new Map());
  const destinationsRef = useRef(destinations);
  const groupRef = useRef(null);
  const [unavailable, setUnavailable] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  destinationsRef.current = destinations;

  useEffect(() => {
    function syncFullscreen() {
      setFullscreen(Boolean(containerRef.current && document.fullscreenElement === containerRef.current));
    }
    function exitFallback(event) {
      if (event.key === 'Escape' && !document.fullscreenElement) setFullscreen(false);
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('keydown', exitFallback);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('keydown', exitFallback);
    };
  }, []);

  async function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement === container) {
      await document.exitFullscreen();
      return;
    }
    if (fullscreen && !document.fullscreenElement) {
      setFullscreen(false);
      return;
    }
    if (container.requestFullscreen) {
      try { await container.requestFullscreen(); }
      catch { setFullscreen(true); }
    } else {
      setFullscreen(true);
    }
  }

  useEffect(() => {
    const container = containerRef.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' }); }
    catch { setUnavailable(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    container.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
    camera.position.set(0, 0, 3.8);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.4;
    controls.maxDistance = 6;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;

    const group = new THREE.Group();
    group.rotation.set(THREE.MathUtils.degToRad(20), -THREE.MathUtils.degToRad(15), 0);
    groupRef.current = group;
    scene.add(group);
    const surfaceGeometry = new THREE.SphereGeometry(RADIUS, 64, 40);
    const surfaceMaterial = new THREE.MeshBasicMaterial({ color: 0x073b85 });
    group.add(new THREE.Mesh(surfaceGeometry, surfaceMaterial));
    let mapTexture;
    let disposed = false;
    fetch('/countries.geojson')
      .then(response => { if (!response.ok) throw new Error('Dati geografici non disponibili'); return response.json(); })
      .then(data => {
        if (disposed) return;
        mapTexture = createMapTexture(data);
        surfaceMaterial.color.set(0xffffff);
        surfaceMaterial.map = mapTexture;
        surfaceMaterial.needsUpdate = true;
      })
      .catch(() => { });
    const lines = [];
    function segment(start, end) { lines.push(start.x, start.y, start.z, end.x, end.y, end.z); }
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      for (let longitude = -180; longitude < 180; longitude += 7.5) {
        segment(coordinates(latitude, longitude, 1.004), coordinates(latitude, longitude + 7.5, 1.004));
      }
    }
    for (let longitude = 0; longitude < 180; longitude += 15) {
      for (let latitude = -90; latitude < 90; latitude += 7.5) {
        segment(coordinates(latitude, longitude, 1.004), coordinates(latitude + 7.5, longitude, 1.004));
        segment(coordinates(latitude, longitude - 180, 1.004), coordinates(latitude + 7.5, longitude - 180, 1.004));
      }
    }
    const sphereGeometry = new THREE.BufferGeometry();
    sphereGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const sphereMaterial = new THREE.LineBasicMaterial({ color: 0xb5e4ff, transparent: true, opacity: 0.55, depthWrite: false });
    group.add(new THREE.LineSegments(sphereGeometry, sphereMaterial));

    let width = 1; let height = 1; let frame;
    function resize(rect) {
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.fov = width < height
        ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(38) / 2) / camera.aspect))
        : 38;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    resize(container.getBoundingClientRect());
    const observer = new ResizeObserver(entries => resize(entries[0].contentRect));
    observer.observe(container);
    const world = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const view = new THREE.Vector3();
    const projected = new THREE.Vector3();
    function render() {
      controls.update();
      group.updateMatrixWorld();
      for (const destination of destinationsRef.current) {
        const pin = pinsRef.current.get(destination.key);
        if (!pin) continue;
        world.copy(coordinates(destination.latitude, destination.longitude, RADIUS * 1.025)).applyMatrix4(group.matrixWorld);
        normal.copy(world).normalize();
        view.copy(camera.position).sub(world);
        const visible = normal.dot(view) > 0;
        pin.style.visibility = visible ? 'visible' : 'hidden';
        if (visible) {
          projected.copy(world).project(camera);
          pin.style.transform = `translate(${(projected.x + 1) * width / 2}px, ${(1 - projected.y) * height / 2}px) translate(-50%, -100%)`;
        }
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    }
    render();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposed = true;
      mapTexture?.dispose(); surfaceGeometry.dispose(); surfaceMaterial.dispose(); sphereGeometry.dispose(); sphereMaterial.dispose();
      renderer.dispose(); renderer.domElement.remove();
      groupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const latest = destinations.at(-1);
    if (latest && groupRef.current) groupRef.current.rotation.set(THREE.MathUtils.degToRad(latest.latitude), -THREE.MathUtils.degToRad(latest.longitude), 0);
  }, [destinations.length]);

  return <div ref={containerRef} className={`globe-canvas${fullscreen ? ' is-fullscreen' : ''}`} aria-label="Mappamondo interattivo">
    <button className="globe-fullscreen-button" type="button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Esci da schermo intero' : 'Mappamondo a schermo intero'} title={fullscreen ? 'Esci da schermo intero' : 'Mappamondo a schermo intero'}>
      {fullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
    </button>
    {unavailable && <p className="globe-unavailable">Il tuo browser non supporta il globo 3D.</p>}
    {destinations.map(destination => <div key={destination.key} className="globe-pin" ref={element => { if (element) pinsRef.current.set(destination.key, element); else pinsRef.current.delete(destination.key); }}>
      <div className="pin-faces">{destination.proposers.map(user => <PinAvatar key={user.id} user={user} />)}</div>
      <span className="pin-label">{destination.city}</span>
    </div>)}
  </div>;
}