import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Scissors } from 'lucide-react';
import type {
  BimCameraPreset,
  BimDiscipline,
  BimElement,
  BimRenderMode,
  BimSectionMode,
  Language,
} from '../../types/bunyan';

interface BimViewer3DProps {
  elements: BimElement[];
  selectedId: string | null;
  hiddenDisciplines: Set<BimDiscipline>;
  cameraPreset: BimCameraPreset;
  renderMode: BimRenderMode;
  sectionMode: BimSectionMode;
  sectionOffset: number;
  onSelectElement: (id: string | null) => void;
  onChangeCameraPreset: (p: BimCameraPreset) => void;
  onChangeRenderMode: (m: BimRenderMode) => void;
  onChangeSectionMode: (s: BimSectionMode) => void;
  onChangeSectionOffset: (val: number) => void;
  lang: Language;
}

const CATEGORY_COLORS: Record<string, number> = {
  foundation: 0x64748b,
  pedestal: 0x475569,
  tie_beam: 0x94a3b8,
  column: 0xcbd5e1,
  beam: 0x94a3b8,
  slab: 0x475569,
  wall: 0xe2d5be,
  door_window: 0x92400e,
  stair: 0xd4a853,
  glass: 0x38bdf8,
  mep_hvac: 0x0ea5e9,
  mep_plumbing: 0x10b981,
  mep_electrical: 0xeab308,
  site_grid: 0x1e293b,
};

const PRESET_VECTORS: Record<BimCameraPreset, [number, number, number]> = {
  iso: [22, 16, 22],
  top: [0.01, 30, 0.01],
  front: [0, 6, 26],
  back: [0, 6, -26],
  left: [-26, 6, 0],
  right: [26, 6, 0],
};

// Reusable math scratch objects at module scope (zero GC in render loop)
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3(0, 4, 0);

