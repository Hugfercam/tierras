import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GroupMember, Visit } from '../../shared/types.ts';
import { countryAtPoint } from './atlas';
import type { CityMarker } from './cityMarkers';
import { drawGlobeTexture, type MapLayer } from './globeTexture';

export interface GlobeData {
  visits: Visit[];
  members: GroupMember[];
  layer: MapLayer;
  selectedCountry: string | null;
}

export interface GlobeFocusTarget {
  lat: number;
  lng: number;
  key: number;
}

export interface BeaconScreenPosition {
  x: number;
  y: number;
  visible: boolean;
}

interface GlobeCallbacks {
  onCountryClick: (iso2: string | null) => void;
  onCityClick: (cityId: string) => void;
  onHover: (payload: { iso2: string; x: number; y: number } | null) => void;
  onBeaconScreen: (position: BeaconScreenPosition | null) => void;
}

const RADIUS = 1.8;
const GLOBE_ROTATION_Y = -Math.PI / 2;
const DEFAULT_ROTATION_SPEED = 0.28;
const MARKER_RADIUS = RADIUS * 1.014;

function latLngToVector(lat: number, lng: number, radius = RADIUS): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(lat);
  const lambda = THREE.MathUtils.degToRad(lng);
  return new THREE.Vector3(
    Math.cos(phi) * Math.cos(lambda),
    Math.sin(phi),
    -Math.cos(phi) * Math.sin(lambda),
  ).multiplyScalar(radius);
}

function vectorToLatLng(vector: THREE.Vector3): { lat: number; lng: number } {
  const normalized = vector.clone().normalize();
  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(normalized.y, -1, 1))),
    lng: THREE.MathUtils.radToDeg(-Math.atan2(normalized.z, normalized.x)),
  };
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

