/* Inland Letter web page: receive, unfold and read a letter from the link; write one back. */
(function () {
  'use strict';
  var codec = window.LetterCodec, art = window.PostalArt;
  var PLAY = 'https://play.google.com/store/apps/details?id=com.bajrangi.inlandletter';
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var SALUTATIONS = ['Priya', 'Dear', 'Pyaare', 'Aadarniya', 'My dearest'];
  var CLOSINGS = ['Tumhara', 'Tumhari', 'Aapka', 'Aapki', 'Yours lovingly', 'Your friend forever'];

  var current = null; // the letter in the link

  // ───────── helpers ─────────
  function show(id) {
    ['home', 'gate', 'stage', 'compose', 'result', 'torn'].forEach(function (v) { $(v).hidden = v !== id; });
    window.scrollTo(0, 0);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function postmarkDate(ms) { var d = new Date(ms); return pad(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2); }
  function letterDate(ms) { var d = new Date(ms); return d.getDate() + ' ' + LONG_MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function town(t) { return (t || '').toUpperCase() || 'DAK GHAR'; }
  function firstName(n) { return (n || '').trim().split(/\s+/)[0] || ''; }
  function ratio(kind) { return kind === 'p' ? 0.66 : 1.5; }
  function stageWidth() { return Math.min($('app').clientWidth - 32, 448); }
  function bodySize(body, kind) {
    var weight = body.length + body.split('\n').length * 22;
    if (kind === 'p') return weight <= 160 ? 21 : weight <= 260 ? 18 : 16;
    return weight <= 320 ? 21 : weight <= 560 ? 18 : weight <= 800 ? 16 : 14;
  }
  function ease(t) { return t * t * (3 - 2 * t); }
  function seg(p, a, b) { return Math.min(1, Math.max(0, (p - a) / (b - a))); }
  function animate(ms, from, to, onFrame) {
    return new Promise(function (resolve) {
      if (REDUCED) { onFrame(to); resolve(); return; }
      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var t = Math.min(1, (ts - start) / ms);
        onFrame(from + (to - from) * t);
        if (t < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, REDUCED ? 0 : ms); }); }

  // ───────── sound (WebAudio, unlocked by the first tap) ─────────
  var ac = null;
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, start, dur, vol, type) {
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
  }
  function bell() { [0, 0.18].forEach(function (t) { tone(2637, t, 0.6, 0.18); tone(3951, t, 0.4, 0.08); }); }
  function noise(dur, freq, vol) {
    var a = audio(); if (!a) return;
    var buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), ch = buf.getChannelData(0);
    for (var i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    var src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(a.destination); src.start();
  }
  function rustle() { noise(0.35, 2400, 0.5); }
  function thump() {
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(120, a.currentTime); o.frequency.exponentialRampToValueAtTime(45, a.currentTime + 0.15);
    g.gain.setValueAtTime(0.7, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.25);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.3);
    noise(0.08, 400, 0.4);
  }
  function buzz() { if (navigator.vibrate && !REDUCED) { try { navigator.vibrate(30); } catch (e) { /* ignore */ } } }

  // ───────── drawing ─────────
  function drawSealed(canvas, l, w) {
    var h = l.kind === 'p' ? w * 0.66 : w / 2;
    var g = art.setup(canvas, w, h), u = w / 100;
    art.folded(g, w, h, l.kind, 1, l.body.length);
    var paper = l.kind === 'p' ? art.C.postcard : art.C.inland;
    var sw = u * 15, sh = u * 18, sx = w - u * 5 - sw, sy = u * 5;
    art.stamp(g, l.stamp, sx, sy, sw, sh, paper, 1);
    art.postmark(g, sx - u * 2, sy + u * 10.5, u * 8.7, postmarkDate(l.sentAt || Date.now()), town(l.town), 1, false);
    var pal = art.palette(l.kind), left = (l.kind === 'p' ? 0.56 : 0.36) * w, top = w * 0.5 * 0.3;
    g.fillStyle = pal.print; g.font = '10px Georgia, serif'; g.textBaseline = 'top';
    g.fillText('To,', left, top + 4);
    g.fillStyle = art.INKS[l.ink] || art.INKS[0];
    g.font = '700 ' + Math.max(18, Math.min(34, u * 6.2)) + 'px Caveat, cursive';
    g.fillText(l.to || '…', left, top + 18, w * 0.92 - left);
    if (l.from || l.town) {
      g.fillStyle = pal.print; g.font = '9px Georgia, serif';
      g.fillText('From:', u * 6, h - u * 4 - 30);
      g.fillStyle = art.INKS[l.ink] || art.INKS[0]; g.font = '700 16px Caveat, cursive';
      g.fillText([l.from, l.town].filter(Boolean).join(', '), u * 6, h - u * 4 - 18, w * 0.6);
    }
    canvas.parentNode.style.width = w + 'px';
    canvas.parentNode.style.height = h + 'px';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Sealed letter to ' + (l.to || 'you') + (l.from ? ' from ' + l.from : ''));
  }

  /** The written side as DOM over a painted paper background; same proportions as the app. */
  function sheetFace(l, w, bg) {
    var h = w * ratio(l.kind), s = w / 328, ink = art.INKS[l.ink] || art.INKS[0];
    var pal = art.palette(l.kind);
    var sheet = el('div', 'sheet');
    sheet.style.width = w + 'px'; sheet.style.height = h + 'px'; sheet.style.backgroundImage = 'url(' + bg + ')';
    var inner = el('div', 'in');
    inner.style.padding = (18 * s) + 'px ' + (24 * s) + 'px';
    var hdr = el('div', 'hdr'); hdr.style.color = pal.print;
    var b = el('b', null, l.kind === 'p' ? 'POST CARD' : 'INLAND LETTER CARD'); b.style.fontSize = (12 * s) + 'px';
    var hi = el('span', null, l.kind === 'p' ? 'पोस्ट कार्ड' : 'अंतर्देशीय पत्र'); hi.style.fontSize = (11 * s) + 'px';
    hdr.appendChild(b); hdr.appendChild(hi); inner.appendChild(hdr);
    var size = bodySize(l.body, l.kind) * s;
    if (l.sentAt) { var dt = el('div', 'date', letterDate(l.sentAt)); dt.style.fontSize = (15 * s) + 'px'; dt.style.color = ink; inner.appendChild(dt); }
    var greet = [l.salutation, l.to].filter(Boolean).join(' ');
    if (greet) { var gr = el('div', 'greet', greet + ','); gr.style.fontSize = (size + 3 * s) + 'px'; gr.style.color = ink; inner.appendChild(gr); }
    var body = el('div', 'body', l.body);
    body.style.fontSize = size + 'px'; body.style.lineHeight = (size * 1.18) + 'px'; body.style.color = ink; body.style.paddingLeft = (6 * s) + 'px';
    inner.appendChild(body);
    if (l.closing) { var c = el('div', 'close', l.closing + ','); c.style.fontSize = (size + s) + 'px'; c.style.color = ink; inner.appendChild(c); }
    if (l.from) { var f = el('div', 'from', l.from); f.style.fontSize = (size + 4 * s) + 'px'; f.style.color = ink; inner.appendChild(f); }
    sheet.appendChild(inner);
    var edge = el('div', 'edge', l.kind === 'p' ? 'Write your message here · Keep it short and sweet' : 'Fold along the lines · Write only inside the border');
    edge.style.fontSize = (7 * s) + 'px'; edge.style.color = pal.print;
    sheet.appendChild(edge);
    return sheet;
  }

  function paint(w, h, fn) {
    var c = document.createElement('canvas');
    var g = art.setup(c, w, h);
    fn(g);
    return c.toDataURL('image/png');
  }

  /** Builds the 3-panel fold (or the postcard flip). Returns setProgress(p): 0 open … 1 folded. */
  function buildFold(box, l, w) {
    box.innerHTML = '';
    var h = w * ratio(l.kind);
    box.style.width = w + 'px'; box.style.height = h + 'px';
    var front = paint(w, h, function (g) { art.sheet(g, w, h, l.kind, 1); });
    if (l.kind === 'p') {
      var card = el('div', 'card3d');
      var f = el('div', 'face'); f.appendChild(sheetFace(l, w, front));
      var back = el('div', 'face back'); var bc = document.createElement('canvas'); back.appendChild(bc);
      card.appendChild(f); card.appendChild(back); box.appendChild(card);
      drawSealedInto(bc, l, w, h);
      return function (p) { card.style.transform = 'rotateY(' + (180 * ease(Math.min(1, Math.max(0, p)))) + 'deg)'; };
    }
    var third = h / 3, panels = [];
    var backImg = paint(w, third, function (g) { art.sheetBack(g, w, third, l.kind, 1, true); });
    var plainBack = paint(w, third, function (g) { art.sheetBack(g, w, third, l.kind, 1, false); });
    for (var i = 0; i < 3; i++) {
      var panel = el('div', 'panel');
      panel.style.top = (i * third) + 'px'; panel.style.height = third + 'px';
      panel.style.transformOrigin = i === 0 ? '50% 100%' : '50% 0%';
      var face = el('div', 'face');
      var sheet = sheetFace(l, w, front); sheet.style.top = (-i * third) + 'px'; sheet.style.boxShadow = 'none';
      face.appendChild(sheet);
      var bk = el('div', 'face back'); bk.style.backgroundImage = 'url(' + (i === 0 ? backImg : plainBack) + ')'; bk.style.backgroundSize = '100% 100%';
      panel.appendChild(face); panel.appendChild(bk); box.appendChild(panel); panels.push(panel);
    }
    return function (p) {
      p = Math.min(1, Math.max(0, p));
      var a = ease(seg(p, 0, 0.5)), b = ease(seg(p, 0.5, 1));
      var topA = -180 * b, botA = 180 * a;
      panels[0].style.transform = 'rotateX(' + topA + 'deg)';
      panels[2].style.transform = 'rotateX(' + botA + 'deg)';
      panels[0].style.zIndex = p > 0.5 ? 3 : 1; panels[1].style.zIndex = 1; panels[2].style.zIndex = 2;
      var proj = function (deg) { return Math.max(0, Math.cos(deg * Math.PI / 180)); };
      var shift = (third * (proj(topA) - proj(botA))) / 2;
      box.style.transform = 'translateY(' + shift + 'px)';
    };
  }

  function drawSealedInto(canvas, l, w, h) {
    var g = art.setup(canvas, w, h);
    art.folded(g, w, h, l.kind, 1, l.body.length);
    var u = w / 100, sw = u * 15, sh = u * 18, sx = w - u * 5 - sw, sy = u * 5;
    art.stamp(g, l.stamp, sx, sy, sw, sh, art.C.postcard, 1);
    art.postmark(g, sx - u * 2, sy + u * 10.5, u * 8.7, postmarkDate(l.sentAt || Date.now()), town(l.town), 1, false);
  }

  // ───────── receiving ─────────
  function receive() {
    audio();
    show('stage');
    var l = current, w = stageWidth();
    var sealed = $('sealed');
    sealed.hidden = false; $('fold').hidden = true;
    drawSealed($('sealedCanvas'), l, w);
    $('stageBox').style.minHeight = (w * (l.kind === 'p' ? 0.66 : 0.5) + 150) + 'px';
    var dk = $('dakiya'), g = art.setup(dk, 170, 140), boxW = $('stageBox').clientWidth;
    function drawRider(x, pedal, ring) {
      g.clearRect(0, 0, 170, 140); art.dakiya(g, 170, 140, pedal, ring, 1);
      dk.style.transform = 'translateX(' + x + 'px)';
    }
    sealed.style.visibility = 'hidden';
    return animate(1700, -200, boxW * 0.3, function (x) { drawRider(x, x / 60, 0); })
      .then(function () { bell(); buzz(); return animate(500, 0, 1, function (r) { drawRider(boxW * 0.3, boxW * 0.3 / 60, r); }); })
      .then(function () {
        sealed.style.visibility = 'visible'; sealed.classList.add('drop');
        return wait(700);
      })
      .then(function () { thump(); buzz(); return wait(250); })
      .then(function () { return animate(1400, boxW * 0.3, boxW + 40, function (x) { drawRider(x, x / 60, 0); }); })
      .then(function () {
        dk.style.display = 'none';
        sealed.classList.remove('drop'); sealed.classList.add('rest');
        if (l.deliverAt && Date.now() < l.deliverAt) lockUntil(l.deliverAt); else readyToOpen();
      });
  }

  function lockUntil(t) {
    $('lock').hidden = false; $('hint').hidden = true;
    var d = new Date(t);
    $('lockWhen').textContent = 'Sealed until ' + d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    (function tick() {
      var left = t - Date.now();
      if (left <= 0) { $('lock').hidden = true; bell(); readyToOpen(); return; }
      var s = Math.ceil(left / 1000);
      $('countdown').textContent = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
      setTimeout(tick, 1000);
    })();
  }

  function readyToOpen() {
    $('hint').hidden = false;
    var sealed = $('sealed');
    var open = function () {
      sealed.removeEventListener('click', open); sealed.removeEventListener('keydown', key);
      unfold();
    };
    var key = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    sealed.addEventListener('click', open); sealed.addEventListener('keydown', key);
  }

  function unfold() {
    var l = current, w = stageWidth();
    $('hint').hidden = true;
    var box = $('fold');
    var set = buildFold(box, l, w);
    set(1);
    $('sealed').hidden = true; box.hidden = false;
    $('stageBox').style.minHeight = (w * ratio(l.kind)) + 'px';
    rustle(); buzz();
    return wait(200)
      .then(function () { return animate(900, 1, 0.5, set); })
      .then(function () { rustle(); return animate(900, 0.5, 0, set); })
      .then(function () {
        $('readActions').hidden = false;
        $('replyApp').href = PLAY;
      });
  }

  // ───────── writing back ─────────
  function chips(container, values, input) {
    container.innerHTML = '';
    values.forEach(function (v) {
      var b = el('button', 'chip', v); b.type = 'button';
      b.addEventListener('click', function () { input.value = v; });
      container.appendChild(b);
    });
  }

  function compose(replyTo) {
    show('compose');
    $('composeTitle').textContent = replyTo ? 'Write back to ' + (firstName(replyTo.from) || 'them') : 'Write a letter';
    if (replyTo) $('fTo').value = replyTo.from || '';
    chips($('salChips'), SALUTATIONS, $('fSal'));
    chips($('closeChips'), CLOSINGS, $('fClose'));
    var bodyEl = $('fBody');
    bodyEl.addEventListener('input', function () { $('count').textContent = bodyEl.value.length; });
  }

  function post(e) {
    e.preventDefault();
    var ink = parseInt((document.querySelector('input[name=ink]:checked') || { value: '0' }).value, 10) || 0;
    var l = codec.sanitize({
      kind: 'i', salutation: $('fSal').value, to: $('fTo').value, body: $('fBody').value,
      closing: $('fClose').value, from: $('fFrom').value, town: $('fTown').value,
      sentAt: Date.now(), deliverAt: 0, ink: ink, stamp: 'tiger'
    });
    if (!l.body.trim()) { $('formError').hidden = false; return; }
    $('formError').hidden = true;
    audio();
    codec.encode(l).then(function (payload) {
      var link = codec.link(payload);
      show('result');
      var w = stageWidth(), box = $('rfold');
      $('resultBox').style.minHeight = (w * 1.5) + 'px';
      var set = buildFold(box, l, w);
      set(0);
      return wait(300)
        .then(function () { rustle(); return animate(900, 0, 0.5, set); })
        .then(function () { rustle(); return animate(900, 0.5, 1, set); })
        .then(function () {
          box.hidden = true;
          var rs = $('rsealed'); rs.hidden = false;
          drawSealed($('rsealedCanvas'), l, w);
          $('resultBox').style.minHeight = '';
          thump(); buzz();
          var msg = '📮 You\'ve got a letter from ' + (firstName(l.from) || 'a friend') + '!\nOpen it here: ' + link;
          $('sendWa').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
          $('sendShare').hidden = !navigator.share;
          $('sendShare').onclick = function () { navigator.share({ text: msg }).catch(function () { /* cancelled */ }); };
          $('sendCopy').onclick = function () {
            var done = function () { $('copied').hidden = false; };
            if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, function () { prompt('Copy this link', link); });
            else prompt('Copy this link', link);
          };
          $('resultActions').hidden = false;
        });
    });
  }

  // ───────── start ─────────
  function start() {
    document.querySelectorAll('.play').forEach(function (a) { a.href = PLAY; });
    $('homePlay').href = PLAY;
    $('form').addEventListener('submit', post);
    $('homeWrite').addEventListener('click', function () { compose(null); });
    $('replyWeb').addEventListener('click', function () { compose(current); });
    $('receive').addEventListener('click', function () { receive(); });

    var m = /^#?([0-9][a-z][A-Za-z0-9_-]+)/.exec(location.hash || '');
    if (!m) {
      show('home');
      var g = art.setup($('homeBox'), 84, 150);
      g.translate(8, 0); art.postBox(g, 68, 150, 1);
      return;
    }
    codec.decode(m[1]).then(function (r) {
      if (!r.ok) {
        if (r.reason === 'NO_INFLATE') $('tornText').textContent = 'This browser is too old to open the letter. Open the link in Chrome, or get the app.';
        show('torn');
        return;
      }
      current = r.letter;
      var from = firstName(current.from);
      $('gateTitle').textContent = 'Dakiya is here!';
      $('gateSub').textContent = from ? 'There is a letter for you from ' + from + '.' : 'There is a letter for you.';
      document.title = '📮 A letter' + (from ? ' from ' + from : '') + ' · Inland Letter';
      show('gate');
    });
  }

  var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(start, start);
})();
