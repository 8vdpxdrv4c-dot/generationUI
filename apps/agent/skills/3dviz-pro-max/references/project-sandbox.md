# CopilotKit sandbox adapter

Use this adapter for chat output. The Vite scaffold, kits and rigs are source
references; they are not modules hosted at their skill-directory paths.

## Translate packaged code

- Move stylesheet rules into `css` and body content into `html`.
- Turn module exports and application startup into named functions in
  `jsFunctions`; put dynamic imports inside an async initializer. Start it from
  `jsExpressions` with a caught promise. Never paste Vite entrypoints or React JSX.
- Adapt only the geometry/rig code needed. Replace relative imports with included
  functions; import addons through `three/addons/...`. Do not mix a pinned template
  Three.js version with the host's pinned `three` importmap. The host serves
  Three.js core and addons from the same local npm release; keep bare imports
  (`three`, `three/addons/...`) rather than hard-coding CDN URLs.
- CSP permits local application resources only. Use the supplied local importmap;
  never request scripts, modules or fonts from external CDNs.
  Do not assume `postprocessing` is installed or mapped; prefer core rendering
  unless an optional module and its Three.js compatibility are verified.
- Disk paths, skill GLBs and relative `./scene.glb` URLs cannot be loaded by the
  iframe. Use the full supplied access URL for uploaded models, preserving it;
  the host allows its upload origin. Use procedural geometry when no usable asset
  URL exists. Do not invent URLs or assume arbitrary external texture hosts are
  allowed (image CSP is limited to self/data/blob plus the upload origin).
- Chat navigation uses `await Websandbox.connection.remote.sendPrompt({ text })`
  or `await Websandbox.connection.remote.openLink({ url })` (https only), inside
  async functions. Never access the parent document directly.

## Rendering lifecycle

Give the viewport an explicit responsive height; size from its container with
ResizeObserver and update camera aspect/projection after resizing. Cap pixel ratio
at 2. Render a first frame before marking readiness. For a static scene, invalidate
on controls/resize/state changes; for animation, provide pause/reset and honor
prefers-reduced-motion. Avoid adding decorative motion just to keep a loop alive.

Before reinitializing, cancel animation frames, disconnect observers, dispose
controls, geometries, materials, textures and renderer, and remove old listeners.
Also clean up on pagehide. Report WebGL/import errors in Chinese in the widget.
Keep state authoritative so reset and inspection views update both scene and labels.
`window.__sceneReady` and `window.__viewer` are optional inspection hooks; they do
not mean a browser inspection has occurred. The standalone `capture.py --dir dist`
workflow does not capture a chat iframe.

## Minimal parameter example

This static cube is an integration starting point, not a finished scene. Add the
requested subject, interactions and scene-specific disposal when adapting it.
Use `initialHeight: 380` and Chinese `placeholderMessages`, for example
`["正在搭建三维场景…", "正在调整光线…"]`.

css parameter:

```css
.viz { color: var(--color-text-primary); font-family: var(--font-sans); }
.viz-view { height: clamp(240px, 50vw, 340px); width: 100%; overflow: hidden;
  border: 1px solid var(--color-border-tertiary); border-radius: var(--border-radius-lg); }
.viz-view canvas { display: block; width: 100%; height: 100%; }
.viz-status { color: var(--color-text-secondary); }
```

html parameter:

```html
<section class="viz" aria-label="三维模型">
  <div id="viz-view" class="viz-view"></div>
  <p id="viz-status" class="viz-status" role="status">正在初始化场景…</p>
</section>
```

jsFunctions:

```js
function showSceneError(error) {
  console.error(error);
  const status = document.getElementById('viz-status');
  if (status) status.textContent = '场景加载失败，请重试。';
}
async function initScene() {
  window.__disposeScene?.();
  const THREE = await import('three');
  const container = document.getElementById('viz-view');
  if (!container?.isConnected) return;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(3, 2, 4);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.replaceChildren(renderer.domElement);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x4f8cc9, roughness: 0.55 });
  scene.add(new THREE.Mesh(geometry, material));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(3, 4, 2);
  scene.add(light);
  let disposed = false;
  function render() {
    if (disposed) return;
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    window.__sceneReady = true;
  }
  const observer = new ResizeObserver(render);
  function dispose() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    window.removeEventListener('pagehide', dispose);
    window.__sceneReady = false;
    if (window.__disposeScene === dispose) delete window.__disposeScene;
  }
  window.__disposeScene = dispose;
  window.addEventListener('pagehide', dispose, { once: true });
  observer.observe(container);
  render();
  document.getElementById('viz-status').textContent = '三维模型已加载';
}
```

jsExpressions: `["initScene().catch(showSceneError);"]`.

For real orbit interaction, dynamically import OrbitControls in initScene, bind
it to the canvas, redraw on change and dispose it during cleanup. If damping or
motion requires a loop, schedule frames only while needed. A minimal integration
example does not replace inspection of the requested output.
