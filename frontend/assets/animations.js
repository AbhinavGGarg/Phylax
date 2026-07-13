// PHYLAX · shared animation system — reveal on scroll, counters, stagger.
(function Animations(){
  var PX = 'reveal';
  var OPTS = { threshold: 0.12, rootMargin: '0px 0px -40px 0px' };

  // ── CSS ────────────────────────────────────────────────
  if(!document.getElementById('phylax-anim-css')){
    var style = document.createElement('style');
    style.id = 'phylax-anim-css';
    style.textContent = [
      '.'+PX+'{opacity:0;transform:translateY(24px);transition:0.55s cubic-bezier(0.22,0.61,0.36,1)}',
      '.'+PX+'.is-visible{opacity:1;transform:translateY(0)}',
      '.rev-fade{opacity:0;transition:0.55s ease}.rev-fade.is-visible{opacity:1}',
      '.rev-up{opacity:0;transform:translateY(24px);transition:0.55s cubic-bezier(0.22,0.61,0.36,1)}.rev-up.is-visible{opacity:1;transform:translateY(0)}',
      '.rev-left{opacity:0;transform:translateX(-20px);transition:0.55s cubic-bezier(0.22,0.61,0.36,1)}.rev-left.is-visible{opacity:1;transform:translateX(0)}',
      '.rev-right{opacity:0;transform:translateX(20px);transition:0.55s cubic-bezier(0.22,0.61,0.36,1)}.rev-right.is-visible{opacity:1;transform:translateX(0)}',
      '.d1{transition-delay:60ms}.d2{transition-delay:120ms}.d3{transition-delay:180ms}.d4{transition-delay:240ms}.d5{transition-delay:300ms}.d6{transition-delay:360ms}.d7{transition-delay:420ms}.d8{transition-delay:480ms}.d9{transition-delay:540ms}.d10{transition-delay:600ms}',
      '.rev-scale{opacity:0;transform:scale(0.94);transition:0.5s cubic-bezier(0.22,0.61,0.36,1)}.rev-scale.is-visible{opacity:1;transform:scale(1)}',
      '@media(prefers-reduced-motion:reduce){.reveal,.rev-fade,.rev-up,.rev-left,.rev-right,.rev-scale{opacity:1!important;transform:none!important;transition:none!important}}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── reveal observer ────────────────────────────────────
  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){
        e.target.classList.add('is-visible');
      }
    });
  }, OPTS);

  function observeAll(){
    document.querySelectorAll('.'+PX+', .rev-fade, .rev-up, .rev-left, .rev-right, .rev-scale').forEach(function(el){
      observer.observe(el);
    });
  }

  // ── counter animation ──────────────────────────────────
  function animateCount(el, target, decimals, duration){
    decimals = decimals || 0;
    duration = duration || 800;
    var start = null;
    var isFloat = decimals > 0;
    function step(t){
      if(!start) start = t;
      var p = Math.min(1, (t - start) / duration);
      var eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      var val = isFloat ? (target * eased).toFixed(decimals) : Math.round(target * eased);
      el.textContent = val + (isFloat ? '%' : '');
      if(p < 1) requestAnimationFrame(step);
      else el.textContent = isFloat ? target.toFixed(decimals) + '%' : target;
    }
    requestAnimationFrame(step);
    // safety net: guarantee the final value even if rAF is throttled mid-count
    setTimeout(function(){ el.textContent = isFloat ? target.toFixed(decimals) + '%' : target; }, duration + 300);
  }

  // ── counter observer ──────────────────────────────────
  var countersRan = new WeakSet();
  var counterObserver = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(!e.isIntersecting || countersRan.has(e.target)) return;
      countersRan.add(e.target);
      var target = parseFloat(e.target.dataset.count);
      var decimals = parseInt(e.target.dataset.decimals) || 0;
      if(!isNaN(target)) animateCount(e.target, target, decimals, 1000);
    });
  }, { threshold: 0.5 });

  function observeCounters(){
    document.querySelectorAll('[data-count]').forEach(function(el){
      counterObserver.observe(el);
    });
  }

  // ── safety net: never leave above-the-fold content hidden ──
  // (IntersectionObserver can be slow/throttled on first paint; reveal anything
  //  already in the initial viewport immediately so the hero is never blank.)
  function revealInView(){
    var vh = window.innerHeight || 800;
    document.querySelectorAll('.'+PX+', .rev-fade, .rev-up, .rev-left, .rev-right, .rev-scale').forEach(function(el){
      if(el.getBoundingClientRect().top < vh * 0.95) el.classList.add('is-visible');
    });
  }

  // ── run ────────────────────────────────────────────────
  observeAll();
  observeCounters();
  revealInView();
  setTimeout(revealInView, 60);
  window.addEventListener('load', revealInView);

  // re-run on DOM changes (for dynamic content)
  window._animRefresh = function(){
    observeAll();
    observeCounters();
  };

  // expose for console.js
  window._animAnimateCount = animateCount;
})();
