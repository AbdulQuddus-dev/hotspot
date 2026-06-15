/*
 * ════════════════════════════════════════════════════════════════
 *  custom.js — محرك بوابة الأزرق نت
 *  MikroTik RouterOS Hotspot
 *
 *  تسلسل الأنيميشن (مطابق للفيديو):
 *  ──────────────────────────────────────────────
 *  ث 0 → 4.0 : الفيديو يعمل، الفورم مخفي تماماً
 *  ث 4.0      : 1) يظهر ظل الحقيبة فوراً (briefcase-shadow)
 *               2) بعد تأخير قصير (BRIEFCASE_TO_RISE_DELAY)
 *                  تبدأ الحقول حركة ارتفاع/تكبر واحدة سلسة
 *                  ومتصلة من نقطة الحقيبة إلى الموضع النهائي
 *  ث 5.5      : الحقول في موضعها وحجمها النهائي تماماً
 *  ث 7 → 9   : الرجل يتكئ، الفورم ثابت
 *  بعد SHADOW_FADE_DELAY: يتلاشى ظل الحقيبة تدريجياً
 *  عند ended  : الفيديو يتجمد على آخر إطار
 * ════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  /* ════════════════════════════════════════════
     الإعدادات — عدّل FORM_START_SEC ليطابق فيديوك
  ════════════════════════════════════════════ */
  var CFG = {
    /* الثانية التي تبدأ عندها الحركة (بزوغ من الحقيبة) */
    FORM_START_SEC : 5.0,

    /*
     * تأخير صغير بين ظهور الظل وبدء ارتفاع الحقول
     * لإعطاء إحساس أن الحقول "خرجت" من الحقيبة فعلياً
     */
    BRIEFCASE_TO_RISE_DELAY : 120,

    /*
     * مدة حركة "الطيران والاستقرار" الكاملة بالميلي ثانية
     * يجب أن تطابق مدة @keyframes riseAndLand في style.css
     * (سرعة متوسطة = 2600ms / 2.6 ثانية)
     */
    RISE_DURATION : 2600,

    /*
     * تأخير بدء تلاشي ظل الحقيبة (من بداية startSequence)
     * مضبوط ليبدأ التلاشي مع اقتراب الحقول من الهبوط والاستقرار
     * (حوالي 88% من RISE_DURATION + BRIEFCASE_TO_RISE_DELAY)
     */
    SHADOW_FADE_DELAY : 2300,

    /* مهلة احتياطية كاملة إذا فشل الفيديو */
    FALLBACK_MS : 6500,

    /* حماية Brute Force */
    MAX_ATTEMPTS    : 5,
    ATTEMPT_WIN_MS  : 60000,
    LOCKOUT_MS      : 120000,
  };

  /* ════════════════════════════════════════════
     1. مرجعيات DOM
  ════════════════════════════════════════════ */
  var video   = document.getElementById('bgVideo');
  var popup   = document.getElementById('formPopup');
  var shadow  = document.getElementById('briefcaseShadow');
  var started = false;

  /* ════════════════════════════════════════════
     2. تشغيل تسلسل الأنيميشن الكامل
  ════════════════════════════════════════════ */
  function startSequence() {
    if (started) return;
    started = true;

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      /* بلا حركة: أظهر الفورم فوراً وتجاهل ظل الحقيبة */
      if (popup) popup.classList.add('anim-rise');
      var inp = document.getElementById('cardNumber');
      if (inp) inp.focus();
      return;
    }

    /* الخطوة 1: إظهار ظل الحقيبة فوراً */
    if (shadow) shadow.classList.add('is-visible');

    /* الخطوة 2: بعد تأخير قصير — ارتفاع الحقول دفعة واحدة وبسلاسة */
    setTimeout(function () {
      if (popup) popup.classList.add('anim-rise');

      /* تركيز على حقل الكرت بعد اكتمال الحركة */
      setTimeout(function () {
        var inp2 = document.getElementById('cardNumber');
        if (inp2) inp2.focus();
      }, CFG.RISE_DURATION + 80);

    }, CFG.BRIEFCASE_TO_RISE_DELAY);

    /* الخطوة 3: تلاشي ظل الحقيبة تدريجياً بعد ظهور الحقول */
    setTimeout(function () {
      if (shadow) {
        shadow.classList.remove('is-visible');
        shadow.classList.add('is-fading');
      }
    }, CFG.SHADOW_FADE_DELAY);
  }

  /* ════════════════════════════════════════════
     3. الفيديو — مراقبة timeupdate والتجميد
  ════════════════════════════════════════════ */

  /* المؤقت الاحتياطي — يعمل دائماً على كل الأجهزة */
  var fallbackTimer = setTimeout(function () {
    startSequence();
  }, CFG.FALLBACK_MS);

  if (video) {

    /*
     * تأكيد عدم التكرار — الفيديو يجب أن يعمل مرة واحدة فقط
     * ثم يتجمد على آخر إطار ولا يعود للبداية أبداً
     */
    video.loop = false;
    video.removeAttribute('loop');

    /* إخفاء الفيديو حتى يكون جاهزاً لتجنب الوميض */
    video.style.opacity = '0';
    video.style.transition = 'opacity 0.35s ease';

    video.addEventListener('loadeddata', function () {
      video.style.opacity = '1';
    });

    video.addEventListener('canplay', function () {
      video.style.opacity = '1';
    });

    /*
     * timeupdate — يُطلَق كل ~250ms
     * نراقب الثانية المحددة لبدء تسلسل الأنيميشن
     */
    video.addEventListener('timeupdate', function () {
      if (!started && video.currentTime >= CFG.FORM_START_SEC) {
        clearTimeout(fallbackTimer);
        startSequence();
      }
    });

    /*
     * ended — تجميد الفيديو على آخر إطار نهائياً
     * ───────────────────────────────────────────
     * 1) نرجع خطوتين بسيطتين قبل النهاية (لتجنب الإطار
     *    الأسود الذي يظهر أحياناً عند currentTime === duration)
     * 2) نوقف التشغيل فوراً
     * 3) "قفل تجميد" دائم: أي محاولة لاحقة لتشغيل الفيديو
     *    (مثلاً تركيز المستخدم على التبويب من جديد) تُرفض
     *    ويُعاد إيقافه فوراً عند نفس الإطار الأخير
     */
    var FREEZE_LOCK = false;

    video.addEventListener('ended', function () {
      FREEZE_LOCK = true;
      if (video.duration && isFinite(video.duration)) {
        video.currentTime = video.duration - 0.06;
      }
      video.pause();
      /* إكمال الأنيميشن إذا لم يبدأ بعد */
      if (!started) startSequence();
    });

    /* بعد إتمام أي seek (مثل التجميد أعلاه) — تأكد من البقاء متوقفاً */
    video.addEventListener('seeked', function () {
      if (FREEZE_LOCK) video.pause();
    });

    /* لو حاول المتصفح إعادة التشغيل تلقائياً بعد التجميد — أوقفه فوراً */
    video.addEventListener('play', function () {
      if (FREEZE_LOCK) video.pause();
    });

    /*
     * error — إذا فشل الفيديو في التحميل
     */
    video.addEventListener('error', function () {
      clearTimeout(fallbackTimer);
      startSequence();
    });

    /*
     * محاولة تشغيل autoplay
     */
    var playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(function () {
        /* autoplay ممنوع — أظهر الفورم فوراً */
        clearTimeout(fallbackTimer);
        startSequence();
      });
    }

  } else {
    /* لا يوجد فيديو — اختبار محلي */
    clearTimeout(fallbackTimer);
    setTimeout(startSequence, 400);
  }

  /* ════════════════════════════════════════════
     4. Rate Limiting (Brute Force Protection)
  ════════════════════════════════════════════ */
  var SS_ATTEMPTS = 'az_login_attempts';
  var SS_LOCKOUT  = 'az_login_lockout';

  function getAttempts() {
    try { return JSON.parse(sessionStorage.getItem(SS_ATTEMPTS)||'[]'); } catch(e){ return []; }
  }

  function isLockedOut() {
    try {
      var t = parseInt(sessionStorage.getItem(SS_LOCKOUT)||'0',10);
      if (!t) return false;
      if (Date.now() < t) return true;
      sessionStorage.removeItem(SS_LOCKOUT);
      sessionStorage.removeItem(SS_ATTEMPTS);
      return false;
    } catch(e){ return false; }
  }

  function recordAttempt() {
    var now  = Date.now();
    var list = getAttempts().filter(function(t){ return (now-t) < CFG.ATTEMPT_WIN_MS; });
    list.push(now);
    try { sessionStorage.setItem(SS_ATTEMPTS, JSON.stringify(list)); } catch(e){}
    if (list.length >= CFG.MAX_ATTEMPTS) {
      try { sessionStorage.setItem(SS_LOCKOUT, String(now + CFG.LOCKOUT_MS)); } catch(e){}
      return false;
    }
    return true;
  }

  function showRateError(msg) {
    var b = document.getElementById('errorBanner');
    var t = document.getElementById('errorText');
    if (b) { b.style.display = 'flex'; if (t) t.textContent = msg; }
    var btn = document.getElementById('connectBtn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  }

  window.rateLimitCheck = function () {
    if (isLockedOut()) {
      showRateError('تم تجاوز الحد المسموح. انتظر ' + Math.ceil(CFG.LOCKOUT_MS/60000) + ' دقائق.');
      return false;
    }
    return recordAttempt();
  };

  /* ════════════════════════════════════════════
     5. CSRF Token خفي
  ════════════════════════════════════════════ */
  (function injectCSRF() {
    var form = document.getElementById('loginForm');
    if (!form) return;
    var inp = document.createElement('input');
    inp.type = 'hidden';
    inp.name = '_t';
    inp.value = Math.random().toString(36).slice(2) + Date.now().toString(36);
    form.appendChild(inp);
  })();

  /* ════════════════════════════════════════════
     6. Anti-Frame (Clickjacking Layer 2)
  ════════════════════════════════════════════ */
  if (window.top !== window.self) {
    try { window.top.location.replace(window.self.location.href); } catch(e) {}
  }

  /* ════════════════════════════════════════════
     7. منع DevTools
  ════════════════════════════════════════════ */
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  document.addEventListener('keydown', function(e){
    if (e.key==='F12') { e.preventDefault(); return false; }
    if (e.ctrlKey && e.shiftKey && /^[IJC]$/i.test(e.key)) { e.preventDefault(); return false; }
    if (e.ctrlKey && /^U$/i.test(e.key)) { e.preventDefault(); return false; }
  });

  /* ════════════════════════════════════════════
     8. منع Double Submit
  ════════════════════════════════════════════ */
  var submitted = false;
  document.addEventListener('submit', function(e){
    if (submitted) { e.preventDefault(); return; }
    submitted = true;
    setTimeout(function(){ submitted = false; }, 8000);
  });

  /* ════════════════════════════════════════════
     9. Canvas — جسيمات خلفية خفيفة
     (في صفحة login فقط)
  ════════════════════════════════════════════ */
  (function initParticles() {
    if (!document.body.classList.contains('page-login')) return;
    var canvas = document.getElementById('particleCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var pts = [], N = 20, active = true;

    function resize() { canvas.width=window.innerWidth; canvas.height=window.innerHeight; }
    resize();
    window.addEventListener('resize', resize, {passive:true});

    for (var i=0;i<N;i++) pts.push({
      x: Math.random()*canvas.width,
      y: Math.random()*canvas.height,
      r: Math.random()*1.7+0.4,
      vx: (Math.random()-.5)*0.32,
      vy: -(Math.random()*0.45+0.12),
      a: Math.random()*0.42+0.14
    });

    function draw() {
      if (!active) return;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      for (var a=0;a<pts.length;a++) {
        var p=pts[a];
        p.x+=p.vx; p.y+=p.vy;
        if (p.y<-4){ p.y=canvas.height+4; p.x=Math.random()*canvas.width; }
        if (p.x<-4) p.x=canvas.width+4;
        if (p.x>canvas.width+4) p.x=-4;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(59,155,255,'+p.a+')'; ctx.fill();
      }
      for (var a2=0;a2<pts.length-1;a2++) {
        for (var b=a2+1;b<pts.length;b++) {
          var dx=pts[a2].x-pts[b].x, dy=pts[a2].y-pts[b].y;
          var dist=Math.sqrt(dx*dx+dy*dy);
          if (dist<110) {
            ctx.beginPath();
            ctx.moveTo(pts[a2].x,pts[a2].y); ctx.lineTo(pts[b].x,pts[b].y);
            ctx.strokeStyle='rgba(59,155,255,'+((1-dist/110)*0.13)+')';
            ctx.lineWidth=0.7; ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(draw);
    }

    document.addEventListener('visibilitychange', function(){
      active = !document.hidden;
      if (active) requestAnimationFrame(draw);
    });
  })();

  /* ════════════════════════════════════════════
     10. Prefetch alogin.html
  ════════════════════════════════════════════ */
  (function() {
    var l=document.createElement('link'); l.rel='prefetch'; l.href='alogin.html';
    document.head.appendChild(l);
  })();

})();
