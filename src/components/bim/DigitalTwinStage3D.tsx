import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Layers, Pause, Play, RotateCcw } from 'lucide-react';
import type { Language, Project, ThemeMode } from '../../types/bunyan';

export interface DigitalTwinStage3DProps {
  project?: Project | null;
  lang: Language;
  theme?: ThemeMode;
  heightClass?: string;
  compact?: boolean;
}

type StageCameraPreset = 'iso' | 'top' | 'front';

const PRESET_OFFSETS: Record<StageCameraPreset, [number, number, number]> = {
  iso: [15.5, 11.2, 15.5],
  top: [0.01, 21, 0.01],
  front: [0, 6.2, 19.5],
};

function createArchitecturalSiteTexture(isDark: boolean): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isDark ? '#0D1526' : '#DCE5F2';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.16)' : 'rgba(37, 99, 235, 0.14)';
    ctx.lineWidth = 1;
    const step = 32;
    for (let i = 0; i <= size; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    // Major architectural datum axes
    ctx.strokeStyle = isDark ? 'rgba(214, 166, 79, 0.42)' : 'rgba(180, 134, 60, 0.48)';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, size - 48, size - 48);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function detectDarkMode(explicitTheme?: ThemeMode): boolean {
  if (explicitTheme) return explicitTheme === 'dark';
  if (typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark');
  }
  return true;
}

