import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Layers,
  Link2,
  RotateCcw,
  Scissors,
} from 'lucide-react';
import type {
  BimCameraPreset,
  BimDiscipline,
  BimElement,
  BimLevel,
  BimRenderMode,
  BimSectionMode,
  GisPlotData,
  Language,
} from '../../types/bunyan';
import { formatAED } from '../../utils/i18n';
import { computePlotGeometryCentered } from '../../utils/gisTakeoffGenerator';

export interface Bim3DViewportProps {
  elements: BimElement[];
  selectedId: string | null;
  highlightedElementIds?: string[];
  onSelectElement: (id: string | null) => void;
  onJumpToTakeoff?: (measurementId: string) => void;
  gisData?: GisPlotData;
  projectCode?: string;
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

const BIM_LEVELS: Array<{ id: BimLevel | 'all'; ar: string; en: string }> = [
  { id: 'all', ar: 'جميع الطوابق', en: 'All Levels' },
  { id: 'foundation', ar: 'الأساسات', en: 'Foundation' },
  { id: 'ground', ar: 'الأرضي', en: 'Ground' },
  { id: 'level1', ar: 'الأول', en: 'Level 1' },
  { id: 'level2', ar: 'الثاني', en: 'Level 2' },
  { id: 'level3', ar: 'الثالث', en: 'Level 3' },
  { id: 'roof', ar: 'السطح', en: 'Roof' },
];

const DISCIPLINE_ITEMS: Array<{ id: BimDiscipline; ar: string; en: string; color: string }> = [
  { id: 'structural', ar: 'إنشائي', en: 'Structural', color: '#94A3B8' },
  { id: 'architectural', ar: 'معماري', en: 'Architectural', color: '#D4A853' },
  { id: 'mep', ar: 'كهروميكانيك', en: 'MEP', color: '#38BDF8' },
  { id: 'site', ar: 'الموقع', en: 'Site', color: '#475569' },
];

// Reusable scratch math objects at module scope (zero GC inside render loop)
const _scratchBox = new THREE.Box3();
const _scratchCenter = new THREE.Vector3();
const _scratchSize = new THREE.Vector3();

export const Bim3DViewport: React.FC<Bim3DViewportProps> = ({
  elements,
  selectedId,
  highlightedElementIds = [],
  onSelectElement,
  onJumpToTakeoff,
  gisData,
  projectCode,
  lang,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const [cameraPreset, setCameraPreset] = useState<BimCameraPreset>('iso');
  const [renderMode, setRenderMode] = useState<BimRenderMode>('pbr');
  const [sectionMode, setSectionMode] = useState<BimSectionMode>('none');
  const [sectionOffset, setSectionOffset] = useState<number>(6);
  const [activeLevel, setActiveLevel] = useState<BimLevel | 'all'>('all');
  const [hiddenDisciplines, setHiddenDisciplines] = useState<Set<BimDiscipline>>(new Set());
  const [viewportKey, setViewportKey] = useState(0);

  const callbacksRef = useRef({ onSelectElement });
  callbacksRef.current = { onSelectElement };

  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  const highlightedIdsRef = useRef<string[]>(highlightedElementIds);
  highlightedIdsRef.current = highlightedElementIds;

  const activeLevelRef = useRef<BimLevel | 'all'>(activeLevel);
  activeLevelRef.current = activeLevel;

  const hiddenDisciplinesRef = useRef<Set<BimDiscipline>>(hiddenDisciplines);
  hiddenDisciplinesRef.current = hiddenDisciplines;

  const cameraPresetRef = useRef<BimCameraPreset>(cameraPreset);
  cameraPresetRef.current = cameraPreset;

  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    bimGroup: THREE.Group;
    gisGroup: THREE.Group;
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

  const highlightedSet = useMemo(() => new Set(highlightedElementIds), [highlightedElementIds]);

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) || null,
    [elements, selectedId]
  );

  const bimStats = useMemo(() => {
    const concreteM3 = elements
      .filter((e) => e.boqCategory === 'concrete')
      .reduce((acc, e) => acc + e.volumeM3, 0);
    const wallNetM2 = elements
      .filter((e) => e.category === 'wall' || e.boqCategory === 'masonry')
      .reduce((acc, e) => acc + e.netAreaM2, 0);
    const totalCostAed = elements.reduce((acc, e) => acc + e.estimatedCost, 0);
    return {
      concreteM3: Number(concreteM3.toFixed(1)),
      wallNetM2: Number(wallNetM2.toFixed(1)),
      totalCostAed: Math.round(totalCostAed),
    };
  }, [elements]);