export class GlobeEngine {
  private container: HTMLElement;
  private callbacks: GlobeCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private globeGroup = new THREE.Group();
  private globeMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial>;
  private cityMesh: THREE.InstancedMesh | null = null;
  private cityMarkers: CityMarker[] = [];
  private marker: THREE.Group | null = null;
  private markerRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;
  private beaconTarget: { lat: number; lng: number } | null = null;
  private lastBeaconUpdate = 0;
  private lastBeaconScreen: BeaconScreenPosition | null = null;
  private frame = 0;
  private resizeObserver: ResizeObserver;
  private width = 1;
  private height = 1;
  private data: GlobeData = {
    visits: [],
    members: [],
    layer: 'group',
    selectedCountry: null,
  };
  private focusTween: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    startedAt: number;
    duration: number;
  } | null = null;
  private autoRotateEnabled: boolean;
  private resumeAutoRotateAt = 0;
  private reducedMotion: boolean;
  private hasInteracted = false;
  private pointerDown: { x: number; y: number; time: number } | null = null;
  private hoverFrame = 0;
  private lastHoverIso: string | null = null;
  private lastHoverAt = 0;
  private lastPointer: { x: number; y: number } | null = null;
  private disposed = false;
  private texture: THREE.CanvasTexture | null = null;

  constructor(
    container: HTMLElement,
    callbacks: GlobeCallbacks,
    options: { reducedMotion?: boolean } = {},
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.reducedMotion = options.reducedMotion ?? false;
    this.autoRotateEnabled = !this.reducedMotion;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'globe-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    const initialSize = this.measure();
    this.width = initialSize.width;
    this.height = initialSize.height;
    this.renderer.setSize(this.width, this.height, false);

    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 100);
    const initialDistance = this.fitDistance();
    this.camera.position.set(0, initialDistance * 0.13, initialDistance);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    this.controls.minDistance = 2.55;
    this.controls.maxDistance = 9;
    this.controls.autoRotate = this.autoRotateEnabled;
    this.controls.autoRotateSpeed = DEFAULT_ROTATION_SPEED;
    this.controls.target.set(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xf7f0df, 1.55));
    const keyLight = new THREE.DirectionalLight(0xfff4df, 1.6);
    keyLight.position.set(-3.5, 3.5, 4.5);
    this.scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x5ccdb2, 0.55);
    rimLight.position.set(4, -2, -3);
    this.scene.add(rimLight);

    this.globeGroup.rotation.y = GLOBE_ROTATION_Y;
    this.scene.add(this.globeGroup);

    this.globeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 96, 72),
      new THREE.MeshPhongMaterial({
        color: 0xffffff,
        shininess: 7,
        specular: 0x173b42,
      }),
    );
    this.globeGroup.add(this.globeMesh);
    this.updateTexture();

    this.addAtmosphere();
    this.addStars();
    this.addOrbitRing();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    this.controls.addEventListener('start', this.handleInteractionStart);
    this.controls.addEventListener('end', this.handleInteractionEnd);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);

    this.animate();
  }

  private measure(): { width: number; height: number } {
    return {
      width: Math.max(1, this.container.clientWidth),
      height: Math.max(1, this.container.clientHeight),
    };
  }

  private fitDistance(): number {
    const aspect = this.width / this.height;
    const verticalFov = THREE.MathUtils.degToRad(this.camera?.fov ?? 40);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    return (RADIUS * 1.12) / Math.tan(limitingFov / 2) + 0.18;
  }

  private addAtmosphere(): void {
    const geometry = new THREE.SphereGeometry(RADIUS * 1.09, 64, 48);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.1);
          gl_FragColor = vec4(0.43, 0.86, 0.75, 1.0) * intensity;
        }
      `,
    });
    this.globeGroup.add(new THREE.Mesh(geometry, material));
  }

  private addStars(): void {
    const count = 900;
    const positions = new Float32Array(count * 3);
    const random = () => Math.random() * 2 - 1;
    for (let index = 0; index < count; index += 1) {
      const radius = 7 + Math.random() * 16;
      const theta = Math.acos(random());
      const phi = Math.random() * Math.PI * 2;
      positions[index * 3] = radius * Math.sin(theta) * Math.cos(phi);
      positions[index * 3 + 1] = radius * Math.cos(theta);
      positions[index * 3 + 2] = radius * Math.sin(theta) * Math.sin(phi);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xb7cdc4,
      size: 0.022,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.scene.add(new THREE.Points(geometry, material));
  }

  private addOrbitRing(): void {
    const points: THREE.Vector3[] = [];
    const segments = 180;
    const radius = RADIUS * 1.22;
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xd8b985,
      transparent: true,
      opacity: 0.16,
    });
    const orbit = new THREE.Line(geometry, material);
    orbit.rotation.x = 1.22;
    orbit.rotation.z = 0.2;
    this.scene.add(orbit);
  }

  private updateTexture(): void {
    const width = this.width > 900 ? 3072 : 2048;
    const canvas = drawGlobeTexture({
      width,
      visits: this.data.visits,
      members: this.data.members,
      layer: this.data.layer,
      selectedCountry: this.data.selectedCountry,
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.texture?.dispose();
    this.texture = texture;
    this.globeMesh.material.map = texture;
    this.globeMesh.material.needsUpdate = true;
  }

  setData(data: GlobeData): void {
    const changed =
      data.layer !== this.data.layer ||
      data.selectedCountry !== this.data.selectedCountry ||
      data.visits !== this.data.visits ||
      data.members !== this.data.members;
    this.data = data;
    if (changed) this.updateTexture();
  }

  setCityMarkers(markers: CityMarker[], visible: boolean): void {
    this.cityMarkers = markers;
    if (this.cityMesh) {
      this.globeGroup.remove(this.cityMesh);
      this.cityMesh.geometry.dispose();
      (this.cityMesh.material as THREE.Material).dispose();
      this.cityMesh = null;
    }
    if (!visible || markers.length === 0) return;

    const geometry = new THREE.SphereGeometry(0.018, 8, 6);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, markers.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    markers.forEach((marker, index) => {
      dummy.position.copy(latLngToVector(marker.lat, marker.lng, RADIUS * 1.012));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.set(marker.color);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.renderOrder = 2;
    this.globeGroup.add(mesh);
    this.cityMesh = mesh;
  }

  selectCity(target: { lat: number; lng: number } | null): void {
    if (!target) {
      this.beaconTarget = null;
      this.lastBeaconUpdate = 0;
      this.lastBeaconScreen = null;
      this.callbacks.onBeaconScreen(null);
      this.hideMarker();
      if (this.autoRotateEnabled) {
        this.resumeAutoRotateAt = performance.now() + 1500;
      }
      return;
    }

    this.beaconTarget = { lat: target.lat, lng: target.lng };
    this.lastBeaconUpdate = 0;
    this.lastBeaconScreen = null;
    this.focus({ lat: target.lat, lng: target.lng, key: performance.now() });
  }

  focus(target: GlobeFocusTarget): void {
    const local = latLngToVector(target.lat, target.lng, 1);
    const worldDirection = local.clone().applyQuaternion(this.globeGroup.quaternion).normalize();
    const distance = Math.max(3.4, Math.min(this.camera.position.length(), 6.8));
    const to = worldDirection.multiplyScalar(distance);
    this.focusTween = {
      from: this.camera.position.clone(),
      to,
      startedAt: performance.now(),
      duration: this.reducedMotion ? 0 : 950,
    };
    this.controls.autoRotate = false;
    this.resumeAutoRotateAt = Number.POSITIVE_INFINITY;
    this.setMarker(target.lat, target.lng);
  }

  resetView(): void {
    const distance = this.fitDistance();
    const to = new THREE.Vector3(0, distance * 0.13, distance);
    this.focusTween = {
      from: this.camera.position.clone(),
      to,
      startedAt: performance.now(),
      duration: this.reducedMotion ? 0 : 850,
    };
    this.controls.autoRotate = false;
    this.resumeAutoRotateAt = Number.POSITIVE_INFINITY;
    this.hideMarker();
  }

  clearFocusMarker(): void {
    this.hideMarker();
  }

  setAutoRotate(enabled: boolean): void {
    this.autoRotateEnabled = enabled;
    this.controls.autoRotate = enabled;
    this.resumeAutoRotateAt = 0;
  }

  isAutoRotating(): boolean {
    return this.autoRotateEnabled;
  }

  zoomBy(factor: number): void {
    const distance = THREE.MathUtils.clamp(
      this.camera.position.length() * factor,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    this.camera.position.setLength(distance);
    this.controls.update();
  }

  private setMarker(lat: number, lng: number): void {
    const local = latLngToVector(lat, lng, MARKER_RADIUS);
    if (!this.marker) {
      const group = new THREE.Group();
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.024, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffe1a3 }),
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.04, 0.062, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffb38f,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.075, 0.082, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffe1a3,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      group.add(dot, ring, halo);
      this.globeGroup.add(group);
      this.marker = group;
      this.markerRing = ring;
    }
    this.marker.position.copy(local);
    this.marker.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      local.clone().normalize(),
    );
    this.marker.visible = true;
    if (!this.reducedMotion) {
      this.marker.scale.setScalar(1);
    }
  }

  private hideMarker(): void {
    if (this.marker) this.marker.visible = false;
  }

  private handleInteractionStart = (): void => {
    this.hasInteracted = true;
    this.controls.autoRotate = false;
    this.focusTween = null;
    this.resumeAutoRotateAt = Number.POSITIVE_INFINITY;
    this.renderer.domElement.style.cursor = 'grabbing';
  };

  private handleInteractionEnd = (): void => {
    this.renderer.domElement.style.cursor = 'grab';
    if (this.autoRotateEnabled) {
      this.resumeAutoRotateAt = performance.now() + 7000;
    }
  };

  private pointerCoordinates(event: PointerEvent): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private identifyCountry(x: number, y: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const pointer = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const hit = raycaster.intersectObject(this.globeMesh, false)[0];
    if (!hit) return null;
    const local = this.globeMesh.worldToLocal(hit.point.clone());
    const { lat, lng } = vectorToLatLng(local);
    return countryAtPoint(lat, lng);
  }

  private identifyCity(x: number, y: number): string | null {
    if (!this.cityMesh || !this.cityMesh.visible) return null;

    // Los puntos son pequeños: para ratón y especialmente para touch elegimos
    // el marcador visible más cercano dentro de un radio de 16 px.
    let nearest: { id: string; distance: number } | null = null;
    for (const marker of this.cityMarkers) {
      const screen = this.projectCity(marker.lat, marker.lng);
      if (!screen.visible) continue;
      const distance = Math.hypot(screen.x - x, screen.y - y);
      if (distance > 16) continue;
      if (!nearest || distance < nearest.distance) {
        nearest = { id: marker.id, distance };
      }
    }
    return nearest?.id ?? null;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  };

  private handlePointerMove = (event: PointerEvent): void => {
    this.lastPointer = this.pointerCoordinates(event);
    if (this.hoverFrame) return;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      const pointer = this.lastPointer;
      if (!pointer) return;
      const iso2 = this.identifyCountry(pointer.x, pointer.y);
      const changed = iso2 !== this.lastHoverIso;
      const now = performance.now();
      this.renderer.domElement.style.cursor = iso2 ? 'pointer' : 'grab';
      if (!changed && now - this.lastHoverAt < 70) return;
      this.lastHoverIso = iso2;
      this.lastHoverAt = now;
      this.callbacks.onHover(iso2 ? { iso2, x: pointer.x, y: pointer.y } : null);
    });
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (moved > 7 || performance.now() - down.time > 800) return;
    const point = this.pointerCoordinates(event);
    const cityId = this.identifyCity(point.x, point.y);
    if (cityId) {
      this.callbacks.onCityClick(cityId);
      return;
    }
    const iso2 = this.identifyCountry(point.x, point.y);
    this.callbacks.onCountryClick(iso2);
  };

  private handlePointerLeave = (): void => {
    this.lastPointer = null;
    this.lastHoverIso = null;
    this.callbacks.onHover(null);
  };

  private projectCity(lat: number, lng: number): BeaconScreenPosition {
    const local = latLngToVector(lat, lng, RADIUS * 1.035);
    const world = local.applyQuaternion(this.globeGroup.quaternion);
    const normal = world.clone().normalize();
    const cameraDirection = this.camera.position.clone().normalize();
    const frontFacing = normal.dot(cameraDirection) > 0.06;

    this.camera.updateMatrixWorld();
    const projected = world.clone().project(this.camera);
    const x = (projected.x * 0.5 + 0.5) * this.width;
    const y = (-projected.y * 0.5 + 0.5) * this.height;
    const inBounds =
      x > -80 && x < this.width + 80 && y > -80 && y < this.height + 80;

    return {
      x,
      y,
      visible: frontFacing && projected.z < 1 && inBounds,
    };
  }

  private updateBeaconScreen(now: number): void {
    if (!this.beaconTarget) return;
    if (now - this.lastBeaconUpdate < 60) return;
    this.lastBeaconUpdate = now;

    const position = this.projectCity(this.beaconTarget.lat, this.beaconTarget.lng);
    const previous = this.lastBeaconScreen;
    if (
      previous &&
      previous.visible === position.visible &&
      Math.abs(previous.x - position.x) < 0.5 &&
      Math.abs(previous.y - position.y) < 0.5
    ) {
      return;
    }
    this.lastBeaconScreen = position;
    this.callbacks.onBeaconScreen(position);
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const now = performance.now();

    if (
      !this.controls.autoRotate &&
      this.autoRotateEnabled &&
      !this.beaconTarget &&
      now > this.resumeAutoRotateAt
    ) {
      this.controls.autoRotate = true;
    }

    if (this.focusTween) {
      const tween = this.focusTween;
      const elapsed = now - tween.startedAt;
      const progress =
        tween.duration === 0 ? 1 : Math.min(1, Math.max(0, elapsed / tween.duration));
      const eased = easeInOutCubic(progress);
      const fromDirection = tween.from.clone().normalize();
      const toDirection = tween.to.clone().normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(fromDirection.dot(toDirection), -1, 1));
      if (angle > 0.0001) {
        const axis = new THREE.Vector3().crossVectors(fromDirection, toDirection);
        if (axis.lengthSq() < 0.000001) axis.set(0, 1, 0);
        axis.normalize();
        const rotation = new THREE.Quaternion().setFromAxisAngle(axis, angle * eased);
        const direction = fromDirection.clone().applyQuaternion(rotation);
        const distance = THREE.MathUtils.lerp(
          tween.from.length(),
          tween.to.length(),
          eased,
        );
        this.camera.position.copy(direction.multiplyScalar(distance));
      } else {
        this.camera.position.lerpVectors(tween.from, tween.to, eased);
      }
      this.camera.lookAt(0, 0, 0);
      if (progress >= 1) {
        this.focusTween = null;
        this.resumeAutoRotateAt = now + 9000;
      }
    }

    this.controls.update();
    this.updateBeaconScreen(now);

    if (this.marker && this.marker.visible && !this.reducedMotion) {
      const pulse = (Math.sin(now * 0.004) + 1) / 2;
      this.marker.scale.setScalar(1 + pulse * 0.12);
      if (this.markerRing) this.markerRing.material.opacity = 0.6 + pulse * 0.35;
    }

    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const { width, height } = this.measure();
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.hasInteracted) {
      const distance = this.fitDistance();
      this.camera.position.set(0, distance * 0.13, distance);
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    if (this.hoverFrame) cancelAnimationFrame(this.hoverFrame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('start', this.handleInteractionStart);
    this.controls.removeEventListener('end', this.handleInteractionEnd);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.controls.dispose();
    this.texture?.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
        object.geometry.dispose();
        const material = object.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      }
    });
    this.renderer.dispose();
    canvas.remove();
  }
}
