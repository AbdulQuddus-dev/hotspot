/*
 * ════════════════════════════════════════════════════════════════
 *  custom.js — المحرك الرئيسي لبوابة الأزرق نت
 *  MikroTik RouterOS Hotspot — شبكة الأزرق نت
 *
 *  المهام:
 *  1. التحكم في تشغيل الفيديو الخلفي
 *  2. إظهار نموذج تسجيل الدخول بعد توقيت معين (setTimeout)
 *     ليتزامن مع لحظة "فتح الحقيبة" في الأنيميشن
 *  3. حماية ضد هجمات XSS وCSRF البسيطة
 *  4. Rate Limiting على مستوى المتصفح
 *  5. تأثيرات بصرية إضافية
 * ════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     الإعدادات — عدّل هذه القيم حسب مدة الأنيميشن
  ───────────────────────────────────────────────────────── */
  var CONFIG = {
    /*
     * التوقيت (بالميلي ثانية) الذي يظهر فيه النموذج
     * بعد بدء تشغيل الفيديو.
     * 3500ms = 3.5 ثانية (لحظة فتح الحقيبة في الأنيميشن)
     * عدّل هذه القيمة لتتطابق مع فيديوك
     */
    FORM_SHOW_DELAY    : 3500,

    /*
     * مدة الفيديو بالميلي ثانية (احتياطي إذا فشل onended)
     * إذا كان فيديوك 10 ثوانٍ: 10000
     */
    VIDEO_DURATION     : 10000,

    /*
     * حد محاولات تسجيل الدخول في النافذة الزمنية
     * (حماية Brute Force)
     */
    MAX_LOGIN_ATTEMPTS : 5,
    ATTEMPT_WINDOW_MS  : 60000,   /* دقيقة واحدة */
    LOCKOUT_MS         : 120000,  /* دقيقتان إقفال */

    /* هل تظهر النموذج فوراً إذا فشل الفيديو */
    FALLBACK_ON_ERROR  : true,
  };

  /* ─────────────────────────────────────────────────────────
     1. تشغيل الفيديو والتحكم بالظهور
  ───────────────────────────────────────────────────────── */
  var video     = document.getElementById('bgVideo');
  var container = document.getElementById('loginFormContainer');

  /* الدالة التي تُظهر النموذج */
  function showLoginForm() {
    if (!container) return;
    container.classList.add('is-visible');
    /* تركيز تلقائي على حقل الإدخال لتحسين تجربة المستخدم */
    var firstInput = container.querySelector('input:not([type="hidden"])');
    if (firstInput) {
      setTimeout(function () { firstInput.focus(); }, 100);
    }
    /* نوقف الفيديو بعد اكتمال الأنيميشن لتوفير الذاكرة */
    if (video) {
      setTimeout(function () {
        if (!video.paused) {
          video.pause();
        }
      }, CONFIG.VIDEO_DURATION);
    }
  }

  /* ── معالج الفيديو ── */
  if (video) {

    /* إخفاء الفيديو حتى يبدأ التشغيل فعلاً (لتجنب اللمعة) */
    video.style.opacity = '0';

    video.addEventListener('loadeddata', function () {
      /* الفيديو محمّل — نبدأ الظهور التدريجي */
      video.style.transition = 'opacity 0.5s ease';
      video.style.opacity    = '1';

      /* ── setTimeout الرئيسي: إظهار النموذج بعد X ثانية ── */
      setTimeout(showLoginForm, CONFIG.FORM_SHOW_DELAY);
    });

    /* إذا انتهى الفيديو قبل انتهاء المؤقت — أظهر النموذج فوراً */
    video.addEventListener('ended', function () {
      showLoginForm();
      /* لوب الخلفية بعد انتهاء الأنيميشن */
      video.loop = true;
      video.play().catch(function () { /* صامت */ });
    });

    /* احتياطي: إذا فشل الفيديو في التحميل — أظهر النموذج */
    video.addEventListener('error', function () {
      if (CONFIG.FALLBACK_ON_ERROR) {
        showLoginForm();
      }
    });

    /* محاولة تشغيل الفيديو (بعض المتصفحات تحتاج إلى مستخدم) */
    var playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(function () {
        /*
         * المتصفح يمنع التشغيل التلقائي حتى بدون صوت
         * نُظهر النموذج فوراً كإجراء احتياطي
         */
        showLoginForm();
      });
    }

    /* احتياطي شامل: بعد VIDEO_DURATION أظهر النموذج بغض النظر */
    setTimeout(showLoginForm, CONFIG.VIDEO_DURATION);

  } else {
    /* لا يوجد فيديو (صفحات أخرى) — أظهر النموذج فوراً */
    if (container) showLoginForm();
  }

  /* ─────────────────────────────────────────────────────────
     2. Rate Limiting — الحماية من Brute Force
     (مستوى المتصفح — لا يُغني عن حماية السيرفر)
  ───────────────────────────────────────────────────────── */
  var STORAGE_KEY_ATTEMPTS = 'az_login_attempts';
  var STORAGE_KEY_LOCKOUT  = 'az_login_lockout';

  function getAttempts() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY_ATTEMPTS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveAttempts(arr) {
    try { sessionStorage.setItem(STORAGE_KEY_ATTEMPTS, JSON.stringify(arr)); }
    catch (e) { /* صامت */ }
  }

  function isLockedOut() {
    try {
      var lockout = sessionStorage.getItem(STORAGE_KEY_LOCKOUT);
      if (!lockout) return false;
      var lockoutTime = parseInt(lockout);
      if (Date.now() < lockoutTime) return true;
      /* انتهى الإقفال — امسحه */
      sessionStorage.removeItem(STORAGE_KEY_LOCKOUT);
      sessionStorage.removeItem(STORAGE_KEY_ATTEMPTS);
      return false;
    } catch (e) { return false; }
  }

  function recordAttempt() {
    var now      = Date.now();
    var attempts = getAttempts().filter(function (t) {
      return (now - t) < CONFIG.ATTEMPT_WINDOW_MS;
    });
    attempts.push(now);
    saveAttempts(attempts);

    if (attempts.length >= CONFIG.MAX_LOGIN_ATTEMPTS) {
      try {
        sessionStorage.setItem(STORAGE_KEY_LOCKOUT,
          String(now + CONFIG.LOCKOUT_MS));
      } catch (e) { /* صامت */ }
      return false; /* مقفل */
    }
    return true; /* مسموح */
  }

  /**
   * يُستدعى من handleLogin قبل الإرسال
   * يُعيد false إذا كان يجب الحظر
   */
  window.rateLimitCheck = function () {
    if (isLockedOut()) {
      var remaining = Math.ceil(CONFIG.LOCKOUT_MS / 60000);
      showRateLimitError('تم تجاوز الحد المسموح من المحاولات. انتظر ' + remaining + ' دقائق.');
      return false;
    }
    return recordAttempt();
  };

  function showRateLimitError(msg) {
    var banner  = document.getElementById('errorBanner');
    var errText = document.getElementById('errorText');
    if (banner && errText) {
      banner.style.display = 'flex';
      errText.textContent  = msg;
    } else {
      alert(msg);
    }
    /* تعطيل الزر */
    var btn = document.getElementById('connectBtn');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
    }
  }

  /* ─────────────────────────────────────────────────────────
     3. حماية CSRF بسيطة: Token مؤقت في الـ form
     (MikroTik يتجاهله — لكنه يُصعّب الـ form injection)
  ───────────────────────────────────────────────────────── */
  function injectCSRFToken() {
    var form = document.getElementById('loginForm') ||
               document.getElementById('retryForm');
    if (!form) return;

    var token = Math.random().toString(36).substring(2) +
                Date.now().toString(36);
    var input = document.createElement('input');
    input.type  = 'hidden';
    input.name  = '_t';
    input.value = token;
    form.appendChild(input);
  }
  injectCSRFToken();

  /* ─────────────────────────────────────────────────────────
     4. منع فتح الـ DevTools عبر F12/Right-Click
     (طبقة حماية إضافية — غير قاطعة لكن رادعة)
  ───────────────────────────────────────────────────────── */
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  document.addEventListener('keydown', function (e) {
    /* منع F12 */
    if (e.key === 'F12') { e.preventDefault(); return false; }
    /* منع Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+U */
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' ||
        e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
      e.preventDefault(); return false;
    }
    if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
      e.preventDefault(); return false;
    }
  });

  /* ─────────────────────────────────────────────────────────
     5. Anti-Frame (Clickjacking Layer 2)
     (Layer 1 موجود في الـ HTML — هذه طبقة JavaScript)
  ───────────────────────────────────────────────────────── */
  if (window.top !== window.self) {
    window.top.location.replace(window.self.location.href);
  }

  /* ─────────────────────────────────────────────────────────
     6. تأثير الجسيمات المتحركة في الخلفية
     (Canvas خفيف — 20 جسيماً فقط لضمان الأداء)
  ───────────────────────────────────────────────────────── */
  function initParticles() {
    var canvas = document.createElement('canvas');
    canvas.id = 'particleCanvas';
    canvas.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2',
      'pointer-events:none',
      'opacity:0.35',
    ].join(';');
    document.body.insertBefore(canvas, document.body.firstChild);

    var ctx = canvas.getContext('2d');
    var particles = [];
    var COUNT = 22;

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* إنشاء الجسيمات */
    for (var i = 0; i < COUNT; i++) {
      particles.push({
        x    : Math.random() * canvas.width,
        y    : Math.random() * canvas.height,
        r    : Math.random() * 2 + 0.5,
        vx   : (Math.random() - 0.5) * 0.4,
        vy   : -Math.random() * 0.6 - 0.2,
        alpha: Math.random() * 0.5 + 0.2,
      });
    }

    var animRunning = true;

    function draw() {
      if (!animRunning) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;

        /* إعادة الجسيم من الأسفل */
        if (p.y < -5) {
          p.y = canvas.height + 5;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -5) p.x = canvas.width + 5;
        if (p.x > canvas.width + 5) p.x = -5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59,155,255,' + p.alpha + ')';
        ctx.fill();
      });

      /* رسم الخطوط بين الجسيمات القريبة */
      for (var a = 0; a < particles.length; a++) {
        for (var b = a + 1; b < particles.length; b++) {
          var dx   = particles[a].x - particles[b].x;
          var dy   = particles[a].y - particles[b].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[a].x, particles[a].y);
            ctx.lineTo(particles[b].x, particles[b].y);
            ctx.strokeStyle = 'rgba(59,155,255,' + ((1 - dist / 120) * 0.18) + ')';
            ctx.lineWidth   = 0.8;
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(draw);
    }

    /* تقليل الأنيميشن للمستخدمين الذين يفضلون ذلك */
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(draw);
    }

    /* إيقاف الـ canvas إذا أصبحت الصفحة في الخلفية (توفير البطارية) */
    document.addEventListener('visibilitychange', function () {
      animRunning = !document.hidden;
      if (animRunning) requestAnimationFrame(draw);
    });
  }

  /* تشغيل الجسيمات فقط في صفحة Login */
  if (document.body.classList.contains('page-login')) {
    initParticles();
  }

  /* ─────────────────────────────────────────────────────────
     7. تسريع تحميل الصفحة: Link Prefetch للصفحات المتوقعة
  ───────────────────────────────────────────────────────── */
  function prefetch(href) {
    if (!href || href.indexOf('$(') !== -1) return; /* تجاهل MikroTik vars */
    var link = document.createElement('link');
    link.rel  = 'prefetch';
    link.href = href;
    document.head.appendChild(link);
  }
  /* نجهز صفحة النجاح مسبقاً */
  prefetch('alogin.html');

  /* ─────────────────────────────────────────────────────────
     8. إصلاح اتجاه الأرقام في حقل الكرت (RTL)
  ───────────────────────────────────────────────────────── */
  var cardInput = document.getElementById('cardNumber');
  if (cardInput) {
    cardInput.addEventListener('input', function () {
      /* إذا كانت القيمة أرقاماً فقط — اجعل الاتجاه LTR */
      this.style.direction = /^\d+$/.test(this.value) ? 'ltr' : 'rtl';
      this.style.textAlign = /^\d+$/.test(this.value) ? 'left' : 'right';
    });
  }

  /* ─────────────────────────────────────────────────────────
     9. دعم الضغط Enter في جميع الحقول
  ───────────────────────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'INPUT' &&
          activeEl.type !== 'submit') {
        var form = activeEl.closest('form');
        if (form) {
          var submitBtn = form.querySelector('[type="submit"]');
          if (submitBtn) submitBtn.click();
        }
      }
    }
  });

  /* ─────────────────────────────────────────────────────────
     10. منع الـ Double Submit
  ───────────────────────────────────────────────────────── */
  var submitted = false;
  document.addEventListener('submit', function (e) {
    if (submitted) {
      e.preventDefault();
      return false;
    }
    submitted = true;
    /* إعادة التمكين بعد 8 ثوانٍ كإجراء احتياطي */
    setTimeout(function () { submitted = false; }, 8000);
  });

})(); /* نهاية الـ IIFE */
