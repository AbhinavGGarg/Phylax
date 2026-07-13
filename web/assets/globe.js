// PHYLAX · cobe rotating globe — blue earth, black arcs/markers.
(function() {
  var frame = document.querySelector('.globe-wrap') || document.querySelector('.globe-frame');
  var canvas = frame && frame.querySelector('canvas');
  if (!canvas) return;

  var globe = null, animId, phi = 0;
  var pointerDown = null;
  var dragPhi = 0, dragTheta = 0;
  var offsetPhi = 0, offsetTheta = 0;
  var isDragging = false;
  var speed = 0.004;

  var markers = [
    { location: [38.95, -77.45] },
    { location: [37.62, -122.38] },
    { location: [49.01, 2.55] },
    { location: [35.55, 139.78] },
    { location: [-33.95, 151.18] },
    { location: [-23.43, -46.47] },
    { location: [1.36, 103.99] },
    { location: [19.09, 72.87] },
  ];

  var arcs = [
    { from: [38.95, -77.45], to: [49.01, 2.55] },
    { from: [37.62, -122.38], to: [35.55, 139.78] },
    { from: [49.01, 2.55], to: [1.36, 103.99] },
    { from: [38.95, -77.45], to: [-23.43, -46.47] },
    { from: [35.55, 139.78], to: [-33.95, 151.18] },
    { from: [49.01, 2.55], to: [19.09, 72.87] },
    { from: [37.62, -122.38], to: [1.36, 103.99] },
  ];

  function create() {
    var w = frame.offsetWidth;
    if (!w || globe) return;
    globe = window.createGlobe(canvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width: w, height: w,
      phi: 0, theta: 0.2,
      dark: 0, diffuse: 1.5,
      mapSamples: 16000, mapBrightness: 10,
      baseColor: [0.15, 0.28, 0.85],
      markerColor: [0, 0, 0],
      glowColor: [0.2, 0.35, 0.9],
      markerElevation: 0.02,
      markers: markers.map(function(m) { return { location: m.location, size: 0.014 }; }),
      arcs: arcs.map(function(a) { return { from: a.from, to: a.to }; }),
      arcColor: [0, 0, 0],
      arcWidth: 0.4, arcHeight: 0.22, opacity: 0.9,
    });

    function animate() {
      if (!isDragging) phi += speed;
      if (globe) globe.update({ phi: phi + offsetPhi + dragPhi, theta: 0.2 + offsetTheta + dragTheta });
      animId = requestAnimationFrame(animate);
    }
    animate();
    setTimeout(function() { canvas.style.opacity = '1'; }, 100);
  }

  function onPointerDown(e) {
    pointerDown = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
    isDragging = true;
  }

  function onPointerMove(e) {
    if (!pointerDown) return;
    dragPhi = (e.clientX - pointerDown.x) / 300;
    dragTheta = (e.clientY - pointerDown.y) / 1000;
  }

  function onPointerUp() {
    if (pointerDown) { offsetPhi += dragPhi; offsetTheta += dragTheta; dragPhi = 0; dragTheta = 0; }
    pointerDown = null;
    canvas.style.cursor = 'grab';
    isDragging = false;
  }

  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp);

  function boot() {
    if (!window.createGlobe) { setTimeout(boot, 80); return; }
    if (frame.offsetWidth > 0) { create(); return; }
    var ro = new ResizeObserver(function(entries) {
      if (entries[0] && entries[0].contentRect.width > 0) { ro.disconnect(); create(); }
    });
    ro.observe(frame);
  }

  boot();

  window._globeCleanup = function() {
    if (animId) cancelAnimationFrame(animId);
    if (globe) globe.destroy();
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };
})();
