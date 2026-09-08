/* Solara web funnel — renders the SAME funnel.json the app uses (one config, two renderers).
   Pre-launch: landing (store-like card, icon A/B) → quiz (variant A/B) → paywall → waitlist.
   Launch: the last screen becomes the Adapty tracking link with the answers as deferred params. */
(function (root) {
  "use strict";
  var CONFIG_URL = "/config/atmo/funnel.json";
  var STORE_LINK = null;                       // set to the Adapty tracking link at launch
  var ICONS = { a: "/img/atmo/icon-a.png", b: "/img/atmo/icon-b.png" };
  var SHOTS = ["01-today", "02-why", "03-checkin", "04-payoff", "05-patterns"].map(function (n) { return "/img/atmo/store/" + n + ".jpg"; });
  var ORB = "/img/atmo/orb-body.png", PAYWALL_HERO = "/img/atmo/skyart-sunny.png";

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

  var FACE = '<svg class="face" viewBox="0 0 100 100" aria-hidden="true">' +
    '<ellipse cx="24" cy="58" rx="7.5" ry="4.5" fill="#FF87AE" opacity=".5"/><ellipse cx="76" cy="58" rx="7.5" ry="4.5" fill="#FF87AE" opacity=".5"/>' +
    '<ellipse cx="39" cy="45" rx="5.2" ry="7.6" fill="#3D3352"/><ellipse cx="61" cy="45" rx="5.2" ry="7.6" fill="#3D3352"/>' +
    '<circle cx="40.5" cy="42" r="1.9" fill="#fff"/><circle cx="62.5" cy="42" r="1.9" fill="#fff"/>' +
    '<path d="M37 59 Q50 70 63 59" fill="none" stroke="#3D3352" stroke-width="4.2" stroke-linecap="round"/></svg>';
  function orbHTML(size) { return '<div class="orbwrap" style="width:' + size + 'px;height:' + size + 'px"><img class="orb" src="/img/atmo/orb-body.png" alt="">' + FACE + '</div>'; }

  var pure = { pickWeighted: pickWeighted, webWeight: webWeight, pickVariant: pickVariant, template: template, nextIndex: nextIndex, esc: esc };
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

  var $screen = document.getElementById("screen"), $bar = document.getElementById("bar"), $back = document.getElementById("back");
  var config = null, variant = null, steps = [], index = -1, history = [], answers = { texts: {}, selections: {}, birthDate: null };
  var timers = [];

  function setBar(frac) { $bar.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + "%"; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function render(html) { clearTimers(); $screen.innerHTML = html; window.scrollTo(0, 0); }

  // ---------- landing ----------
  function renderLanding() {
    $back.classList.remove("on"); setBar(0);
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
    $back.classList.toggle("on", history.length > 0 && step.type !== "paywall");
    setBar((i + 1) / (steps.length + 1));
    track("onboarding_step", { step: step.id, index: i, type: step.type, variant: variant.id });
    var r = renderers[step.type] || renderers.info; r(step, i);
  }
  $back.onclick = function () { if (!history.length) return; var prev = history.pop(); track("onboarding_back", { from: steps[index].id }); go(prev, true); };
  function advance(step, i, gotoId) { go(nextIndex(steps, i, gotoId)); }
  function answerEvent(step, value) { track("onboarding_answer", { step: step.id, value: value }); }

  function head(step, extraTop) {
    var art = "";
    if (step.artwork === "hero") art = '<div class="hero">' + orbHTML(150) + '</div>';
    else if (step.imageURL) art = '<div class="flood"><img src="' + esc(step.imageURL) + '" alt="" style="' + (step.imageHeight ? "max-height:" + Math.round(step.imageHeight * 1.05) + "px" : "") + '"></div>';
    else if (step.emoji) art = '<div class="hero" style="font-size:64px">' + esc(step.emoji) + '</div>';
    return art + (extraTop || "") + '<h1>' + esc(template(step.title, answers)) + '</h1>' + (step.subtitle ? '<p class="sub">' + esc(template(step.subtitle, answers)) + '</p>' : "");
  }
  function ctaRow(step, id, label, extra) {
    return '<div class="spacer"></div><div class="ctabar"><button class="cta" id="' + id + '">' + esc(label || step.cta || "Continue") + '</button>' +
      (step.footnote ? '<p class="foot">' + esc(step.footnote) + '</p>' : "") + (extra || "") + '</div>';
  }

  var renderers = {
    info: function (step, i) { render(head(step) + ctaRow(step, "next")); document.getElementById("next").onclick = function () { advance(step, i); }; },
    payoff: function (step, i) { renderers.info(step, i); },
    permission: function (step, i) {
      render(head(step) + ctaRow(step, "next", null, '<p class="tiny">You will be asked for this in the app — nothing is requested here.</p>'));
      document.getElementById("next").onclick = function () { answerEvent(step, "continue"); advance(step, i); };
    },
    singleChoice: function (step, i) {
      var opts = step.options || [];
      render(head(step) + '<div class="opts">' + opts.map(function (o) {
        return '<button class="opt" data-id="' + esc(o.id) + '">' + (o.emoji ? '<span class="em">' + esc(o.emoji) + '</span>' : "") +
          '<span class="t">' + esc(o.title) + (o.detail ? '<small>' + esc(o.detail) + '</small>' : "") + '</span><span class="ck">✓</span></button>';
      }).join("") + '</div>' + (step.autoAdvance ? '<div class="spacer"></div>' : ctaRow(step, "next")));
      var chosen = null, $next = document.getElementById("next"); if ($next) $next.disabled = true;
      Array.prototype.forEach.call($screen.querySelectorAll(".opt"), function (b) {
        b.onclick = function () {
          Array.prototype.forEach.call($screen.querySelectorAll(".opt"), function (x) { x.classList.remove("on"); });
          b.classList.add("on"); chosen = opts.filter(function (o) { return o.id === b.dataset.id; })[0];
          if (step.autoAdvance) { timers.push(setTimeout(function () { commit(); }, 260)); } else $next.disabled = false;
        };
      });
      function commit() { if (!chosen) return; answers.selections[step.id] = [chosen.id]; answerEvent(step, chosen.id); advance(step, i, chosen.goto); }
      if ($next) $next.onclick = commit;
    },
    multiChoice: function (step, i) {
      var opts = step.options || [];
      render(head(step) + '<div class="opts">' + opts.map(function (o) {
        return '<button class="opt" data-id="' + esc(o.id) + '">' + (o.emoji ? '<span class="em">' + esc(o.emoji) + '</span>' : "") +
          '<span class="t">' + esc(o.title) + '</span><span class="ck">✓</span></button>';
      }).join("") + '</div>' + ctaRow(step, "next"));
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
      render(head(step) + '<input class="field" id="txt" type="text" autocomplete="off" placeholder="' + esc(step.placeholder || "") + '">' +
        ctaRow(step, "next", null, step.optional ? '<button class="skip" id="skip">Skip</button>' : ""));
      var $t = document.getElementById("txt"), $next = document.getElementById("next"); $next.disabled = !step.optional;
      $t.oninput = function () { $next.disabled = !step.optional && !$t.value.trim(); };
      $next.onclick = function () { var v = $t.value.trim(); if (v) answers.texts[step.id] = v; answerEvent(step, v ? "filled" : "skipped"); advance(step, i); };
      var $s = document.getElementById("skip"); if ($s) $s.onclick = function () { answerEvent(step, "skipped"); advance(step, i); };
    },
    datePicker: function (step, i) {
      // Three native selects styled as our fields: consistent on every browser (the bare <input type=date>
      // renders as a foreign-looking dd.mm.yyyy box on desktop/Android); iOS still opens its wheel.
      var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      var maxYear = new Date().getFullYear() - 13, minYear = 1920, opts = function (arr, ph) {
        return '<option value="" disabled selected>' + ph + '</option>' + arr.map(function (v) { return '<option value="' + v[0] + '">' + v[1] + '</option>'; }).join("");
      };
      var days = [], years = [];
      for (var d = 1; d <= 31; d++) days.push([d, d]);
      for (var y = maxYear; y >= minYear; y--) years.push([y, y]);
      render(head(step) + '<div class="row"><select class="field sel" id="m">' + opts(months.map(function (m, k) { return [k + 1, m]; }), "Month") + '</select>' +
        '<select class="field sel" id="d">' + opts(days, "Day") + '</select><select class="field sel" id="y">' + opts(years, "Year") + '</select></div>' +
        ctaRow(step, "next", null, step.skippable ? '<button class="skip" id="skip">Skip</button>' : ""));
      var $m = document.getElementById("m"), $d = document.getElementById("d"), $y = document.getElementById("y"), $next = document.getElementById("next");
      function value() {
        if (!$m.value || !$d.value || !$y.value) return null;
        var dt = new Date(Date.UTC(+$y.value, +$m.value - 1, +$d.value));
        if (dt.getUTCMonth() !== +$m.value - 1) return null;                 // e.g. 31 February
        return dt.toISOString().slice(0, 10);
      }
      function refresh() { $next.disabled = !value(); [$m, $d, $y].forEach(function (s) { s.classList.toggle("set", !!s.value); }); }
      $next.disabled = true; [$m, $d, $y].forEach(function (s) { s.onchange = refresh; });
      $next.onclick = function () { var v = value(); if (!v) return; answers.birthDate = v; answerEvent(step, "filled"); advance(step, i); };
      var $s = document.getElementById("skip"); if ($s) $s.onclick = function () { answerEvent(step, "skipped"); advance(step, i); };
    },
    timePicker: function (step, i) {
      render(head(step) + '<input class="field" id="time" type="time">' + ctaRow(step, "next", null, '<button class="skip" id="skip">Skip</button>'));
      document.getElementById("next").onclick = function () { answerEvent(step, "filled"); advance(step, i); };
      document.getElementById("skip").onclick = function () { answerEvent(step, "skipped"); advance(step, i); };
    },
    progress: function (step, i) {
      var tasks = step.tasks || [], facts = step.facts || [], per = 1100;
      render('<div class="hero">' + orbHTML(96) + '</div><h1 class="t2">' + esc(step.title) + '</h1>' +
        '<ul class="ptasks">' + tasks.map(function (t) { return '<li><div class="row2"><span class="lbl">' + esc(t) + '</span><span class="chk">✓</span></div><div class="track"><i></i></div></li>'; }).join("") + '</ul>' +
        '<div class="facts" id="facts"></div><div class="spacer"></div><p class="tiny" id="done"></p>');
      var lis = $screen.querySelectorAll(".ptasks li"), $f = document.getElementById("facts");
      tasks.forEach(function (_, k) {
        timers.push(setTimeout(function () {
          Array.prototype.forEach.call(lis, function (li) { li.classList.remove("active"); });
          lis[k].classList.add("active"); lis[k].querySelector(".track i").style.width = "100%";
          if (facts[k]) { var d = document.createElement("div"); d.textContent = facts[k]; $f.appendChild(d); }
        }, 250 + k * per));
        timers.push(setTimeout(function () { lis[k].classList.remove("active"); lis[k].classList.add("done"); }, 250 + (k + 1) * per - 80));
      });
      timers.push(setTimeout(function () { document.getElementById("done").textContent = step.afterDone || ""; }, 400 + tasks.length * per));
      timers.push(setTimeout(function () { advance(step, i); }, 1500 + tasks.length * per));
    },
    comparison: function (step, i) {
      function col(cls, title, img, items) {
        return '<div class="col ' + cls + '">' + (img ? '<img src="' + esc(img) + '" alt="">' : "") + '<h3>' + esc(title || "") + '</h3><ul>' + (items || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul></div>';
      }
      render(head(step) + '<div class="cols">' + col("before", step.beforeTitle, step.beforeImageURL, step.before) + col("after", step.afterTitle, step.afterImageURL, step.after) + '</div>' + ctaRow(step, "next"));
      document.getElementById("next").onclick = function () { advance(step, i); };
    },
    rating: function (step, i) { renderers.info(step, i); },
    paywall: function (step, i) {
      var pw = variant.paywall, plans = pw.plans || [], sel = plans.filter(function (p) { return p.isDefault; })[0] || plans[0];
      $back.classList.remove("on");
      render('<div class="pw"><div class="pwhero"><img src="' + PAYWALL_HERO + '" alt=""></div>' +
        '<div class="brand"><img src="' + ICONS[icon] + '" alt=""><b>' + esc(pw.brandName || "Solara") + '</b>' + (pw.brandBadge ? '<em>' + esc(pw.brandBadge) + '</em>' : "") + '</div>' +
        '<h1>' + esc(pw.title) + '</h1>' + (pw.subtitle ? '<p class="sub">' + esc(pw.subtitle) + '</p>' : "") +
        (pw.stats ? '<div class="stats">' + pw.stats.map(function (s) { return '<span><b>' + esc(s.value) + '</b>' + esc(s.label) + '</span>'; }).join("") + '</div>' : "") +
        '<ul class="feat">' + (pw.features || []).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + '</ul>' +
        '<div class="plans">' + plans.map(function (p) {
          return '<button class="plan' + (p === sel ? " on" : "") + '" data-id="' + esc(p.productId) + '">' + (p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : "") +
            '<span class="r"></span><span class="t"><b>' + esc(p.title) + '</b>' + (p.note ? '<small>' + esc(p.note) + '</small>' : "") + '</span>' +
            '<span class="p"><b>' + esc(p.fallbackPrice) + '</b><small>' + esc(p.periodLabel || "") + (p.equivalent ? " · " + esc(p.equivalent) : "") + '</small></span></button>';
        }).join("") + '</div>' +
        (pw.included ? '<div class="chips">' + pw.included.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + '</div>' : "") +
        '<div class="spacer"></div><div class="ctabar"><button class="cta" id="buy">' + esc(sel.cta || pw.cta) + '</button>' +
        '<p class="foot">' + esc(pw.trustLine || "") + '</p>' +
        '<p class="legal"><a href="' + esc(pw.termsURL || "/apps/solara/terms.html") + '">Terms</a> · <a href="' + esc(pw.privacyURL || "/apps/solara/privacy.html") + '">Privacy</a></p></div></div>');
      track("paywall_shown", { variant: variant.id }); px("PaywallView", {}, true);
      Array.prototype.forEach.call($screen.querySelectorAll(".plan"), function (b) {
        b.onclick = function () {
          Array.prototype.forEach.call($screen.querySelectorAll(".plan"), function (x) { x.classList.remove("on"); }); b.classList.add("on");
          sel = plans.filter(function (p) { return p.productId === b.dataset.id; })[0] || sel;
          document.getElementById("buy").textContent = sel.cta || pw.cta; track("plan_selected", { product: sel.productId });
          var $trust = $screen.querySelector(".pw .foot");
          if ($trust) $trust.textContent = /lifetime/i.test(sel.title) ? "One-time payment. Yours forever, no subscription." : (pw.trustLine || "");
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
    $back.classList.remove("on"); setBar(1);
    render('<div class="screen wait">' + orbHTML(120) + '<h1>You\'re early — thank you</h1>' +
      '<p class="sub">Solara launches on the App Store this month. Leave your email and we\'ll send your personal plan' + (plan ? (/lifetime/i.test(plan.title) ? ' and your lifetime unlock link' : ' and the ' + esc(plan.title.toLowerCase()) + ' trial link') : "") + ' the moment it\'s live. No newsletters, one message.</p>' +
      '<form id="wl"><input class="field" id="email" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" required>' +
      '<button class="cta" type="submit">Notify me at launch</button></form>' +
      '<p class="tiny">Your answers are saved on this device — the app will pick them up.</p></div>');
    track("quiz_complete", { variant: variant ? variant.id : null }); px("QuizComplete", {}, true);
    try { localStorage.setItem("solara.try.answers", JSON.stringify(answers)); } catch (e) {}
    document.getElementById("wl").onsubmit = function (ev) {
      ev.preventDefault(); var email = document.getElementById("email").value.trim(); if (!email) return;
      mp(function (m) { m.people.set({ $email: email, waitlist: "solara-prelaunch", variant: variant ? variant.id : null, icon_variant: icon }); });
      track("waitlist_email", { has_plan: !!plan }); px("Lead", { content_name: "solara-waitlist" });
      $screen.querySelector(".wait").innerHTML = orbHTML(120) + '<h1>You\'re on the list</h1><p class="sub">We\'ll write once, when Solara is live. Your plan is saved.</p>';
    };
  }

  // ---------- boot ----------
  function boot(cfg) {
    config = cfg; variant = pickVariant(cfg, qs.get("v") || store.get("variant")); store.set("variant", variant.id);
    ctx.variant = variant.id; ctx.experiment = cfg.experimentId || null; ctx.config_version = cfg.version; mp(function (m) { m.register(ctx); });
    steps = (variant.steps || []).filter(function (s) { return s.type !== "rating"; });
    if (qs.get("step")) { var k = steps.map(function (s) { return s.id; }).indexOf(qs.get("step")); if (k >= 0) { index = -1; history = []; go(k); return; } }
    renderLanding();
  }
  fetch(CONFIG_URL, { cache: "no-store" }).then(function (r) { return r.json(); }).then(boot).catch(function (e) {
    render('<h1>Solara</h1><p class="sub">Could not load the experience. <a href="/apps/solara/">Open the app page</a>.</p>'); track("config_error", { error: String(e) });
  });
})(this);