export const BimViewer3D: React.FC<BimViewer3DProps> = ({
  elements,
  selectedId,
  hiddenDisciplines,
  cameraPreset,
  renderMode,
  sectionMode,
  sectionOffset,
  onSelectElement,
  onChangeCameraPreset,
  onChangeRenderMode,
  onChangeSectionMode,
  onChangeSectionOffset,
  lang,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Refs to keep Three.js instance stable across React prop updates
  const callbacksRef = useRef({ onSelectElement });
  callbacksRef.current = { onSelectElement };

  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    bimGroup: THREE.Group;
    meshMap: Map<string, THREE.Mesh>;
    clipPlanes: { x: THREE.Plane; y: THREE.Plane; z: THREE.Plane; box: THREE.Plane[] };
    requestRender: () => void;
    transitionActive: boolean;
    targetPos: THREE.Vector3;
    isSoftwareGl: boolean;
  } | null>(null);

  // Initialize Three.js once on mount
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Software WebGL probe
    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'WebGL unavailable');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1324);
    scene.fog = new THREE.FogExp2(0x0b1324, 0.012);

    // 2. Mandatory Studio RoomEnvironment PMREM
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300);
    camera.position.set(...PRESET_VECTORS.iso);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.target.copy(_targetLookAt);
    controls.minDistance = 6;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    // 3. 3-Point Warm/Cool Architectural Studio Lighting
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.85);
    keyLight.position.set(18, 28, 16);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -22;
    keyLight.shadow.camera.right = 22;
    keyLight.shadow.camera.top = 22;
    keyLight.shadow.camera.bottom = -22;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.65);
    rimLight.position.set(-16, 12, -18);
    scene.add(rimLight);

    // Ground grid & subtle contact shadow plane
    const gridHelper = new THREE.GridHelper(44, 44, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.11;
    scene.add(gridHelper);

    const bimGroup = new THREE.Group();
    scene.add(bimGroup);

    const clipPlanes = {
      x: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100),
      y: new THREE.Plane(new THREE.Vector3(0, -1, 0), 100),
      z: new THREE.Plane(new THREE.Vector3(0, 0, -1), 100),
      box: [
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), 12),
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 12),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), 10),
      ],
    };

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        renderDirty = false;
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        const st = sceneRef.current;
        let keepAnimating = false;
        if (st && st.transitionActive) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, st.targetPos.x, 7, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, st.targetPos.y, 7, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, st.targetPos.z, 7, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLookAt.x, 7, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLookAt.y, 7, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLookAt.z, 7, dt);

          if (camera.position.distanceTo(st.targetPos) < 0.05) {
            camera.position.copy(st.targetPos);
            st.transitionActive = false;
          } else {
            keepAnimating = true;
          }
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || keepAnimating) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const meshMap = new Map<string, THREE.Mesh>();
    sceneRef.current = {
      renderer,
      scene,
      camera,
      controls,
      bimGroup,
      meshMap,
      clipPlanes,
      requestRender,
      transitionActive: false,
      targetPos: new THREE.Vector3(...PRESET_VECTORS.iso),
      isSoftwareGl,
    };

    // Cancel camera transition when user interacts manually
    controls.addEventListener('start', () => {
      if (sceneRef.current) sceneRef.current.transitionActive = false;
    });
    controls.addEventListener('change', requestRender);

    // Raycasting on pointer click (distinguishing click vs orbit drag)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(bimGroup.children, false);
      const visibleHit = hits.find((h) => h.object.visible);
      if (visibleHit && visibleHit.object.userData.bimId) {
        callbacksRef.current.onSelectElement(String(visibleHit.object.userData.bimId));
      } else {
        callbacksRef.current.onSelectElement(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost');
    };
    const onContextRestored = () => {
      setWebglError(null);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      bimGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Sync BIM Elements Geometry & Materials
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;

    while (st.bimGroup.children.length > 0) {
      const child = st.bimGroup.children[0];
      st.bimGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
    st.meshMap.clear();

    const activeClipPlanes =
      sectionMode === 'x'
        ? [st.clipPlanes.x]
        : sectionMode === 'y'
        ? [st.clipPlanes.y]
        : sectionMode === 'z'
        ? [st.clipPlanes.z]
        : sectionMode === 'box'
        ? st.clipPlanes.box
        : [];

    st.clipPlanes.x.constant = sectionOffset;
    st.clipPlanes.y.constant = sectionOffset;
    st.clipPlanes.z.constant = sectionOffset;

    for (const el of elements) {
      const geo = new THREE.BoxGeometry(el.dimensions[0], el.dimensions[1], el.dimensions[2]);
      const baseColor = CATEGORY_COLORS[el.category] ?? 0x94a3b8;
      const isGlass = el.category === 'glass';
      const isSelected = el.id === selectedId;

      const mat = new THREE.MeshPhysicalMaterial({
        color: isSelected ? 0xd4a853 : baseColor,
        roughness: isGlass ? 0.1 : el.discipline === 'mep' ? 0.3 : 0.65,
        metalness: el.discipline === 'mep' ? 0.55 : isGlass ? 0.1 : 0.15,
        wireframe: renderMode === 'wireframe',
        transparent: isGlass || renderMode === 'xray' || renderMode === 'transparent',
        opacity:
          renderMode === 'xray'
            ? 0.25
            : renderMode === 'transparent'
            ? 0.5
            : isGlass
            ? st.isSoftwareGl
              ? 0.38
              : 0.45
            : 1.0,
        transmission: isGlass && !st.isSoftwareGl && renderMode === 'pbr' ? 0.65 : 0,
        emissive: isSelected ? new THREE.Color(0x9e7330) : new THREE.Color(0x000000),
        emissiveIntensity: isSelected ? 0.45 : 0,
        clippingPlanes: activeClipPlanes,
        clipShadows: true,
        side: activeClipPlanes.length > 0 ? THREE.DoubleSide : THREE.FrontSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(el.position[0], el.position[1], el.position[2]);
      if (el.rotation) {
        mesh.rotation.set(el.rotation[0], el.rotation[1], el.rotation[2]);
      }
      mesh.visible = !hiddenDisciplines.has(el.discipline);
      mesh.castShadow = !isGlass && el.category !== 'site_grid';
      mesh.receiveShadow = true;
      mesh.userData.bimId = el.id;

      st.bimGroup.add(mesh);
      st.meshMap.set(el.id, mesh);
    }

    st.requestRender();
  }, [elements, selectedId, hiddenDisciplines, renderMode, sectionMode, sectionOffset]);

  // Trigger smooth camera preset transition
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;
    const vec = PRESET_VECTORS[cameraPreset];
    _targetCamPos.set(vec[0], vec[1], vec[2]);
    st.targetPos.copy(_targetCamPos);
    st.transitionActive = true;
    st.requestRender();
  }, [cameraPreset]);

  return (
    <div className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-[#0B1324] h-[520px] overflow-hidden">
      {/* Isolated WebGL mount div */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0B1324] text-slate-300 text-xs p-6 text-center">
          <div>
            <p className="font-semibold text-amber-400 mb-1">WebGL Viewport Notice</p>
            <p>{webglError}</p>
          </div>
        </div>
      )}

      {/* Minimal Top-Left Spec Label (No backdrop-blur over WebGL) */}
      <div className="absolute top-3 start-3 px-3 py-1.5 rounded-lg bg-[#0F172A]/90 border border-slate-700/80 text-[11px] font-mono text-slate-200 pointer-events-none">
        5D BIM · {elements.length} {lang === 'ar' ? 'عنصر' : 'Elements'} · {renderMode.toUpperCase()}
      </div>

      {/* Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[94%] max-w-[780px] z-10 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed(!dockCollapsed)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-[#0F172A] border border-b-0 border-slate-700 text-[11px] font-medium text-slate-300 hover:text-white"
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? (lang === 'ar' ? 'إظهار الأدوات' : 'Show Controls') : (lang === 'ar' ? 'طي الأدوات' : 'Hide Controls')}</span>
        </button>

        {!dockCollapsed && (
          <div className="w-full rounded-xl bg-[#0F172A]/95 border border-slate-700 p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            {/* Camera Presets */}
            <div className="flex items-center gap-1">
              {(['iso', 'top', 'front', 'back', 'left', 'right'] as BimCameraPreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onChangeCameraPreset(p)}
                  className={`px-2 py-1 rounded font-mono uppercase transition-colors ${
                    cameraPreset === p
                      ? 'bg-[#B4863C] text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Render Modes */}
            <div className="flex items-center gap-1 border-s border-slate-700 ps-2">
              {(['pbr', 'wireframe', 'xray', 'transparent'] as BimRenderMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChangeRenderMode(m)}
                  className={`px-2 py-1 rounded font-mono uppercase transition-colors ${
                    renderMode === m
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Section Plane Controls */}
            <div className="flex items-center gap-1.5 border-s border-slate-700 ps-2">
              <Scissors className="w-3.5 h-3.5 text-[#D4A853]" />
              {(['none', 'x', 'y', 'z', 'box'] as BimSectionMode[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChangeSectionMode(s)}
                  className={`px-1.5 py-1 rounded font-mono uppercase ${
                    sectionMode === s
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {s}
                </button>
              ))}
              {sectionMode !== 'none' && sectionMode !== 'box' && (
                <input
                  type="range"
                  min={-10}
                  max={14}
                  step={0.5}
                  value={sectionOffset}
                  onChange={(e) => onChangeSectionOffset(Number(e.target.value))}
                  className="w-20 accent-[#B4863C]"
                  aria-label="Section offset"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