export const DigitalTwinStage3D: React.FC<DigitalTwinStage3DProps> = ({
  project,
  lang,
  theme,
  heightClass = 'h-[300px] sm:h-[340px]',
  compact = false,
}) => {
  const isAr = lang === 'ar';
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => detectDarkMode(theme));
  const [cameraPreset, setCameraPreset] = useState<StageCameraPreset>('iso');
  const [exploded, setExploded] = useState<boolean>(false);
  const [autoOrbit, setAutoOrbit] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    return true;
  });
  const [webglError, setWebglError] = useState<string | null>(null);
  const [viewportKey, setViewportKey] = useState(0);

  // Sync theme via prop + DOM observer so Light/Dark mode switching updates the 3D scene immediately
  useEffect(() => {
    setIsDark(detectDarkMode(theme));
    if (theme) return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, [theme]);

  const floorCount = useMemo(() => {
    if (!project) return 6;
    const buaSqM = (project.gisData?.builtUpAreaSqFt || 0) * 0.092903;
    const plotSqM = Math.max(120, project.gisData?.plotAreaSqM || 500);
    const estFromArea = Math.round((buaSqM / (plotSqM * 0.55)) * 1.4);
    const baseline = project.projectType === 'commercial_tower' ? 7 : project.projectType === 'villa' ? 4 : 6;
    return Math.max(3, Math.min(9, estFromArea || baseline));
  }, [project]);

  const completionRatio = useMemo(() => {
    const pct = project?.actualProgress ?? 78;
    return Math.max(0.25, Math.min(1, pct / 100));
  }, [project?.actualProgress]);

  const explodedRef = useRef(exploded);
  explodedRef.current = exploded;
  const autoOrbitRef = useRef(autoOrbit);
  autoOrbitRef.current = autoOrbit;

  const sceneStateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    hemi: THREE.HemisphereLight;
    keyLight: THREE.DirectionalLight;
    rimLight: THREE.DirectionalLight;
    groundPlane: THREE.Mesh;
    plinthMesh: THREE.Mesh;
    gridHelper: THREE.GridHelper;
    floorGroups: THREE.Group[];
    roofGroup: THREE.Group;
    craneGroup: THREE.Group;
    siteTexture: THREE.CanvasTexture | null;
    requestRender: () => void;
    transitionActive: boolean;
    targetPos: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    explodeProgress: number;
    isSoftwareGl: boolean;
  } | null>(null);

  // 1. Initialize Three.js WebGL Stage
  useEffect(() => {
    const container = mountRef.current;
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
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 520;
    const height = container.clientHeight || 320;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const initialDark = detectDarkMode(theme);
    const scene = new THREE.Scene();
    const bgHex = initialDark ? 0x090e1a : 0xeaf0f8;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, initialDark ? 0.015 : 0.011);

    const buildEnv = () => {
      scene.environment?.dispose();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
      roomEnv.dispose();
      pmrem.dispose();
    };
    buildEnv();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 200);
    camera.position.set(...PRESET_OFFSETS.iso);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 9;
    controls.maxDistance = 32;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.target.set(0, 3.6, 0);

    // Three-point architectural studio lighting
    const hemi = new THREE.HemisphereLight(
      initialDark ? 0x93c5fd : 0xf8fafc,
      initialDark ? 0x0f172a : 0xcbd5e1,
      initialDark ? 0.85 : 1.05
    );
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(initialDark ? 0xfff3db : 0xfff8eb, 1.9);
    keyLight.position.set(14, 24, 14);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 14;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      initialDark ? 0x38bdf8 : 0x2563eb,
      initialDark ? 0.85 : 0.45
    );
    rimLight.position.set(-14, 10, -14);
    scene.add(rimLight);

    // Ground plane + procedural architectural site plinth
    const groundGeo = new THREE.PlaneGeometry(70, 70);
    const groundMat = new THREE.MeshStandardMaterial({
      color: initialDark ? 0x090e1a : 0xe2e8f0,
      roughness: 0.92,
      metalness: 0.06,
    });
    const groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.02;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    const gridHelper = new THREE.GridHelper(
      34,
      34,
      initialDark ? 0x38bdf8 : 0x64748b,
      initialDark ? 0x1e293b : 0xcbd5e1
    );
    gridHelper.position.y = 0;
    if (Array.isArray(gridHelper.material)) {
      gridHelper.material.forEach((m) => {
        m.transparent = true;
        m.opacity = initialDark ? 0.32 : 0.4;
      });
    } else {
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = initialDark ? 0.32 : 0.4;
    }
    scene.add(gridHelper);

    const siteTexture = createArchitecturalSiteTexture(initialDark);
    const plinthGeo = new THREE.BoxGeometry(10.6, 0.28, 8.6);
    const plinthMat = new THREE.MeshStandardMaterial({
      map: siteTexture,
      roughness: 0.72,
      metalness: 0.14,
    });
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.position.set(0, 0.14, 0);
    plinthMesh.receiveShadow = true;
    plinthMesh.castShadow = !isSoftwareGl;
    scene.add(plinthMesh);

    // Site Brass Perimeter Datum Curb
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0xb4863c,
      roughness: 0.32,
      metalness: 0.78,
    });
    const curbGeo = new THREE.BoxGeometry(10.82, 0.08, 8.82);
    const curbMesh = new THREE.Mesh(curbGeo, curbMat);
    curbMesh.position.set(0, 0.04, 0);
    scene.add(curbMesh);

    // Composite Architectural Building Twin Assembly
    const twinRoot = new THREE.Group();
    scene.add(twinRoot);

    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.68,
      metalness: 0.08,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.55,
      metalness: 0.24,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.08,
      metalness: 0.12,
      transparent: true,
      opacity: isSoftwareGl ? 0.46 : 0.52,
      transmission: isSoftwareGl ? 0 : 0.55,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
    });
    const brassFinMat = new THREE.MeshStandardMaterial({
      color: 0xd6a64f,
      roughness: 0.28,
      metalness: 0.82,
    });
    const cobaltAccentMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.35,
      metalness: 0.45,
    });

    // Central Structural Core Shaft (spans from foundation to penthouse)
    const totalH = floorCount * 0.92 + 0.8;
    const coreGeo = new THREE.BoxGeometry(2.3, totalH, 2.1);
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, 0.28 + totalH / 2, 0);
    coreMesh.castShadow = !isSoftwareGl;
    coreMesh.receiveShadow = true;
    twinRoot.add(coreMesh);

    // Multi-Story Parametric Floor Assemblies
    const floorGroups: THREE.Group[] = [];
    for (let i = 0; i < floorCount; i++) {
      const fg = new THREE.Group();
      const baseY = 0.36 + i * 0.92;
      fg.position.y = baseY;
      fg.userData.baseY = baseY;
      fg.userData.floorIdx = i;

      // Taper upper executive levels subtly for global flagship tower silhouette
      const isPodium = i === 0;
      const taper = i >= floorCount - 2 ? 0.84 : 1.0;
      const w = (isPodium ? 7.6 : 6.2) * taper;
      const d = (isPodium ? 6.0 : 4.8) * taper;

      // Structural Slab Plate
      const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), concreteMat);
      slabMesh.position.y = 0.08;
      slabMesh.castShadow = !isSoftwareGl;
      slabMesh.receiveShadow = true;
      fg.add(slabMesh);

      // Curtain-Wall Glazed Volume
      const glassMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.34, 0.72, d - 0.34),
        glassMat
      );
      glassMesh.position.y = 0.52;
      fg.add(glassMesh);

      // Perimeter Structural Columns & Brushed Brass Vertical Louvers
      const colPositions: [number, number][] = [
        [-w / 2 + 0.22, -d / 2 + 0.22],
        [w / 2 - 0.22, -d / 2 + 0.22],
        [-w / 2 + 0.22, d / 2 - 0.22],
        [w / 2 - 0.22, d / 2 - 0.22],
        [0, -d / 2 + 0.2],
        [0, d / 2 - 0.2],
      ];
      for (const [cx, cz] of colPositions) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.76, 0.16), brassFinMat);
        col.position.set(cx, 0.52, cz);
        col.castShadow = !isSoftwareGl;
        fg.add(col);
      }

      // Active floor progress trim bar on facade
      if (i / floorCount <= completionRatio) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.05, d + 0.04), cobaltAccentMat);
        trim.position.y = 0.17;
        fg.add(trim);
      }

      twinRoot.add(fg);
      floorGroups.push(fg);
    }

    // Architectural Crown & Solar Pergola Roof Group
    const roofGroup = new THREE.Group();
    const roofBaseY = 0.36 + floorCount * 0.92;
    roofGroup.position.y = roofBaseY;
    roofGroup.userData.baseY = roofBaseY;

    const crownFrame = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.24, 4.2), coreMat);
    crownFrame.position.y = 0.12;
    crownFrame.castShadow = !isSoftwareGl;
    roofGroup.add(crownFrame);

    const pergola = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.12, 3.6), brassFinMat);
    pergola.position.y = 0.42;
    pergola.castShadow = !isSoftwareGl;
    roofGroup.add(pergola);

    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.35, 12), cobaltAccentMat);
    spire.position.set(0, 1.08, 0);
    roofGroup.add(spire);
    twinRoot.add(roofGroup);

    // Sleek Tower Crane Accent (represents live construction digital twin)
    const craneGroup = new THREE.Group();
    craneGroup.position.set(-4.35, 0.28, -2.95);
    const mastH = roofBaseY + 1.45;
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.24, mastH, 0.24), brassFinMat);
    mast.position.y = mastH / 2;
    mast.castShadow = !isSoftwareGl;
    craneGroup.add(mast);

    const jib = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 0.22), brassFinMat);
    jib.position.set(1.75, mastH + 0.08, 0);
    jib.castShadow = !isSoftwareGl;
    craneGroup.add(jib);

    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.45), coreMat);
    counterweight.position.set(-0.75, mastH + 0.05, 0);
    craneGroup.add(counterweight);
    twinRoot.add(craneGroup);

    // Animation & Coalesced Software-GL Safe Render Loop
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

        const st = sceneStateRef.current;
        let keepAnimating = false;

        if (st) {
          // Smooth camera preset transition
          if (st.transitionActive) {
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

          // Smooth Exploded / Assembled floor separation
          const targetExplode = explodedRef.current ? 1 : 0;
          if (Math.abs(st.explodeProgress - targetExplode) > 0.005) {
            st.explodeProgress = THREE.MathUtils.damp(st.explodeProgress, targetExplode, 8, dt);
            keepAnimating = true;
          } else {
            st.explodeProgress = targetExplode;
          }

          st.floorGroups.forEach((fg, idx) => {
            fg.position.y = (fg.userData.baseY as number) + idx * 0.46 * st.explodeProgress;
          });
          st.roofGroup.position.y =
            (st.roofGroup.userData.baseY as number) +
            st.floorGroups.length * 0.46 * st.explodeProgress;

          // Subtle idle architectural turntable orbit (pauses in software GL unless explicitly enabled or uses slow gentle step)
          if (autoOrbitRef.current && !st.transitionActive) {
            controls.autoRotate = true;
            controls.autoRotateSpeed = isSoftwareGl ? 0.8 : 0.65;
            keepAnimating = true;
          } else {
            controls.autoRotate = false;
          }

          // Gentle tower crane jib sweep
          if (autoOrbitRef.current) {
            st.craneGroup.rotation.y = Math.sin(now * 0.00035) * 0.35;
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

    sceneStateRef.current = {
      renderer,
      scene,
      camera,
      controls,
      hemi,
      keyLight,
      rimLight,
      groundPlane,
      plinthMesh,
      gridHelper,
      floorGroups,
      roofGroup,
      craneGroup,
      siteTexture,
      requestRender,
      transitionActive: false,
      targetPos: new THREE.Vector3(...PRESET_OFFSETS.iso),
      targetLookAt: new THREE.Vector3(0, 3.6, 0),
      explodeProgress: 0,
      isSoftwareGl,
    };

    controls.addEventListener('start', () => {
      if (sceneStateRef.current) sceneStateRef.current.transitionActive = false;
    });
    controls.addEventListener('change', requestRender);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost');
    };
    const onContextRestored = () => {
      buildEnv();
      setWebglError(null);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 520;
      const h = container.clientHeight || 320;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      twinRoot.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      groundGeo.dispose();
      groundMat.dispose();
      plinthGeo.dispose();
      plinthMat.dispose();
      curbGeo.dispose();
      curbMat.dispose();
      siteTexture.dispose();
      gridHelper.dispose();
      scene.environment?.dispose();
      renderer.dispose();
      sceneStateRef.current = null;
    };
  }, [floorCount, completionRatio, viewportKey]);

  // 2. Live Dual-Theme Scene Synchronization (Light <-> Dark) without Rebuilding WebGL Context
  useEffect(() => {
    const st = sceneStateRef.current;
    if (!st) return;

    const bgHex = isDark ? 0x090e1a : 0xeaf0f8;
    st.scene.background = new THREE.Color(bgHex);
    st.scene.fog = new THREE.FogExp2(bgHex, isDark ? 0.015 : 0.011);

    st.hemi.color.setHex(isDark ? 0x93c5fd : 0xf8fafc);
    st.hemi.groundColor.setHex(isDark ? 0x0f172a : 0xcbd5e1);
    st.hemi.intensity = isDark ? 0.85 : 1.05;

    st.keyLight.color.setHex(isDark ? 0xfff3db : 0xfff8eb);
    st.rimLight.color.setHex(isDark ? 0x38bdf8 : 0x2563eb);
    st.rimLight.intensity = isDark ? 0.85 : 0.45;

    (st.groundPlane.material as THREE.MeshStandardMaterial).color.setHex(isDark ? 0x090e1a : 0xe2e8f0);

    const nextTex = createArchitecturalSiteTexture(isDark);
    const plinthMat = st.plinthMesh.material as THREE.MeshStandardMaterial;
    st.siteTexture?.dispose();
    plinthMat.map = nextTex;
    plinthMat.needsUpdate = true;
    st.siteTexture = nextTex;

    const gridMat = st.gridHelper.material;
    if (Array.isArray(gridMat)) {
      gridMat.forEach((m, i) => {
        if ('color' in m) {
          (m as THREE.LineBasicMaterial).color.setHex(
            i === 0 ? (isDark ? 0x38bdf8 : 0x64748b) : isDark ? 0x1e293b : 0xcbd5e1
          );
        }
        m.opacity = isDark ? 0.32 : 0.4;
      });
    }

    st.requestRender();
  }, [isDark, viewportKey]);

  // 3. Camera Preset + Exploded/Orbit Triggers
  useEffect(() => {
    const st = sceneStateRef.current;
    if (!st) return;
    const off = PRESET_OFFSETS[cameraPreset];
    st.targetPos.set(off[0], off[1], off[2]);
    st.targetLookAt.set(0, 3.6, 0);
    st.transitionActive = true;
    st.requestRender();
  }, [cameraPreset]);

  useEffect(() => {
    sceneStateRef.current?.requestRender();
  }, [exploded, autoOrbit]);

  return (
    <div
      className={`relative rounded-2xl border border-[var(--border-hairline)] bg-[var(--viewport-bg)] ${heightClass} overflow-hidden shadow-[var(--spatial-card-shadow)]`}
    >
      {/* Isolated WebGL mount div (never apply backdrop-filter over canvas) */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {webglError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--viewport-bg)] text-[var(--text-secondary)] text-xs p-5 text-center gap-2.5">
          <div className="font-semibold">{isAr ? 'معاينة التوأم الرقمي 3D' : '3D Digital Twin Preview'}</div>
          <button
            type="button"
            onClick={() => {
              setWebglError(null);
              setViewportKey((k) => k + 1);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent-blue)] text-white font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'إعادة تشغيل العرض ثلاثي الأبعاد' : 'Reload 3D Viewport'}</span>
          </button>
        </div>
      )}

      {/* Top-Start Architectural Twin Telemetry Label (solid surface, zero blur over WebGL) */}
      <div className="absolute top-3 start-3 z-10 px-2.5 py-1 rounded-lg bg-white/95 dark:bg-[#0D1424]/95 border border-[var(--border-hairline)] text-[10.5px] font-mono text-[var(--text-primary)] pointer-events-none flex items-center gap-2 shadow-xs">
        <span className="font-bold text-[var(--accent-cyan)]">3D TWIN</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span dir="ltr" className="tabular-nums">
          {project ? `${project.code} (${floorCount}F)` : 'G+6 · BIM LOD 400'}
        </span>
      </div>

      {/* Clean Floating Bottom Viewport Control Bar */}
      {!compact && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/95 dark:bg-[#0D1424]/95 border border-[var(--border-hairline)] shadow-md text-[10.5px] font-mono">
          {(['iso', 'top', 'front'] as StageCameraPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setCameraPreset(p)}
              className={`px-2 py-1 rounded-md uppercase transition-colors cursor-pointer ${
                cameraPreset === p
                  ? 'bg-[var(--accent-blue)] text-white font-bold'
                  : 'text-[var(--text-secondary)] hover:bg-slate-200/70 dark:hover:bg-slate-800'
              }`}
            >
              {p}
            </button>
          ))}

          <span className="h-3.5 w-px bg-[var(--border-hairline)] mx-0.5" aria-hidden="true" />

          <button
            type="button"
            onClick={() => setExploded((v) => !v)}
            title={isAr ? 'تفكيك الطوابق المعمارية' : 'Exploded Floor Layers'}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              exploded
                ? 'bg-[var(--accent-gold)] text-white font-bold'
                : 'text-[var(--text-secondary)] hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{isAr ? 'تفكيك' : 'Explode'}</span>
          </button>

          <button
            type="button"
            onClick={() => setAutoOrbit((v) => !v)}
            title={isAr ? 'تدوير تلقائي' : 'Toggle Auto-Orbit'}
            className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label={autoOrbit ? 'Pause orbit' : 'Resume orbit'}
          >
            {autoOrbit ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
        </div>
      )}
    </div>
  );
};
