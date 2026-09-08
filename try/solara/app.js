/* Solara web funnel — renders the SAME funnel.json the app uses (one config, two renderers).
   Visual reference = the app's StepScaffold / FloTheme (see hazard-tools CHANGELOG 2026-09-08).
   Pre-launch: landing (store-like card, icon A/B) → quiz (variant A/B) → paywall → waitlist.
   Launch: the last screen becomes the Adapty tracking link with the answers as deferred params. */
(function (root) {
  "use strict";
  var CONFIG_URL = "/config/atmo/funnel.json";
  var STORE_LINK = null;                       // set to the Adapty tracking link at launch
  var ICONS = { a: "/img/atmo/icon-a.png", b: "/img/atmo/icon-b.png" };
  var SHOTS = ["01-today", "02-why", "03-checkin", "04-payoff", "05-patterns"].map(function (n) { return "/img/atmo/store/" + n + ".jpg"; });
  var ORB = "/img/atmo/orb-body.png";
  var LEFT_ALIGNED = { singleChoice: 1, multiChoice: 1, textInput: 1, datePicker: 1, timePicker: 1 };   // question steps: title left; info steps: centered

  // ---------- pure helpers (unit-testable in node) ----------
  function pickWeighted(items, weightOf, rnd) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += Math.max(0, weightOf(items[i]) || 0);
    if (!total) return items[0] || null;
    var slot = (rnd == null ? Math.random() : rnd) * total;
    for (i = 0; i < items.length; i++) { slot -= Math.max(0, weightOf(items[i]) || 0); if (slot < 0) return items[i]; }
    return items[items.length - 1];
  }
  // web weight: `webWeight` when present (lets a variant be web-only while invisible to the app), else `weight`
  function webWeight(v) { return typeof v.webWeight === "number" ? v.webWeight : v.weight; }
  function pickVariant(config, forcedId, rnd) {
    if (forcedId) { var f = config.variants.filter(function (v) { return v.id === forcedId; })[0]; if (f) return f; }
    return pickWeighted(config.variants, webWeight, rnd);
  }
  // "Great choice{withName|}" → "Great choice, Vitali" | "Great choice"
  function template(text, answers) {
    return String(text || "").replace(/\{withName\|([^}]*)\}/g, function (_, fallback) {
      var n = answers && answers.texts && answers.texts.name;
      return n ? ", " + n : fallback;
    });
  }
  function nextIndex(steps, i, gotoId) {
    if (gotoId) { for (var k = 0; k < steps.length; k++) if (steps[k].id === gotoId) return k; }
    return i + 1;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // trial length in days from the plan note/title ("7 days free", "3-day free trial") → 0 = no trial
  function trialDays(plan) { var m = /(\d+)[- ]day/i.exec((plan.note || "") + " " + (plan.title || "") + " " + (plan.cta || "")); return m ? +m[1] : 0; }
  function priceLine(plan) {
    var d = trialDays(plan), period = (plan.periodLabel || "").replace(/^per\s+/, "");
    if (/one-?time/i.test(plan.periodLabel || "")) return "One-time payment of " + plan.fallbackPrice;
    return d ? d + "-day free trial, then " + plan.fallbackPrice + " per " + period : plan.fallbackPrice + " per " + period;
  }

  // FaceOrb geometry from the app (sphere size S = 55.87 units of a 100-unit canvas; canvas = 1.79 S):
  // eyes 0.105×0.145 S, 0.20 S apart, y −0.03 S, catchlight 0.038 S at (+0.018, −0.035) S; blush 0.15×0.09 S, 0.44 S apart, y +0.11 S;
  // mouth 0.26×0.11 S frame at y +0.16 S, stroke 0.045 S, ink #4A2B45.
  var FACE = '<svg class="face" viewBox="0 0 100 100" aria-hidden="true"><defs><filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter></defs><g transform="translate(50 50) scale(1.12) translate(-50 -50)">' +
    '<g filter="url(#bl)"><ellipse cx="33.5" cy="56.1" rx="4.19" ry="2.51" fill="#FF87AE" opacity=".5"/><ellipse cx="66.5" cy="56.1" rx="4.19" ry="2.51" fill="#FF87AE" opacity=".5"/></g>' +
    '<ellipse cx="41.48" cy="48.32" rx="2.93" ry="4.05" fill="#4A2B45"/><ellipse cx="58.52" cy="48.32" rx="2.93" ry="4.05" fill="#4A2B45"/>' +
    '<circle cx="42.5" cy="46.4" r="1.06" fill="#fff" opacity=".95"/><circle cx="59.5" cy="46.4" r="1.06" fill="#fff" opacity=".95"/>' +
    '<path d="M42.7 57.2 Q50 62.4 57.3 57.2" fill="none" stroke="#4A2B45" stroke-width="2.5" stroke-linecap="round"/></g></svg>';
  // FaceOrb(size): the sphere is 0.558 of the OrbBody canvas → the image frame is size × 1.79
  function orbHTML(size) { var f = Math.round(size * 1.79); return '<div class="orbwrap" style="width:' + f + 'px;height:' + f + 'px"><img class="orb" src="' + ORB + '" alt="">' + FACE + '</div>'; }
  var ICON_SVG = {
    unlock: '<svg viewBox="0 0 24 24"><path d="M17 9h-1V7a4 4 0 1 0-8 0h2a2 2 0 1 1 4 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2z"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M12 22a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5-6.7V4a2 2 0 1 0-4 0v.3A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .9-5.1 4.9L18.2 22 12 18.5 5.8 22l1.3-7.7L2 9.4l7-.9z"/></svg>'
  };

  var pure = { pickWeighted: pickWeighted, webWeight: webWeight, pickVariant: pickVariant, template: template, nextIndex: nextIndex, esc: esc, trialDays: trialDays, priceLine: priceLine };
  if (typeof module !== "undefined" && module.exports) { module.exports = pure; }
  if (typeof window === "undefined") return;

  // ---------- browser runtime ----------
  var qs = new URLSearchParams(location.search);
  var store = { get: function (k) { try { return localStorage.getItem("solara.try." + k); } catch (e) { return null; } },
                set: function (k, v) { try { localStorage.setItem("solara.try." + k, v); } catch (e) {} } };
  var ctx = {};                                             // super properties for every event
  ["fbclid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
    var v = qs.get(k) || store.get(k); if (v) { ctx[k] = v; store.set(k, v); }
  });
  var icon = (qs.get("icon") || store.get("icon") || (Math.random() < 0.5 ? "a" : "b")).toLowerCase();
  if (!ICONS[icon]) icon = "a"; store.set("icon", icon); ctx.icon_variant = icon; ctx.platform = "web";

  function mp(fn) { try { if (window.mixpanel) fn(window.mixpanel); } catch (e) {} }
  function px(name, params, custom) { try { if (window.fbq) fbq(custom ? "trackCustom" : "track", name, params || {}); } catch (e) {} }
  function track(event, props) { var p = Object.assign({}, ctx, props || {}); mp(function (m) { m.track(event, p); }); }
  mp(function (m) { m.register(ctx); });

  var $screen = document.getElementById("screen"), $back = document.getElementById("back");
  var config = null, variant = null, steps = [], index = -1, history = [], answers = { texts: {}, selections: {}, birthDate: null };
  var timers = [];

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function render(html, cls) { clearTimers(); $screen.className = "screen" + (cls ? " " + cls : ""); $screen.innerHTML = html; window.scrollTo(0, 0); }

  // ---------- landing (our own store-like card; not an App Store imitation) ----------
  function renderLanding() {
    $back.classList.remove("on");
    render(
      '<div class="store">' +
      '<div class="head"><img class="icon" src="' + ICONS[icon] + '" alt="Solara">' +
      '<div><h1>Solara</h1><p class="sub">Daily Energy Forecast<br>Biorhythms &amp; Magnetic Storms</p></div></div>' +
      '<div class="meta"><span>Category<b>Health &amp; Fitness</b></span><span>Price<b>Free · Plus optional</b></span><span>Platform<b>iPhone</b></span></div>' +
      '<div class="shots">' + SHOTS.map(function (s) { return '<img src="' + s + '" alt="" loading="lazy">'; }).join("") + '</div>' +
      '<p class="desc">Solara reads the sky every morning — pressure, magnetic storms, UV, moon — and blends it with your own rhythms into one Energy Index. A 5-second evening check-in keeps it honest: after a week you see patterns built on <em>your</em> days.</p>' +
      '<div class="spacer"></div><div class="ctabar"><button class="cta" id="get">Get</button>' +
      '<p class="tiny">Free on the App Store · launching this month. Set up your profile now — it takes about a minute.</p></div>' +
      '</div>');
    track("store_view", { screen: "landing" }); px("ViewContent", { content_name: "solara-landing", content_category: icon });
    document.getElementById("get").onclick = function () {
      track("store_get_tap", {}); px("GetTap", { icon: icon }, true); px("QuizStart", {}, true);
      go(0);
    };
  }

  // ---------- quiz ----------
  function go(i, viaBack) {
    if (i >= steps.length) return renderWaitlist();
    if (!viaBack && index >= 0) history.push(index);
    index = i; var step = steps[i];
    $back.classList.toggle("on", history.length > 0 && step.type !== "paywall" && step.type !== "progress");
    track("onboarding_step", { step: step.id, index: i, type: step.type, variant: variant.id });
    var r = renderers[step.type] || renderers.info; r(step, i);
  }
  $back.onclick = function () { if (!history.length) return; var prev = history.pop(); track("onboarding_back", { from: steps[index].id }); go(prev, true); };
  function advance(step, i, gotoId) { go(nextIndex(steps, i, gotoId)); }
  function answerEvent(step, value) { track("onboarding_answer", { step: step.id, value: value }); }

  function titleBlock(step) {
    return '<h1>' + esc(template(step.title, answers)) + '</h1>' + (step.subtitle ? '<p class="sub">' + esc(template(step.subtitle, answers)) + '</p>' : "");
  }
  function artBlock(step) {
    if (step.artwork === "hero") return '<div class="hero">' + orbHTML(96) + '</div>';
    if (step.imageURL) {
      // the app's flood art fills ~46% of the screen height regardless of imageHeight
      return '<div class="flood" style="height:max(380px,46vh)"><img src="' + esc(step.imageURL) + '" alt=""></div>';
    }
    if (step.emoji) return '<div class="emoji">' + esc(step.emoji) + '</div>';
    return "";
  }
  function footnote(step) { return step.footnote ? '<p class="foot"><span class="bd">✓</span>' + esc(step.footnote) + '</p>' : ""; }
  function ctaRow(step, id, label, extra) {
    return '<div class="spacer"></div><div class="ctabar">' + footnote(step) + '<button class="cta" id="' + id + '">' + esc(label || step.cta || "Continue") + '</button>' + (extra || "") + '</div>';
  }
  function cls(step) { return LEFT_ALIGNED[step.type] ? "" : "c"; }

  var renderers = {
    // info: centered title; hero steps are vertically centered like the app's Spacer layout
    info: function (step, i) {
      var centered = step.artwork === "hero" || (!step.imageURL && !step.emoji);
      render(artBlock(step) + (step.imageURL ? '<div class="spacer"></div>' : "") + titleBlock(step) + ctaRow(step, "next"), "c" + (centered ? " center" : ""));
      document.getElementById("next").onclick = function () { advance(step, i); };
    },
    // payoff ("Great choice"): the app shows a sparkle burst, not the orb
    payoff: function (step, i) {
      render('<div class="emoji">✨</div>' + titleBlock(step) + ctaRow(step, "next"), "c center");
      document.getElementById("next").onclick = function () { advance(step, i); };
    },
    permission: function (step, i) {
      render(artBlock(step) + '<div class="spacer"></div>' + titleBlock(step) + ctaRow(step, "next"), "c");
      document.getElementById("next").onclick = function () { answerEvent(step, "continue"); advance(step, i); };
    },
    singleChoice: function (step, i) {
      var opts = step.options || [];
      render(titleBlock(step) + '<div class="opts">' + opts.map(function (o) {
        return '<button class="opt" data-id="' + esc(o.id) + '">' + (o.emoji ? '<span class="em">' + esc(o.emoji) + '</span>' : "") +
          '<span class="t">' + esc(o.title) + (o.detail ? '<small>' + esc(o.detail) + '</small>' : "") + '</span><span class="ck">✓</span></button>';
      }).join("") + '</div>' + (step.autoAdvance ? '<div class="spacer"></div>' : ctaRow(step, "next")), cls(step));
      var chosen = null, $next = document.getElementById("next"); if ($next) $next.disabled = true;
      Array.prototype.forEach.call($screen.querySelectorAll(".opt"), function (b) {
        b.onclick = function () {
          Array.prototype.forEach.call($screen.querySelectorAll(".opt"), function (x) { x.classList.remove("on"); });
          b.classList.add("on"); chosen = opts.filter(function (o) { return o.id === b.dataset.id; })[0];
          if (step.autoAdvance) { timers.push(setTimeout(commit, 280)); } else $next.disabled = false;
        };
      });
      function commit() { if (!chosen) return; answers.selections[step.id] = [chosen.id]; answerEvent(step, chosen.id); advance(step, i, chosen.goto); }
      if ($next) $next.onclick = commit;
    },
    multiChoice: function (step, i) {
      var opts = step.options || [];
      render(titleBlock(step) + '<div class="opts">' + opts.map(function (o) {
        return '<button class="opt" data-id="' + esc(o.id) + '">' + (o.emoji ? '<span class="em">' + esc(o.emoji) + '</span>' : "") +
          '<span class="t">' + esc(o.title) + '</span><span class="ck">✓</span></button>';
      }).join("") + '</div>' + ctaRow(step, "next"), cls(step));
      var $next = document.getElementById("next"); $next.disabled = true;
      Array.prototype.forEach.call($screen.querySelectorAll(".opt"), function (b) {
        b.onclick = function () { b.classList.toggle("on"); $next.disabled = !$screen.querySelector(".opt.on"); };
      });
      $next.onclick = function () {
        var ids = Array.prototype.map.call($screen.querySelectorAll(".opt.on"), function (b) { return b.dataset.id; });
        answers.selections[step.id] = ids; answerEvent(step, ids); advance(step, i);
      };
    },
    textInput: function (step, i) {
      render(titleBlock(step) + '<input class="field" id="txt" type="text" autocomplete="off" placeholder="' + esc(step.placeholder || "") + '">' +
        ctaRow(step, "next"), cls(step));
      var $t = document.getElementById("txt"), $next = document.getElementById("next"); $next.disabled = !step.optional;
      $t.oninput = function () { $next.disabled = !step.optional && !$t.value.trim(); };
      $next.onclick = function () { var v = $t.value.trim(); if (v) answers.texts[step.id] = v; answerEvent(step, v ? "filled" : "skipped"); advance(step, i); };
      var $s = document.getElementById("skip"); if ($s) $s.onclick = function () { answerEvent(step, "skipped"); advance(step, i); };
    },
    datePicker: function (step, i) {
      // Native <input type=date>: on iPhone a tap opens Apple's system date picker; the field itself is styled as our card.
      var max = new Date(); max.setFullYear(max.getFullYear() - 13);
      render(titleBlock(step) + '<label class="datewrap" id="dw"><span class="ph" id="ph">Select your birth date</span>' +
        '<input class="field date" id="date" type="date" max="' + max.toISOString().slice(0, 10) + '" min="1920-01-01" aria-label="Birth date"></label>' +
        ctaRow(step, "next", null, step.skippable ? '<button class="skip" id="skip">Skip</button>' : ""), cls(step));
      var $d = document.getElementById("date"), $next = document.getElementById("next"), $w = document.getElementById("dw"); $next.disabled = true;
      function refresh() { $next.disabled = !$d.value; $w.classList.toggle("set", !!$d.value); }
      $d.oninput = refresh; $d.onchange = refresh;
      $next.onclick = function () { if (!$d.value) return; answers.birthDate = $d.value; answerEvent(step, "filled"); advance(step, i); };
      var $s = document.getElementById("skip"); if ($s) $s.onclick = function () { answerEvent(step, "skipped"); advance(step, i); };
    },
    timePicker: function (step, i) {
      render(titleBlock(step) + '<input class="field" id="time" type="time">' + ctaRow(step, "next", null, '<button class="skip" id="skip">Skip</button>'), cls(step));
      document.getElementById("next").onclick = function () { answerEvent(step, "filled"); advance(step, i); };
      document.getElementById("skip").onclick = function () { answerEvent(step, "skipped"); advance(step, i); };
    },
    // progress (ProgressStepView): orb, centered title, per-task capsule bars, facts revealed as cards
    progress: function (step, i) {
      var tasks = step.tasks || [], facts = step.facts || [], per = 2600;
      render('<div class="spacer"></div><div class="hero">' + orbHTML(70) + '</div>' + titleBlock(step) +
        '<ul class="ptasks">' + tasks.map(function (t) { return '<li><div class="row2"><span class="lbl">' + esc(t) + '</span><span class="chk">✓</span></div><div class="track"><i></i></div></li>'; }).join("") + '</ul>' +
        '<div class="facts" id="facts"></div><div class="spacer"></div><p class="tiny" id="done"></p><div style="height:40px"></div>', "c");
      var lis = $screen.querySelectorAll(".ptasks li"), $f = document.getElementById("facts");
      tasks.forEach(function (_, k) {
        timers.push(setTimeout(function () {
          Array.prototype.forEach.call(lis, function (li) { li.classList.remove("active"); });
          lis[k].classList.add("active"); lis[k].querySelector(".track i").style.width = "100%";
          if (facts[k]) { var d = document.createElement("div"); d.innerHTML = '<span class="bd">✓</span>' + esc(facts[k]); $f.appendChild(d); }
        }, 250 + k * per));
        timers.push(setTimeout(function () { lis[k].classList.remove("active"); lis[k].classList.add("done"); }, 250 + (k + 1) * per - 80));
      });
      timers.push(setTimeout(function () { document.getElementById("done").textContent = step.afterDone || ""; }, 400 + tasks.length * per));
      timers.push(setTimeout(function () { advance(step, i); }, 1500 + tasks.length * per));
    },
    comparison: function (step, i) {
      function col(c, title, img, items) {
        return '<div class="col ' + c + '">' + (img ? '<img class="por" src="' + esc(img) + '" alt="">' : "") + '<h3>' + esc(title || "") + '</h3><ul>' +
          (items || []).map(function (x) { return '<li><span class="i">' + (c === "after" ? "✓" : "✕") + '</span><span>' + esc(x) + '</span></li>'; }).join("") + '</ul></div>';
      }
      render(titleBlock(step) + '<div class="cols">' + col("before", step.beforeTitle, step.beforeImageURL, step.before) + col("after", step.afterTitle, step.afterImageURL, step.after) + '</div>' + ctaRow(step, "next"), "c");
      document.getElementById("next").onclick = function () { advance(step, i); };
    },
    rating: function (step, i) { renderers.info(step, i); },
    paywall: function (step, i) {
      var pw = variant.paywall, plans = pw.plans || [], sel = plans.filter(function (p) { return p.isDefault; })[0] || plans[0];
      $back.classList.remove("on");
      function timeline(p) {
        var d = trialDays(p); if (!d || !pw.showTrialTimeline) return "";
        var rem = Math.max(1, d - 2);
        return '<div class="tl" id="tl">' +
          '<div class="step"><span class="ic">' + ICON_SVG.unlock + '</span><div><b>Today</b><span>Full access unlocked — everything included</span></div></div>' +
          '<div class="step"><span class="ic">' + ICON_SVG.bell + '</span><div><b>Day ' + rem + '</b><span>We\'ll remind you that your trial is ending</span></div></div>' +
          '<div class="step"><span class="ic">' + ICON_SVG.star + '</span><div><b>Day ' + d + '</b><span>Trial ends — cancel anytime before this day</span></div></div></div>';
      }
      render('<div class="pw">' + (pw.skippable !== false ? '<button class="close" id="close" aria-label="Close">✕</button>' : "") +
        '<div class="brand">' + orbHTML(24) + '<b>' + esc(pw.brandName || "Solara") + '</b>' + (pw.brandBadge ? '<em>' + esc(pw.brandBadge) + '</em>' : "") + '</div>' +
        '<h1>' + esc(pw.title) + '</h1>' + (pw.subtitle ? '<p class="sub">' + esc(pw.subtitle) + '</p>' : "") +
        (pw.stats ? '<div class="stats">' + pw.stats.map(function (s) { return '<span><b>' + esc(s.value) + '</b><small>' + esc(s.label) + '</small></span>'; }).join("") + '</div>' : "") +
        '<div class="plans">' + plans.map(function (p) {
          return '<button class="plan' + (p === sel ? " on" : "") + '" data-id="' + esc(p.productId) + '"><span class="r">' + (p === sel ? "✓" : "") + '</span>' +
            '<span class="t"><b>' + esc(p.title) + (p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : "") + '</b>' + (p.note ? '<small>' + esc(p.note) + '</small>' : "") + '</span>' +
            '<span class="p"><b>' + esc(p.fallbackPrice) + '</b><small>' + esc(p.periodLabel || "") + '</small></span></button>';
        }).join("") + '</div>' +
        '<div id="tlwrap">' + timeline(sel) + '</div>' +
        (pw.features && pw.features.length ? '<ul class="feat">' + pw.features.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + '</ul>' : "") +
        (pw.included ? '<p class="inc">' + esc(pw.includedTitle || "What's included") + '</p><div class="chips">' + pw.included.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + '</div>' : "") +
        '<div class="spacer"></div><div class="ctabar"><p class="green"><span class="g">✓</span><span id="pline">' + esc(priceLine(sel)) + '</span></p>' +
        '<button class="cta" id="buy">' + esc(sel.cta || pw.cta) + '</button>' +
        '<p class="legal"><a href="' + esc(pw.termsURL || "/apps/solara/terms.html") + '">Terms</a> &nbsp; <a href="' + esc(pw.privacyURL || "/apps/solara/privacy.html") + '">Privacy</a> &nbsp; <a href="#" onclick="return false">Restore</a> &nbsp; <i>Auto-renews · Cancel anytime</i></p></div></div>');
      track("paywall_shown", { variant: variant.id }); px("PaywallView", {}, true);
      var $c = document.getElementById("close"); if ($c) $c.onclick = function () { track("paywall_skipped", {}); renderWaitlist(null); };
      Array.prototype.forEach.call($screen.querySelectorAll(".plan"), function (b) {
        b.onclick = function () {
          Array.prototype.forEach.call($screen.querySelectorAll(".plan"), function (x) { x.classList.remove("on"); x.querySelector(".r").textContent = ""; });
          b.classList.add("on"); b.querySelector(".r").textContent = "✓";
          sel = plans.filter(function (p) { return p.productId === b.dataset.id; })[0] || sel;
          document.getElementById("buy").textContent = sel.cta || pw.cta; document.getElementById("pline").textContent = priceLine(sel);
          document.getElementById("tlwrap").innerHTML = timeline(sel);
          track("plan_selected", { product: sel.productId });
        };
      });
      document.getElementById("buy").onclick = function () {
        track("purchase_started", { product: sel.productId, price: sel.fallbackPrice, variant: variant.id });
        px("InitiateCheckout", { content_ids: [sel.productId], content_type: "product", value: parseFloat(String(sel.fallbackPrice).replace(/[^0-9.]/g, "")) || 0, currency: "USD" });
        if (STORE_LINK) { location.href = STORE_LINK; return; }
        renderWaitlist(sel);
      };
    }
  };

  // ---------- honest ending: the app is not in the store yet ----------
  function renderWaitlist(plan) {
    $back.classList.remove("on");
    var lifetime = plan && /lifetime/i.test(plan.title || "");
    render('<div class="hero">' + orbHTML(70) + '</div><h1>You\'re early — thank you</h1>' +
      '<p class="sub">Solara launches on the App Store this month. Leave your email and we\'ll send your personal plan' +
      (plan ? (lifetime ? ' and your lifetime unlock link' : ' and the ' + esc((plan.title || "").toLowerCase()) + ' trial link') : "") + ' the moment it\'s live. No newsletters, one message.</p>' +
      '<form id="wl"><input class="field" id="email" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" required></form>' +
      '<div class="spacer"></div><div class="ctabar"><button class="cta" id="notify">Notify me at launch</button>' +
      '<p class="tiny">Your answers are saved on this device — the app will pick them up.</p></div>', "c center wait");
    track("quiz_complete", { variant: variant ? variant.id : null }); px("QuizComplete", {}, true);
    try { localStorage.setItem("solara.try.answers", JSON.stringify(answers)); } catch (e) {}
    function submit() {
      var $e = document.getElementById("email"), email = $e.value.trim();
      if (!email || !$e.checkValidity()) { $e.focus(); return; }
      mp(function (m) { m.people.set({ $email: email, waitlist: "solara-prelaunch", variant: variant ? variant.id : null, icon_variant: icon }); });
      track("waitlist_email", { has_plan: !!plan }); px("Lead", { content_name: "solara-waitlist" });
      render('<div class="hero">' + orbHTML(70) + '</div><h1>You\'re on the list</h1><p class="sub">We\'ll write once, when Solara is live. Your plan is saved.</p>', "c center wait");
    }
    document.getElementById("wl").onsubmit = function (ev) { ev.preventDefault(); submit(); };
    document.getElementById("notify").onclick = submit;
  }

  // ---------- boot ----------
  function boot(cfg) {
    config = cfg; variant = pickVariant(cfg, qs.get("v") || store.get("variant")); store.set("variant", variant.id);
    ctx.variant = variant.id; ctx.experiment = cfg.experimentId || null; ctx.config_version = cfg.version; mp(function (m) { m.register(ctx); });
    steps = (variant.steps || []).filter(function (s) { return s.type !== "rating"; });
    if (qs.get("step")) {
      if (qs.get("step") === "paywall") { index = -1; history = []; go(steps.length - 1); return; }
      var k = steps.map(function (s) { return s.id; }).indexOf(qs.get("step")); if (k >= 0) { index = -1; history = [0]; go(k); return; }
    }
    // Two separate tests, two entry modes: default = quiz-first (onboarding test);
    // ?mode=store = our store-like card with the icon A/B first (icon test). Sticky per browser.
    var mode = qs.get("mode") || store.get("mode") || "quiz"; store.set("mode", mode); ctx.flow = mode; mp(function (m) { m.register({ flow: mode }); });
    if (mode === "store") renderLanding(); else { px("QuizStart", {}, true); go(0); }
  }
  fetch(CONFIG_URL, { cache: "no-store" }).then(function (r) { return r.json(); }).then(boot).catch(function (e) {
    render('<h1>Solara</h1><p class="sub">Could not load the experience. <a href="/apps/solara/">Open the app page</a>.</p>', "c"); track("config_error", { error: String(e) });
  });
})(this);
