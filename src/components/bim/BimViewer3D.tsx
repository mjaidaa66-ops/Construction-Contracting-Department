import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, RotateCcw, Scissors } from 'lucide-react';
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

const PRESET_DIRECTIONS: Record<BimCameraPreset, [number, number, number]> = {
  iso: [0.68, 0.52, 0.68],
  top: [0.001, 1.0, 0.001],
  front: [0, 0.22, 1.0],
  back: [0, 0.22, -1.0],
  left: [-1.0, 0.22, 0],
  right: [1.0, 0.22, 0],
};

// Reusable math scratch objects at module scope (zero GC in render loop)
const _scratchBox = new THREE.Box3();
const _scratchCenter = new THREE.Vector3();
const _scratchSize = new THREE.Vector3();

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
  const [viewportKey, setViewportKey] = useState(0);
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const syncTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Refs to keep Three.js instance stable across React prop updates
  const callbacksRef = useRef({ onSelectElement });
  callbacksRef.current = { onSelectElement };

  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  const hiddenDisciplinesRef = useRef<Set<BimDiscipline>>(hiddenDisciplines);
  hiddenDisciplinesRef.current = hiddenDisciplines;

  const cameraPresetRef = useRef<BimCameraPreset>(cameraPreset);
  cameraPresetRef.current = cameraPreset;

  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    hemi: THREE.HemisphereLight;
    rimLight: THREE.DirectionalLight;
    gridHelper: THREE.GridHelper;
    bimGroup: THREE.Group;
    meshMap: Map<string, THREE.Mesh>;
    clipPlanes: { x: THREE.Plane; y: THREE.Plane; z: THREE.Plane; box: THREE.Plane[] };
    requestRender: () => void;
    transitionActive: boolean;
    targetPos: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    modelCenter: THREE.Vector3;
    modelRadius: number;
    isSoftwareGl: boolean;
  } | null>(null);

  // Initialize Three.js once per viewportKey
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

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

    const initialDark =
      typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true;
    const initialBg = initialDark ? 0x090e1a : 0xeaf0f8;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initialBg);
    scene.fog = new THREE.FogExp2(initialBg, 0.008);

    const buildEnvironment = () => {
      scene.environment?.dispose();
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
      roomEnv.dispose();
      pmremGenerator.dispose();
    };
    buildEnvironment();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 600);
    camera.position.set(22, 16, 22);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 4, 0);
    controls.minDistance = 2;
    controls.maxDistance = 140;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    const hemi = new THREE.HemisphereLight(
      initialDark ? 0xdbeafe : 0xf8fafc,
      initialDark ? 0x0f172a : 0x94a3b8,
      initialDark ? 0.9 : 1.05
    );
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.85);
    keyLight.position.set(18, 28, 16);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -28;
    keyLight.shadow.camera.right = 28;
    keyLight.shadow.camera.top = 28;
    keyLight.shadow.camera.bottom = -28;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      initialDark ? 0x38bdf8 : 0x2563eb,
      initialDark ? 0.7 : 0.52
    );
    rimLight.position.set(-16, 12, -18);
    scene.add(rimLight);

    let gridHelper = new THREE.GridHelper(
      64,
      64,
      initialDark ? 0x38bdf8 : 0x2563eb,
      initialDark ? 0x162945 : 0xcbd5e1
    );
    gridHelper.position.y = -0.11;
    if (Array.isArray(gridHelper.material)) {
      gridHelper.material.forEach((m) => {
        m.transparent = true;
        m.opacity = initialDark ? 0.35 : 0.42;
      });
    } else {
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = initialDark ? 0.35 : 0.42;
    }
    scene.add(gridHelper);

    const bimGroup = new THREE.Group();
    scene.add(bimGroup);

    const clipPlanes = {
      x: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100),
      y: new THREE.Plane(new THREE.Vector3(0, -1, 0), 100),
      z: new THREE.Plane(new THREE.Vector3(0, 0, -1), 100),
      box: [
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), 16),
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 16),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), 14),
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
          controls.target.x = THREE.MathUtils.damp(controls.target.x, st.targetLookAt.x, 7, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, st.targetLookAt.y, 7, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, st.targetLookAt.z, 7, dt);

          if (
            camera.position.distanceTo(st.targetPos) < 0.05 &&
            controls.target.distanceTo(st.targetLookAt) < 0.05
          ) {
            camera.position.copy(st.targetPos);
            controls.target.copy(st.targetLookAt);
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
      hemi,
      rimLight,
      gridHelper,
      bimGroup,
      meshMap,
      clipPlanes,
      requestRender,
      transitionActive: false,
      targetPos: new THREE.Vector3(22, 16, 22),
      targetLookAt: new THREE.Vector3(0, 4, 0),
      modelCenter: new THREE.Vector3(0, 4, 0),
      modelRadius: 18,
      isSoftwareGl,
    };

    controls.addEventListener('start', () => {
      if (sceneRef.current) sceneRef.current.transitionActive = false;
    });
    controls.addEventListener('change', requestRender);

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
      buildEnvironment();
      bimGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            m.needsUpdate = true;
          });
        }
      });
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
      scene.remove(sceneRef.current?.gridHelper ?? gridHelper);
      (sceneRef.current?.gridHelper ?? gridHelper).dispose();
      scene.environment?.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [viewportKey]);

  // 0. Sync Three.js Scene Lighting, Background & Grid when switching Light <-> Dark Mode
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;

    const bgHex = isDark ? 0x090e1a : 0xeaf0f8;
    st.scene.background = new THREE.Color(bgHex);
    st.scene.fog = new THREE.FogExp2(bgHex, 0.008);
    st.hemi.color.setHex(isDark ? 0xdbeafe : 0xf8fafc);
    st.hemi.groundColor.setHex(isDark ? 0x0f172a : 0x94a3b8);
    st.hemi.intensity = isDark ? 0.9 : 1.05;
    st.rimLight.color.setHex(isDark ? 0x38bdf8 : 0x2563eb);
    st.rimLight.intensity = isDark ? 0.7 : 0.52;

    st.scene.remove(st.gridHelper);
    st.gridHelper.dispose();
    const nextGrid = new THREE.GridHelper(
      64,
      64,
      isDark ? 0x38bdf8 : 0x2563eb,
      isDark ? 0x162945 : 0xcbd5e1
    );
    nextGrid.position.y = -0.11;
    if (Array.isArray(nextGrid.material)) {
      nextGrid.material.forEach((m) => {
        m.transparent = true;
        m.opacity = isDark ? 0.35 : 0.42;
      });
    } else {
      nextGrid.material.transparent = true;
      nextGrid.material.opacity = isDark ? 0.35 : 0.42;
    }
    st.scene.add(nextGrid);
    st.gridHelper = nextGrid;
    st.requestRender();
  }, [isDark, viewportKey]);

  // 1. Rebuild Geometry ONLY when elements, renderMode, or section planes change (NOT on selection click)
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

    const curSelected = selectedIdRef.current;
    const curHidden = hiddenDisciplinesRef.current;

    for (const el of elements) {
      const w = Math.max(0.04, el.dimensions[0]);
      const h = Math.max(0.04, el.dimensions[1]);
      const d = Math.max(0.04, el.dimensions[2]);
      const geo = new THREE.BoxGeometry(w, h, d);
      const baseColor = CATEGORY_COLORS[el.category] ?? 0x94a3b8;
      const isGlass = el.category === 'glass';
      const isSelected = el.id === curSelected;

      const mat = new THREE.MeshPhysicalMaterial({
        color: isSelected ? 0x38bdf8 : baseColor,
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
        emissive: isSelected ? new THREE.Color(0x0284c7) : new THREE.Color(0x000000),
        emissiveIntensity: isSelected ? 0.48 : 0,
        clippingPlanes: activeClipPlanes,
        clipShadows: true,
        side: activeClipPlanes.length > 0 ? THREE.DoubleSide : THREE.FrontSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(el.position[0], el.position[1], el.position[2]);
      if (el.rotation) {
        mesh.rotation.set(el.rotation[0], el.rotation[1], el.rotation[2]);
      }
      mesh.visible = !curHidden.has(el.discipline);
      mesh.castShadow = !isGlass && el.category !== 'site_grid';
      mesh.receiveShadow = true;
      mesh.userData.bimId = el.id;
      mesh.userData.baseColor = baseColor;
      mesh.userData.discipline = el.discipline;

      st.bimGroup.add(mesh);
      st.meshMap.set(el.id, mesh);
    }

    // Auto-compute model bounds so imported IFC/DXF models of any scale fit cleanly in frame
    if (st.bimGroup.children.length > 0) {
      _scratchBox.setFromObject(st.bimGroup);
      if (!_scratchBox.isEmpty()) {
        _scratchBox.getCenter(_scratchCenter);
        _scratchBox.getSize(_scratchSize);
        const radius = Math.max(8, _scratchSize.length() * 0.72);
        st.modelCenter.copy(_scratchCenter);
        st.modelRadius = radius;
        st.controls.maxDistance = Math.max(140, radius * 6);
        const dir = PRESET_DIRECTIONS[cameraPresetRef.current];
        const dist = radius * 1.45;
        st.targetLookAt.copy(_scratchCenter);
        st.targetPos.set(
          _scratchCenter.x + dir[0] * dist,
          _scratchCenter.y + dir[1] * dist,
          _scratchCenter.z + dir[2] * dist
        );
        st.transitionActive = true;
      }
    }

    st.requestRender();
  }, [elements, renderMode, sectionMode, sectionOffset, viewportKey]);

  // 2. Lightweight Visibility Toggle (zero GPU buffer rebuild)
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;
    st.meshMap.forEach((mesh) => {
      const disc = mesh.userData.discipline as BimDiscipline;
      mesh.visible = !hiddenDisciplines.has(disc);
    });
    st.requestRender();
  }, [hiddenDisciplines, viewportKey]);

  // 3. Lightweight Selection Material Update (zero GPU buffer rebuild)
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;
    st.meshMap.forEach((mesh, id) => {
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      const baseColor = (mesh.userData.baseColor as number) ?? 0x94a3b8;
      const isSelected = id === selectedId;
      mat.color.setHex(isSelected ? 0x38bdf8 : baseColor);
      mat.emissive.setHex(isSelected ? 0x0284c7 : 0x000000);
      mat.emissiveIntensity = isSelected ? 0.48 : 0;
    });
    st.requestRender();
  }, [selectedId, viewportKey]);

  // 4. Trigger smooth camera preset transition relative to model bounds
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;
    const dir = PRESET_DIRECTIONS[cameraPreset];
    const dist = Math.max(16, st.modelRadius * 1.45);
    st.targetLookAt.copy(st.modelCenter);
    st.targetPos.set(
      st.modelCenter.x + dir[0] * dist,
      st.modelCenter.y + dir[1] * dist,
      st.modelCenter.z + dir[2] * dist
    );
    st.transitionActive = true;
    st.requestRender();
  }, [cameraPreset, viewportKey]);

  return (
    <div className="relative rounded-2xl border border-[var(--border-strong)] bg-[#EAF0F8] dark:bg-[#090E1A] h-[600px] overflow-hidden shadow-[var(--spatial-card-shadow)]">
      {/* Isolated WebGL mount div */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#EAF0F8] dark:bg-[#090E1A] text-[var(--text-secondary)] text-xs p-6 text-center">
          <div className="space-y-2">
            <p className="font-semibold text-amber-600 dark:text-amber-400">WebGL Viewport Notice</p>
            <p>{webglError}</p>
            <button
              type="button"
              onClick={() => {
                setWebglError(null);
                setViewportKey((k) => k + 1);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2563EB] dark:bg-[#38BDF8] text-white dark:text-[#090E1A] font-bold hover:brightness-110"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'إعادة تشغيل WebGL' : 'Reinitialize 3D Viewport'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Minimal Top-Left Spec Label (No backdrop-blur over WebGL) */}
      <div className="absolute top-3 start-3 px-3 py-1.5 rounded-xl bg-white/95 dark:bg-[#0D1424]/95 border border-[var(--border-strong)] text-[11px] font-mono text-[#2563EB] dark:text-[#38BDF8] pointer-events-none shadow-sm">
        5D BIM · {elements.length} {lang === 'ar' ? 'عنصر' : 'Elements'} · {renderMode.toUpperCase()}
      </div>

      {/* Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[94%] max-w-[780px] z-10 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed(!dockCollapsed)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-t-xl bg-white/95 dark:bg-[#0D1424]/95 border border-b-0 border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[#2563EB] dark:hover:text-[#38BDF8] cursor-pointer"
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? (lang === 'ar' ? 'إظهار الأدوات' : 'Show Controls') : (lang === 'ar' ? 'طي الأدوات' : 'Hide Controls')}</span>
        </button>

        {!dockCollapsed && (
          <div className="w-full rounded-2xl bg-white/95 dark:bg-[#0D1424]/95 border border-[var(--border-strong)] p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] shadow-md">
            {/* Camera Presets */}
            <div className="flex items-center gap-1">
              {(['iso', 'top', 'front', 'back', 'left', 'right'] as BimCameraPreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onChangeCameraPreset(p)}
                  className={`px-2 py-1 rounded-lg font-mono uppercase transition-colors cursor-pointer ${
                    cameraPreset === p
                      ? 'bg-[#2563EB] dark:bg-[#38BDF8] text-white dark:text-[#090E1A] font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Render Modes */}
            <div className="flex items-center gap-1 border-s border-[var(--border-hairline)] ps-2">
              {(['pbr', 'wireframe', 'xray', 'transparent'] as BimRenderMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChangeRenderMode(m)}
                  className={`px-2 py-1 rounded-lg font-mono uppercase transition-colors cursor-pointer ${
                    renderMode === m
                      ? 'bg-[#2563EB]/12 dark:bg-[#38BDF8]/20 text-[#2563EB] dark:text-[#38BDF8] border border-[#2563EB]/35 dark:border-[#38BDF8]/50 font-semibold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Section Plane Controls */}
            <div className="flex items-center gap-1.5 border-s border-[var(--border-hairline)] ps-2">
              <Scissors className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
              {(['none', 'x', 'y', 'z', 'box'] as BimSectionMode[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChangeSectionMode(s)}
                  className={`px-1.5 py-1 rounded-lg font-mono uppercase cursor-pointer ${
                    sectionMode === s
                      ? 'bg-[var(--accent-gold)] text-white dark:text-[#090E1A] font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
                  }`}
                >
                  {s}
                </button>
              ))}
              {sectionMode !== 'none' && sectionMode !== 'box' && (
                <input
                  type="range"
                  min={-15}
                  max={25}
                  step={0.5}
                  value={sectionOffset}
                  onChange={(e) => onChangeSectionOffset(Number(e.target.value))}
                  className="w-20 accent-[#2563EB] dark:accent-[#38BDF8]"
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
