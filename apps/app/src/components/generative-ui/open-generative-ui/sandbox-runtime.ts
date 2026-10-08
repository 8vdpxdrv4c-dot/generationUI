/** Installed before generated scripts, with a bounded canvas allocation budget. */
export const SANDBOX_RUNTIME_JS = `
(function() {
  if (window.__oguiRuntimeInstalled) return;
  window.__oguiRuntimeInstalled = true;
  var stopped = false;
  var frames = new Set(), timers = new Set(), intervals = new Set(), observers = new Set(), contexts = new Set();
  var raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = function(callback) {
    if (stopped) return 0;
    var id = raf(function(time) { frames.delete(id); if (!stopped) callback(time); });
    frames.add(id); return id;
  };
  window.cancelAnimationFrame = function(id) { frames.delete(id); cancel(id); };
  var timeout = window.setTimeout.bind(window), clearTimeoutNative = window.clearTimeout.bind(window);
  window.setTimeout = function(callback, delay) {
    if (stopped) return 0;
    var args = Array.prototype.slice.call(arguments, 2);
    var id = timeout(function() { timers.delete(id); if (!stopped) { if (typeof callback === 'function') callback.apply(window, args); else (0, eval)(callback); } }, delay);
    timers.add(id); return id;
  };
  window.clearTimeout = function(id) { timers.delete(id); clearTimeoutNative(id); };
  var interval = window.setInterval.bind(window), clearIntervalNative = window.clearInterval.bind(window);
  window.setInterval = function() { if (stopped) return 0; var id = interval.apply(window, arguments); intervals.add(id); return id; };
  window.clearInterval = function(id) { intervals.delete(id); clearIntervalNative(id); };
  ['ResizeObserver', 'MutationObserver', 'IntersectionObserver'].forEach(function(name) {
    var Native = window[name];
    if (!Native) return;
    window[name] = class extends Native {
      constructor(callback) { super(function() { if (!stopped) callback.apply(null, arguments); }); observers.add(this); }
      disconnect() { observers.delete(this); super.disconnect(); }
    };
  });
  ['width', 'height'].forEach(function(key) {
    var descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, key);
    Object.defineProperty(HTMLCanvasElement.prototype, key, {
      configurable: true, enumerable: descriptor.enumerable, get: descriptor.get,
      set: function(value) {
        var bounded = Math.min(2048, Math.max(1, Math.floor(Number(value) || 1)));
        // Avoid re-allocating the backing store on every ResizeObserver tick.
        if (descriptor.get.call(this) !== bounded) descriptor.set.call(this, bounded);
      }
    });
  });
  var getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type) {
    var context = getContext.apply(this, arguments);
    if (context && /^webgl/.test(type)) contexts.add(context);
    return context;
  };
  ['WebGLRenderingContext', 'WebGL2RenderingContext'].forEach(function(name) {
    var Native = window[name];
    if (!Native) return;
    var viewport = Native.prototype.viewport;
    Native.prototype.viewport = function(x, y, width, height) {
      // Three.js remembers the requested pixel size. Fit the default viewport
      // to the actual bounded buffer so large/high-DPI scenes are not cropped.
      if (x === 0 && y === 0 && this.getParameter(this.FRAMEBUFFER_BINDING) === null) {
        width = Math.min(width, this.drawingBufferWidth);
        height = Math.min(height, this.drawingBufferHeight);
      }
      return viewport.call(this, x, y, width, height);
    };
  });
  window.__oguiDispose = function() {
    if (stopped) return;
    stopped = true;
    try { window.__disposeScene?.(); } catch (error) { console.warn(error); }
    frames.forEach(cancel); timers.forEach(clearTimeoutNative); intervals.forEach(clearIntervalNative);
    observers.forEach(function(observer) { observer.disconnect(); });
    contexts.forEach(function(context) { try { context.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {} });
    frames.clear(); timers.clear(); intervals.clear(); observers.clear(); contexts.clear();
  };
  window.addEventListener('pagehide', window.__oguiDispose, {once:true});
})();`;
