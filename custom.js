/*
 * ════════════════════════════════════════════════════════════════
 *  custom.js — محرك بوابة الأزرق نت
 *  MikroTik RouterOS Hotspot
 *
 *  المهام:
 *  1. تشغيل الفيديو مرة واحدة (no loop) + تجميده على آخر إطار
 *  2. انبثاق الفورم عند الثانية 4 بالضبط (timeupdate)
 *  3. جسيمات canvas خفيفة في الخلفية
 *  4. Rate Limiting (حماية Brute Force) على مستوى المتصفح
 *  5. حماية Anti-Frame + منع DevTools
 *  6. إصلاح اتجاه الحقول الرقمية (RTL/LTR)
 *  7. منع Double Submit
 * ════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  /* ════════════════════════════════════════════
     الإعدادات — عدّلها حسب مدة فيديوك
  ════════════════════════════════════════════ */
  var CFG = {
    /*
     * الثانية التي يظهر فيها الفورم (بالثواني — ليس ms)
     * 4.0 = الثانية الرابعة من الفيديو
     * عدّلها حتى تتطابق مع لحظة فتح الحقيبة/إشارة اليد
     */
    FORM_SHOW_AT_SEC  : 4.0,

    /*
     * مهلة احتياطية (ms) إذا فشل الفيديو أو لم يُشغَّل
     * 6000 = 6 ثوانٍ
     */
    FALLBACK_DELAY_MS : 6000,

    /* حماية Brute Force */
    MAX_ATTEMPTS      : 5,
    ATTEMPT_WINDOW_MS : 60000,   /* دقيقة واحدة */
    LOCKOUT_MS        : 120000,  /* دقيقتان */
  };

  /* ════════════════════════════════════════════
     1. الفيديو + توقيت الانبثاق
  ════════════════════════════════════════════ */
  var video     = document.getElementById('bgVideo');
  var overlay   = document.getElementById('loginFormOverlay');
  var formShown = false;

  /** تُظهر عناصر الفورم بأنيميشن pop-up */
  function showForm() {
    if (formShown || !overlay) return;
    formShown = true;
    overlay.classList.add('is-visible');

    /* تركيز تلقائي على حقل الكرت */
    var cardInput = document.getElementById('cardNumber');
    if (cardInput) {
      setTimeout(function () { cardInput.focus(); }, 80);
    }
  }

  /* المؤقت الاحتياطي — يعمل دائماً */
  var fallbackTimer = setTimeout(showForm, CFG.FALLBACK_DELAY_MS);

  if (video) {

    /* إخفاء الفيديو حتى يبدأ التشغيل لتجنب الوميض */
    video.style.opacity = '0';
    video.style.transition = 'opacity 0.4s ease';

    /* عند جاهزية الفيديو للتشغيل */
    video.addEventListener('loadeddata', function () {
      video.style.opacity = '1';
    });

    video.addEventListener('canplay', function () {
      video.style.opacity = '1';
    });

    /*
     * ── الحدث الرئيسي: timeupdate ──
     * يُطلَق كل ~250ms أثناء التشغيل
     * نتحقق من وصول الفيديو للثانية المحددة
     */
    video.addEventListener('timeupdate', function () {
      if (!formShown && video.currentTime >= CFG.FORM_SHOW_AT_SEC) {
        clearTimeout(fallbackTimer);
        showForm();
      }
    });

    /*
     * ── تجميد الفيديو على آخر إطار ──
     * عند الوصول لنهاية الفيديو: نوقف + نضع currentTime
     * على آخر لحظة لمنع الشاشة السوداء
     * loop = false (لا يوجد loop في HTML)
     */
    video.addEventListener('ended', function () {
      /* ارجع خطوة صغيرة قبل النهاية لتجنب الإطار الأسود */
      video.currentTime = video.duration - 0.05;
      video.pause();
      showForm(); /* تأكيد الظهور إذا لم يكن قد ظهر */
    });

    /*
     * ── احتياطي: إذا فشل الفيديو ──
     * المتصفح يمنع Autoplay أو الملف غير موجود
     */
    video.addEventListener('error', function () {
      clearTimeout(fallbackTimer);
      showForm();
    });

    /*
     * محاولة تشغيل الفيديو تلقائياً
     * بعض المتصفحات تمنع حتى muted + autoplay في بعض الحالات
     */
    var playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(function () {
        /* إذا فشل التشغيل — أظهر الفورم فوراً */
        clearTimeout(fallbackTimer);
        showForm();
      });
    }

  } else {
    /* لا يوجد عنصر فيديو (مثلاً اختبار محلي) */
    clearTimeout(fallbackTimer);
    showForm();
  }

  /* ════════════════════════════════════════════
     2. Rate Limiting — Brute Force Protection
     (مستوى المتصفح — لا يُغني عن حماية السيرفر)
  ════════════════════════════════════════════ */
  var LS_ATTEMPTS = 'az_login_attempts';
  var LS_LOCKOUT  = 'az_login_lockout';

  function getAttempts() {
    try { return JSON.parse(sessionStorage.getItem(LS_ATTEMPTS) || '[]'); }
    catch (e) { return []; }
  }

  function isLockedOut() {
    try {
      var t = parseInt(sessionStorage.getItem(LS_LOCKOUT) || '0', 10);
      if (!t) return false;
      if (Date.now() < t) return true;
      sessionStorage.removeItem(LS_LOCKOUT);
      sessionStorage.removeItem(LS_ATTEMPTS);
      return false;
    } catch (e) { return false; }
  }

  function recordAttempt() {
    var now  = Date.now();
    var list = getAttempts().filter(function (t) {
      return (now - t) < CFG.ATTEMPT_WINDOW_MS;
    });
    list.push(now);
    try { sessionStorage.setItem(LS_ATTEMPTS, JSON.stringify(list)); } catch(e){}
    if (list.length >= CFG.MAX_ATTEMPTS) {
      try { sessionStorage.setItem(LS_LOCKOUT, String(now + CFG.LOCKOUT_MS)); } catch(e){}
      return false;
    }
    return true;
  }

  function showRateError(msg) {
    var banner  = document.getElementById('errorBanner');
    var errText = document.getElementById('errorText');
    if (banner) {
      banner.style.display = 'flex';
      if (errText) errText.textContent = msg;
    }
    var btn = document.getElementById('connectBtn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  }

  /** يُستدعى من handleLogin في login.html */
  window.rateLimitCheck = function () {
    if (isLockedOut()) {
      var remaining = Math.ceil(CFG.LOCKOUT_MS / 60000);
      showRateError('تم تجاوز الحد المسموح. حاول مجدداً بعد ' + remaining + ' دقائق.');
      return false;
    }
    return recordAttempt();
  };

  /* ════════════════════════════════════════════
     3. حقن CSRF Token خفي في النموذج
  ════════════════════════════════════════════ */
  (function injectCSRF() {
    var form = document.getElementById('loginForm');
    if (!form) return;
    var token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    var inp = document.createElement('input');
    inp.type = 'hidden';
    inp.name = '_t';
    inp.value = token;
    form.appendChild(inp);
  })();

  /* ════════════════════════════════════════════
     4. Anti-Frame (Clickjacking Layer 2)
  ════════════════════════════════════════════ */
  if (window.top !== window.self) {
    try { window.top.location.replace(window.self.location.href); } catch(e){}
  }

  /* ════════════════════════════════════════════
     5. منع DevTools (طبقة رادعة)
  ════════════════════════════════════════════ */
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'F12') { e.preventDefault(); return false; }
    if (e.ctrlKey && e.shiftKey && /^[IJC]$/i.test(e.key)) {
      e.preventDefault(); return false;
    }
    if (e.ctrlKey && /^U$/i.test(e.key)) { e.preventDefault(); return false; }
  });

  /* ════════════════════════════════════════════
     6. منع Double Submit
  ════════════════════════════════════════════ */
  var formSubmitted = false;
  document.addEventListener('submit', function (e) {
    if (formSubmitted) { e.preventDefault(); return; }
    formSubmitted = true;
    setTimeout(function () { formSubmitted = false; }, 8000);
  });

  /* ════════════════════════════════════════════
     7. Canvas — جسيمات الخلفية الخفيفة
     (22 جسيماً فقط للأداء المثالي على الهواتف)
  ════════════════════════════════════════════ */
  (function initParticles() {
    /* نتأكد أننا في صفحة login فقط */
    if (!document.body.classList.contains('page-login')) return;

    var canvas = document.getElementById('particleCanvas');
    if (!canvas) return;

    var ctx        = canvas.getContext('2d');
    var particles  = [];
    var COUNT      = 22;
    var animActive = true;

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* إنشاء الجسيمات */
    for (var i = 0; i < COUNT; i++) {
      particles.push({
        x     : Math.random() * canvas.width,
        y     : Math.random() * canvas.height,
        r     : Math.random() * 1.8 + 0.4,
        vx    : (Math.random() - 0.5) * 0.35,
        vy    : -(Math.random() * 0.5 + 0.15),
        alpha : Math.random() * 0.45 + 0.15,
      });
    }

    function drawFrame() {
      if (!animActive) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (var a = 0; a < particles.length; a++) {
        var p = particles[a];
        p.x += p.vx;
        p.y += p.vy;

        if (p.y < -4) { p.y = canvas.height + 4; p.x = Math.random() * canvas.width; }
        if (p.x < -4) p.x = canvas.width  + 4;
        if (p.x > canvas.width + 4)  p.x = -4;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59,155,255,' + p.alpha + ')';
        ctx.fill();
      }

      /* خطوط بين الجسيمات القريبة */
      for (var a2 = 0; a2 < particles.length - 1; a2++) {
        for (var b = a2 + 1; b < particles.length; b++) {
          var dx   = particles[a2].x - particles[b].x;
          var dy   = particles[a2].y - particles[b].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            var lineAlpha = (1 - dist / 110) * 0.14;
            ctx.beginPath();
            ctx.moveTo(particles[a2].x, particles[a2].y);
            ctx.lineTo(particles[b].x,  particles[b].y);
            ctx.strokeStyle = 'rgba(59,155,255,' + lineAlpha + ')';
            ctx.lineWidth   = 0.7;
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(drawFrame);
    }

    /* لا أنيميشن إذا كان المستخدم يفضل تقليلها */
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(drawFrame);
    }

    /* إيقاف عند الخلفية (توفير البطارية) */
    document.addEventListener('visibilitychange', function () {
      animActive = !document.hidden;
      if (animActive) requestAnimationFrame(drawFrame);
    });
  })();

  /* ════════════════════════════════════════════
     8. Prefetch alogin.html تحسيناً للأداء
  ════════════════════════════════════════════ */
  (function prefetch(href) {
    var link = document.createElement('link');
    link.rel  = 'prefetch';
    link.href = href;
    document.head.appendChild(link);
  })('alogin.html');

})();
/* ════ نهاية custom.js ════ */