  // Initialize Three.js WebGL Viewport once on mount
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
      setWebglError(err instanceof Error ? err.message : 'WebGL initialization failed');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 500;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1324);
    scene.fog = new THREE.FogExp2(0x0b1324, 0.011);

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

    // Holographic Blueprint Table Base (#060D1A + Glowing Cyan Grid + Axis Vectors)
    const groundGeo = new THREE.PlaneGeometry(110, 110);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x060d1a,
      roughness: 0.9,
      metalness: 0.12,
    });
    const groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.15;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    const fineGrid = new THREE.GridHelper(72, 72, 0x164e63, 0x0c243d);
    fineGrid.position.y = -0.12;
    if (Array.isArray(fineGrid.material)) {
      fineGrid.material.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.5;
      });
    } else {
      fineGrid.material.transparent = true;
      fineGrid.material.opacity = 0.5;
    }
    scene.add(fineGrid);

    const majorGrid = new THREE.GridHelper(72, 18, 0x38bdf8, 0x0e3a5c);
    majorGrid.position.y = -0.11;
    if (Array.isArray(majorGrid.material)) {
      majorGrid.material.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.48;
      });
    } else {
      majorGrid.material.transparent = true;
      majorGrid.material.opacity = 0.48;
    }
    scene.add(majorGrid);

    const gisGroup = new THREE.Group();
    scene.add(gisGroup);

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
          controls.target.x = THREE.MathUtils.damp(controls.target.x, st.targetLookAt.x, 7, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, st.targetLookAt.y, 7, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, st.targetLookAt.z, 7, dt);

          if (
            camera.position.distanceTo(st.targetPos) < 0.06 &&
            controls.target.distanceTo(st.targetLookAt) < 0.06
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
      bimGroup,
      gisGroup,
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
      const visibleHit = hits.find((h) => h.object.visible && h.object.userData.bimId);
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
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 500;
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

      const disposedGeos = new Set<THREE.BufferGeometry>();
      const disposedMats = new Set<THREE.Material>();
      [bimGroup, gisGroup].forEach((grp) => {
        grp.traverse((obj) => {
          if (
            obj instanceof THREE.Mesh ||
            obj instanceof THREE.LineSegments ||
            obj instanceof THREE.LineLoop
          ) {
            if (!disposedGeos.has(obj.geometry)) {
              obj.geometry.dispose();
              disposedGeos.add(obj.geometry);
            }
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
              if (!disposedMats.has(m)) {
                m.dispose();
                disposedMats.add(m);
              }
            });
          }
        });
      });
      groundGeo.dispose();
      groundMat.dispose();
      fineGrid.dispose();
      majorGrid.dispose();
      scene.environment?.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [viewportKey]);

  // 1. Sync BIM Elements Geometry & Section Planes ONLY when model, renderMode or section changes
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;

    while (st.bimGroup.children.length > 0) {
      const child = st.bimGroup.children[0];
      st.bimGroup.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
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
    const curHighlighted = new Set(highlightedIdsRef.current);
    const curActiveLevel = activeLevelRef.current;
    const curHidden = hiddenDisciplinesRef.current;

    for (const el of elements) {
      const w = Math.max(0.04, el.dimensions[0]);
      const h = Math.max(0.04, el.dimensions[1]);
      const d = Math.max(0.04, el.dimensions[2]);
      const geo = new THREE.BoxGeometry(w, h, d);
      const baseColor = CATEGORY_COLORS[el.category] ?? 0x94a3b8;
      const isGlass = el.category === 'glass';
      const isSelected = el.id === curSelected;
      const isViolation = curHighlighted.has(el.id);

      const matColor = isViolation ? 0xef4444 : isSelected ? 0xd4a853 : baseColor;
      const emissiveColor = isViolation ? 0xdc2626 : isSelected ? 0x9e7330 : 0x000000;
      const emissiveIntensity = isViolation ? 0.65 : isSelected ? 0.45 : 0;

      const mat = new THREE.MeshPhysicalMaterial({
        color: matColor,
        roughness: isGlass ? 0.1 : el.discipline === 'mep' ? 0.3 : 0.65,
        metalness: el.discipline === 'mep' ? 0.55 : isGlass ? 0.1 : 0.15,
        wireframe: renderMode === 'wireframe',
        transparent: isGlass || renderMode === 'xray' || renderMode === 'transparent',
        opacity:
          renderMode === 'xray'
            ? 0.22
            : renderMode === 'transparent'
            ? 0.52
            : isGlass
            ? st.isSoftwareGl
              ? 0.38
              : 0.45
            : 1.0,
        transmission: isGlass && !st.isSoftwareGl && renderMode === 'pbr' ? 0.65 : 0,
        emissive: new THREE.Color(emissiveColor),
        emissiveIntensity,
        clippingPlanes: activeClipPlanes,
        clipShadows: true,
        side: activeClipPlanes.length > 0 ? THREE.DoubleSide : THREE.FrontSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(el.position[0], el.position[1], el.position[2]);
      if (el.rotation) {
        mesh.rotation.set(el.rotation[0], el.rotation[1], el.rotation[2]);
      }

      const levelVisible = curActiveLevel === 'all' || el.level === curActiveLevel;
      const discVisible = !curHidden.has(el.discipline);
      mesh.visible = levelVisible && discVisible;
      mesh.castShadow = !isGlass && el.category !== 'site_grid';
      mesh.receiveShadow = true;
      mesh.userData.bimId = el.id;
      mesh.userData.baseColor = baseColor;
      mesh.userData.category = el.category;
      mesh.userData.discipline = el.discipline;
      mesh.userData.level = el.level;

      // Architectural Holographic Edge Glow (Cyan #38BDF8 & Gold #F59E0B)
      const edgeGeo = new THREE.EdgesGeometry(geo);
      const isGoldAccent =
        isSelected ||
        el.category === 'stair' ||
        el.category === 'door_window';
      const edgeColor = isViolation
        ? 0xf43f5e
        : isGoldAccent
        ? 0xf59e0b
        : 0x38bdf8;
      const edgeOpacity =
        isSelected || isViolation
          ? 0.98
          : renderMode === 'xray' || renderMode === 'wireframe'
          ? 0.85
          : el.discipline === 'architectural' || el.discipline === 'mep'
          ? 0.56
          : 0.36;

      const edgeMat = new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: edgeOpacity,
      });
      const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
      edgeLines.userData.isEdgeGlow = true;
      mesh.add(edgeLines);

      // Subtle void cutout wireframe markers when voidCutouts are present
      if (el.voidCutouts && el.voidCutouts.length > 0) {
        el.voidCutouts.forEach((vc, idx) => {
          const cutW = Math.min(w * 0.8, vc.width);
          const cutH = Math.min(h * 0.85, vc.height);
          const cutD = Math.min(d + 0.04, 0.35);
          const cutGeo = new THREE.BoxGeometry(cutW, cutH, cutD);
          const edgesGeo = new THREE.EdgesGeometry(cutGeo);
          cutGeo.dispose();
          const edgesMat = new THREE.LineBasicMaterial({ color: 0xf43f5e });
          const wire = new THREE.LineSegments(edgesGeo, edgesMat);
          const offsetX =
            el.voidCutouts && el.voidCutouts.length > 1
              ? (idx - (el.voidCutouts.length - 1) / 2) * (cutW + 1.2)
              : 0;
          wire.position.set(
            Math.max(-w / 3, Math.min(w / 3, offsetX)),
            0,
            0
          );
          mesh.add(wire);
        });
      }

      st.bimGroup.add(mesh);
      st.meshMap.set(el.id, mesh);
    }

    // Auto-frame camera bounds to imported BIM/IFC/DXF geometry
    if (st.bimGroup.children.length > 0) {
      _scratchBox.setFromObject(st.bimGroup);
      if (!_scratchBox.isEmpty()) {
        _scratchBox.getCenter(_scratchCenter);
        _scratchBox.getSize(_scratchSize);
        const radius = Math.max(10, _scratchSize.length() * 0.72);
        st.modelCenter.copy(_scratchCenter);
        st.modelRadius = radius;
        st.controls.maxDistance = Math.max(140, radius * 6);
        const dir = PRESET_DIRECTIONS[cameraPresetRef.current];
        const dist = radius * 1.48;
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

  // 2. Lightweight Visibility Filter Update (zero GPU buffer rebuild)
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;
    st.meshMap.forEach((mesh) => {
      const level = mesh.userData.level as BimLevel;
      const disc = mesh.userData.discipline as BimDiscipline;
      const levelVisible = activeLevel === 'all' || level === activeLevel;
      const discVisible = !hiddenDisciplines.has(disc);
      mesh.visible = levelVisible && discVisible;
    });
    st.requestRender();
  }, [activeLevel, hiddenDisciplines, viewportKey]);

  // 3. Lightweight Selection & Violation Highlighting (zero GPU buffer rebuild)
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;
    st.meshMap.forEach((mesh, id) => {
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      const baseColor = (mesh.userData.baseColor as number) ?? 0x94a3b8;
      const category = mesh.userData.category as string;
      const discipline = mesh.userData.discipline as BimDiscipline;
      const isSelected = id === selectedId;
      const isViolation = highlightedSet.has(id);

      mat.color.setHex(isViolation ? 0xef4444 : isSelected ? 0xd4a853 : baseColor);
      mat.emissive.setHex(isViolation ? 0xdc2626 : isSelected ? 0x9e7330 : 0x000000);
      mat.emissiveIntensity = isViolation ? 0.65 : isSelected ? 0.45 : 0;

      mesh.children.forEach((child) => {
        if (child instanceof THREE.LineSegments && child.userData.isEdgeGlow) {
          const edgeMat = child.material as THREE.LineBasicMaterial;
          const isGoldAccent =
            isSelected || category === 'stair' || category === 'door_window';
          edgeMat.color.setHex(isViolation ? 0xf43f5e : isGoldAccent ? 0xf59e0b : 0x38bdf8);
          edgeMat.opacity =
            isSelected || isViolation
              ? 0.98
              : renderMode === 'xray' || renderMode === 'wireframe'
              ? 0.85
              : discipline === 'architectural' || discipline === 'mep'
              ? 0.56
              : 0.36;
        }
      });
    });
    st.requestRender();
  }, [selectedId, highlightedSet, renderMode, viewportKey]);

  // Sync Holographic Concentric Radar Rings + GIS Plot Boundary & Sharjah Setbacks
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;

    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    while (st.gisGroup.children.length > 0) {
      const child = st.gisGroup.children[0];
      st.gisGroup.remove(child);
      child.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.LineSegments ||
          obj instanceof THREE.LineLoop
        ) {
          if (!disposedGeos.has(obj.geometry)) {
            obj.geometry.dispose();
            disposedGeos.add(obj.geometry);
          }
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (!disposedMats.has(m)) {
              m.dispose();
              disposedMats.add(m);
            }
          });
        }
      });
    }

    const geom = gisData ? computePlotGeometryCentered(gisData) : null;
    const baseRadius = geom ? Math.max(14, Math.hypot(geom.widthM, geom.depthM) * 0.54) : 16;

    // A. Concentric Holographic Radar Rings around Plot Perimeter (#38BDF8 + #F59E0B)
    const radarRadii = [
      { r: baseRadius * 0.88, color: 0x38bdf8, opacity: 0.45, bandWidth: 0.14 },
      { r: baseRadius * 1.06, color: 0x38bdf8, opacity: 0.65, bandWidth: 0.18 },
      { r: baseRadius * 1.24, color: 0xf59e0b, opacity: 0.35, bandWidth: 0.1 },
    ];

    radarRadii.forEach((cfg, idx) => {
      const ringGeo = new THREE.RingGeometry(cfg.r - cfg.bandWidth, cfg.r, 96);
      const ringMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: cfg.opacity,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = -0.02 + idx * 0.004;
      st.gisGroup.add(ringMesh);
    });

    // Radial Degree Calibration Ticks every 15 degrees around middle radar ring
    const tickPoints: THREE.Vector3[] = [];
    const tickRInner = baseRadius * 1.03;
    const tickROuter = baseRadius * 1.11;
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = (deg * Math.PI) / 180;
      const isCardinal = deg % 90 === 0;
      const rOut = isCardinal ? tickROuter + 1.4 : tickROuter;
      tickPoints.push(
        new THREE.Vector3(Math.cos(rad) * tickRInner, -0.01, Math.sin(rad) * tickRInner),
        new THREE.Vector3(Math.cos(rad) * rOut, -0.01, Math.sin(rad) * rOut)
      );
    }
    const ticksGeo = new THREE.BufferGeometry().setFromPoints(tickPoints);
    const ticksMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
    });
    st.gisGroup.add(new THREE.LineSegments(ticksGeo, ticksMat));

    if (!geom) {
      st.requestRender();
      return;
    }

    // B. Outer GIS Plot Boundary Laser Loop (#F59E0B Gold)
    const boundaryVecs = geom.centeredPoints.map(
      (pt) => new THREE.Vector3(pt.x, 0.04, pt.z)
    );
    const boundaryGeo = new THREE.BufferGeometry().setFromPoints(boundaryVecs);
    const boundaryMat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.96,
    });
    const boundaryLoop = new THREE.LineLoop(boundaryGeo, boundaryMat);
    st.gisGroup.add(boundaryLoop);

    // Corner Laser Beacons (shared geometry & material, zero clone leak)
    const pylonGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.35, 12);
    const pylonMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    geom.centeredPoints.forEach((pt) => {
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(pt.x, 0.675, pt.z);
      st.gisGroup.add(pylon);
    });

    // C. Inner Sharjah Municipality Setback Laser Envelope (#38BDF8 Sky Cyan)
    const { minX, maxX, minZ, maxZ, buildableWidthM, buildableDepthM } = geom.setbackBox;
    const setbackVecs =
      geom.setbackCenteredPoints && geom.setbackCenteredPoints.length >= 3
        ? geom.setbackCenteredPoints.map((pt) => new THREE.Vector3(pt.x, 0.05, pt.z))
        : [
            new THREE.Vector3(minX, 0.05, minZ),
            new THREE.Vector3(maxX, 0.05, minZ),
            new THREE.Vector3(maxX, 0.05, maxZ),
            new THREE.Vector3(minX, 0.05, maxZ),
          ];
    const setbackGeo = new THREE.BufferGeometry().setFromPoints(setbackVecs);
    const setbackMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
    });
    const setbackLoop = new THREE.LineLoop(setbackGeo, setbackMat);
    st.gisGroup.add(setbackLoop);

    // Translucent Buildable Zone Pad on Ground
    const envPadGeo = new THREE.PlaneGeometry(buildableWidthM, buildableDepthM);
    const envPadMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
    });
    const envPad = new THREE.Mesh(envPadGeo, envPadMat);
    envPad.rotation.x = -Math.PI / 2;
    envPad.position.set((minX + maxX) / 2, 0.01, (minZ + maxZ) / 2);
    st.gisGroup.add(envPad);

    st.requestRender();
  }, [gisData, viewportKey]);

  // Smooth Camera Preset Transition relative to active model bounds
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;
    const dir = PRESET_DIRECTIONS[cameraPreset];
    const dist = Math.max(16, st.modelRadius * 1.48);
    st.targetLookAt.copy(st.modelCenter);
    st.targetPos.set(
      st.modelCenter.x + dir[0] * dist,
      st.modelCenter.y + dir[1] * dist,
      st.modelCenter.z + dir[2] * dist
    );
    st.transitionActive = true;
    st.requestRender();
  }, [cameraPreset, viewportKey]);

  // Auto-Focus Camera onto Highlighted Violation Elements
  useEffect(() => {
    const st = sceneRef.current;
    if (!st || highlightedElementIds.length === 0) return;

    _scratchBox.makeEmpty();
    let matchedCount = 0;
    for (const id of highlightedElementIds) {
      const mesh = st.meshMap.get(id);
      if (mesh) {
        _scratchBox.expandByObject(mesh);
        matchedCount++;
      }
    }

    if (matchedCount > 0) {
      _scratchBox.getCenter(_scratchCenter);
      _scratchBox.getSize(_scratchSize);
      const radius = Math.max(4, _scratchSize.length() * 0.9);
      st.targetLookAt.copy(_scratchCenter);
      st.targetPos.set(
        _scratchCenter.x + radius * 1.15,
        _scratchCenter.y + Math.max(4, radius * 0.75),
        _scratchCenter.z + radius * 1.15
      );
      st.transitionActive = true;
      st.requestRender();
    }
  }, [highlightedElementIds]);

  const toggleDiscipline = (disc: BimDiscipline) => {
    setHiddenDisciplines((prev) => {
      const next = new Set(prev);
      if (next.has(disc)) next.delete(disc);
      else next.add(disc);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Level & Discipline Filters Bar */}
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[var(--text-muted)] me-1">
            <Layers className="w-3.5 h-3.5 text-[#B4863C]" />
            <span>{lang === 'ar' ? 'الطابق:' : 'Level:'}</span>
          </span>
          {BIM_LEVELS.map((lvl) => (
            <button
              key={lvl.id}
              type="button"
              onClick={() => setActiveLevel(lvl.id)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                activeLevel === lvl.id
                  ? 'bg-[#B4863C] text-white'
                  : 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)] hover:border-[#B4863C]/50'
              }`}
            >
              {lang === 'ar' ? lvl.ar : lvl.en}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {DISCIPLINE_ITEMS.map((disc) => {
            const hidden = hiddenDisciplines.has(disc.id);
            return (
              <button
                key={disc.id}
                type="button"
                onClick={() => toggleDiscipline(disc.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                  hidden
                    ? 'bg-[var(--bg-surface-subtle)] border-[var(--border-hairline)] text-[var(--text-muted)] line-through opacity-70'
                    : 'bg-[var(--bg-surface-subtle)] border-[var(--border-strong)] text-[var(--text-primary)] hover:border-[#B4863C]/50'
                }`}
              >
                {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3 text-[#B4863C]" />}
                <span>{lang === 'ar' ? disc.ar : disc.en}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Full-Width 3D WebGL Canvas + Clean Architectural Side Panels */}
      <div className="relative rounded-xl border border-[var(--border-hairline)] bg-[#060D1A] h-[600px] overflow-hidden">
        <div ref={canvasMountRef} className="w-full h-full" />

        {webglError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#060D1A] text-slate-300 text-xs p-6 text-center">
            <div className="space-y-2">
              <p className="font-semibold text-amber-400">WebGL Viewport Notice</p>
              <p>{webglError}</p>
              <button
                type="button"
                onClick={() => {
                  setWebglError(null);
                  setViewportKey((k) => k + 1);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B4863C] text-white font-semibold hover:bg-[#9E7330]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إعادة تشغيل WebGL' : 'Reinitialize 3D Viewport'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Top-Start Compact Architectural Spec Label */}
        <div
          className={`absolute top-3 start-3 z-10 rounded-xl bg-[#0B1426]/92 border border-slate-700/80 px-3.5 py-2.5 text-[11px] text-slate-200 pointer-events-none space-y-1.5 ${
            inspectorOpen
              ? 'hidden sm:block max-w-[calc(100%-290px)] lg:max-w-[440px]'
              : 'max-w-[calc(100%-200px)] sm:max-w-[440px]'
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span dir="ltr" className="font-mono font-bold text-[#C99A49]">
              {projectCode ? `${projectCode} · ` : ''}3D BIM
            </span>
            <span dir="ltr" className="font-mono tabular-nums text-slate-100">
              {elements.length} EL
            </span>
            <span aria-hidden="true" className="text-slate-600">|</span>
            <span dir="ltr" className="font-mono text-slate-300 font-semibold">
              {renderMode.toUpperCase()}
            </span>
            {highlightedElementIds.length > 0 && (
              <>
                <span aria-hidden="true" className="text-slate-600">|</span>
                <span className="text-rose-400 font-semibold inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span dir="ltr" className="font-mono tabular-nums">
                    {highlightedElementIds.length}
                  </span>
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-300 pt-1 border-t border-slate-700/70">
            {gisData && (
              <span>
                {lang === 'ar' ? 'القطعة:' : 'Plot:'}{' '}
                <span dir="ltr" className="font-mono tabular-nums text-[#C99A49] font-semibold">
                  {gisData.plotNumber}
                </span>
                {' · '}
                <span>{gisData.sectorName}</span>
                {' · '}
                <span dir="ltr" className="font-mono tabular-nums text-slate-200">
                  {gisData.plotAreaSqM.toLocaleString('en-AE')} m²
                </span>
              </span>
            )}
            <span>
              {lang === 'ar' ? 'الخرسانة:' : 'RC:'}{' '}
              <span dir="ltr" className="font-mono tabular-nums text-white font-semibold">
                {bimStats.concreteM3} m³
              </span>
            </span>
            <span>
              {lang === 'ar' ? 'المباني:' : 'Walls:'}{' '}
              <span dir="ltr" className="font-mono tabular-nums text-white font-semibold">
                {bimStats.wallNetM2} m²
              </span>
            </span>
          </div>
        </div>

        {/* Top-End Collapsible Element Inspector & 5D Takeoff Card */}
        <div className="absolute top-3 end-3 z-10 w-[235px] sm:w-[270px] max-h-[calc(100%-96px)] flex flex-col rounded-xl bg-[#0B1426]/92 border border-slate-700/80 text-slate-100 overflow-hidden">
          <button
            type="button"
            onClick={() => setInspectorOpen((v) => !v)}
            className="px-3.5 py-2.5 border-b border-slate-700/80 flex items-center justify-between gap-2 text-xs hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Box className="w-4 h-4 text-[#C99A49] shrink-0" />
              <span className="font-bold truncate">
                {selectedElement
                  ? lang === 'ar'
                    ? 'خصائص العنصر المحدد'
                    : 'Selected Element Inspector'
                  : lang === 'ar'
                  ? 'ملخص الحصر 5D BIM'
                  : '5D BIM Takeoff Summary'}
              </span>
            </div>
            {inspectorOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
          </button>

          {inspectorOpen && (
            <div className="overflow-y-auto p-3.5 space-y-2.5 text-xs">
              {!selectedElement ? (
                <div className="space-y-2.5 text-[11px]">
                  <p className="text-slate-300 leading-relaxed">
                    {lang === 'ar'
                      ? 'انقر على أي عنصر في المجسم ثلاثي الأبعاد لعرض مواصفاته وكمياته الصافية.'
                      : 'Click any BIM element in the 3D scene to inspect structural specs and net quantities.'}
                  </p>
                  <div className="border border-slate-700/70 rounded-lg divide-y divide-slate-800/80 bg-[#060D1A]/75">
                    <div className="px-2.5 py-1.5 flex justify-between gap-2">
                      <span className="text-slate-400">{lang === 'ar' ? 'خرسانة النموذج' : 'BIM Concrete'}</span>
                      <span dir="ltr" className="font-mono tabular-nums font-semibold text-slate-100">
                        {bimStats.concreteM3} m³
                      </span>
                    </div>
                    <div className="px-2.5 py-1.5 flex justify-between gap-2">
                      <span className="text-slate-400">{lang === 'ar' ? 'صافي الحوائط' : 'Net Walls'}</span>
                      <span dir="ltr" className="font-mono tabular-nums font-semibold text-white">
                        {bimStats.wallNetM2} m²
                      </span>
                    </div>
                    <div className="px-2.5 py-1.5 flex justify-between gap-2">
                      <span className="text-slate-400">{lang === 'ar' ? 'التكلفة التقديرية' : '5D Estimate'}</span>
                      <span dir="ltr" className="font-mono tabular-nums font-bold text-[#C99A49]">
                        {formatAED(bimStats.totalCostAed, 'en')}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-xs font-bold text-white leading-snug">
                      {lang === 'ar' ? selectedElement.nameAr : selectedElement.name}
                    </div>
                    <div dir="ltr" className="text-[10.5px] text-[#C99A49] font-mono mt-0.5 truncate">
                      {selectedElement.guid} · {selectedElement.level}
                    </div>
                  </div>

                  {highlightedSet.has(selectedElement.id) && (
                    <div className="p-2 rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-200 flex items-center gap-1.5 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      <span>
                        {lang === 'ar'
                          ? 'عنصر مرصود ضمن ملاحظات البلدية.'
                          : 'Flagged by Sharjah compliance check.'}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#060D1A]/75 border border-slate-700/70 text-[11px]">
                    <div>
                      <div className="text-slate-400">{lang === 'ar' ? 'الخرسانة' : 'Grade'}</div>
                      <div dir="ltr" className="font-mono font-semibold text-white truncate">
                        {selectedElement.concreteGrade || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">{lang === 'ar' ? 'التسليح' : 'Rebar'}</div>
                      <div dir="ltr" className="font-mono font-semibold text-white truncate">
                        {selectedElement.rebarSpec || '—'}
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-700/70 rounded-lg divide-y divide-slate-800/80 bg-[#060D1A]/75 text-[11px]">
                    <div className="px-2.5 py-1.5 flex justify-between gap-2">
                      <span className="text-slate-400">
                        {lang === 'ar' ? 'المساحة الإجمالية' : 'Gross Area'}
                      </span>
                      <span dir="ltr" className="font-mono tabular-nums font-semibold text-slate-200">
                        {selectedElement.grossAreaM2.toFixed(2)} m²
                      </span>
                    </div>
                    <div className="px-2.5 py-1.5 flex justify-between gap-2 text-rose-300">
                      <span>{lang === 'ar' ? 'خصم الفتحات' : 'Void Deduction'}</span>
                      <span dir="ltr" className="font-mono tabular-nums font-semibold">
                        -{selectedElement.deductedOpeningAreaM2.toFixed(2)} m²
                      </span>
                    </div>
                    <div className="px-2.5 py-1.5 flex justify-between gap-2 text-emerald-300">
                      <span className="font-semibold">{lang === 'ar' ? 'الصافي' : 'Net Area'}</span>
                      <span dir="ltr" className="font-mono tabular-nums font-bold">
                        {selectedElement.netAreaM2.toFixed(2)} m²
                      </span>
                    </div>
                    <div className="px-2.5 py-1.5 flex justify-between gap-2">
                      <span className="text-slate-400">{lang === 'ar' ? 'الحجم' : 'Volume'}</span>
                      <span dir="ltr" className="font-mono tabular-nums font-semibold text-slate-100">
                        {selectedElement.volumeM3.toFixed(2)} m³
                      </span>
                    </div>
                    <div className="px-2.5 py-2 flex justify-between gap-2 bg-[#B4863C]/12">
                      <span className="font-bold text-white">{lang === 'ar' ? 'التكلفة 5D' : '5D Cost'}</span>
                      <span dir="ltr" className="font-mono tabular-nums font-bold text-[#C99A49]">
                        {formatAED(selectedElement.estimatedCost, 'en')}
                      </span>
                    </div>
                  </div>

                  {selectedElement.voidCutouts && selectedElement.voidCutouts.length > 0 && (
                    <div className="space-y-1 text-[10.5px]">
                      <div className="font-semibold text-slate-300">
                        {lang === 'ar' ? 'الفتحات المفرغة' : 'Void Cutouts'}
                      </div>
                      {selectedElement.voidCutouts.map((v) => (
                        <div
                          key={v.id}
                          className="px-2 py-1 rounded border border-slate-700/70 flex justify-between gap-2"
                        >
                          <span className="truncate text-slate-300">{v.label}</span>
                          <span dir="ltr" className="font-mono tabular-nums text-rose-300 shrink-0">
                            -{v.areaM2.toFixed(2)} m²
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedElement.linkedMeasurementId && onJumpToTakeoff && (
                    <button
                      type="button"
                      onClick={() => onJumpToTakeoff(selectedElement.linkedMeasurementId!)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B4863C] text-white text-[11px] font-semibold hover:bg-[#9E7330]"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>
                        {lang === 'ar' ? 'تحديد في PlanSwift 2D' : 'Highlight in 2D PlanSwift'}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Collapsible Bottom Control Dock (Camera Presets, Render Modes, Section Clipping Planes) */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[95%] max-w-[760px] z-10 flex flex-col items-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-[#0E1628]/95 border border-b-0 border-slate-700/80 text-[11px] font-medium text-slate-200 hover:text-white"
          >
            {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>
              {dockCollapsed
                ? lang === 'ar'
                  ? 'إظهار أدوات الكاميرا والقطاع'
                  : 'Show Viewport Controls'
                : lang === 'ar'
                ? 'طي الأدوات'
                : 'Hide Controls'}
            </span>
          </button>

          {!dockCollapsed && (
            <div className="w-full rounded-xl bg-[#0E1628]/95 border border-slate-700/80 p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              {/* Camera Presets */}
              <div className="flex items-center gap-1">
                {(['iso', 'top', 'front', 'back', 'left', 'right'] as BimCameraPreset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCameraPreset(p)}
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
                    onClick={() => setRenderMode(m)}
                    className={`px-2 py-1 rounded font-mono uppercase transition-colors ${
                      renderMode === m
                        ? 'bg-[#B4863C]/25 text-[#E5B869] border border-[#B4863C]/60 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Clipping Section Planes */}
              <div className="flex items-center gap-1.5 border-s border-slate-700 ps-2">
                <Scissors className="w-3.5 h-3.5 text-[#C99A49]" />
                {(['none', 'x', 'y', 'z', 'box'] as BimSectionMode[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSectionMode(s)}
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
                    onChange={(e) => setSectionOffset(Number(e.target.value))}
                    className="w-20 accent-[#B4863C]"
                    aria-label="Section clipping offset"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
