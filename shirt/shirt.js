/* Last Day Shirt — shared code for the signing page (/shirt/) and the received-signature page
   (/shirt/s/). No backend: everything travels in the URL fragment (#...), which browsers never
   send to the server. Keep the codec in sync with the app (engine/ShirtLinks.kt, DoodleCodec.kt). */
(function (global) {
  'use strict';
  var BASE = 'https://anuragsingh6436.github.io/shirt/';
  var PLAY = 'https://play.google.com/store/apps/details?id=com.bajrangi.lastdayshirt';
  var LIMITS = { NAME: 24, MESSAGE: 80, SCHOOL: 40, BATCH: 24, PENS: 12, STROKES: 16, POINTS: 300, PAYLOAD: 4000 };
  var ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var PENS = ['#1E1E24', '#1F4FD8', '#E0262F', '#13A04A', '#7B2FBE', '#EC3E92', '#F26B12', '#8B4A1C', '#1597D3', '#E0A800', '#0B6B3A', '#9C1B3A'];
  var PEN_NAMES = ['Black', 'Blue', 'Red', 'Green', 'Purple', 'Pink', 'Orange', 'Brown', 'Sky blue', 'Yellow', 'Dark green', 'Maroon'];

  /* ── text ── */
  function cleanLine(raw, max) {
    if (typeof raw !== 'string') return '';
    var out = '', lastSpace = false;
    var cps = Array.from(raw.slice(0, max * 8));
    for (var i = 0; i < cps.length; i++) {
      var ch = cps[i], c = ch.codePointAt(0);
      if (/\s/.test(ch)) { if (!lastSpace && out) out += ' '; lastSpace = true; continue; }
      if (c < 32 || (c >= 127 && c < 160) || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c === 0x200E || c === 0x200F || c === 0xFEFF) continue;
      out += ch; lastSpace = false;
    }
    return Array.from(out.trim()).slice(0, max).join('').trim();
  }
  function firstName(n) { return (n || '').trim().split(/\s+/)[0] || ''; }

  /* ── base64url (UTF-8) ── */
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(s) {
    if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length > LIMITS.PAYLOAD) return null;
    try {
      var b = s.replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var bin = atob(b), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) { return null; }
  }
  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    var txt = b64decode(h);
    if (!txt) return null;
    try { var o = JSON.parse(txt); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null; } catch (e) { return null; }
  }
  function validKey(k) { return typeof k === 'string' && /^[A-Za-z0-9]{4,12}$/.test(k); }
  function validVersion(o) { var v = (o.v === undefined) ? 1 : o.v; return typeof v === 'number' && v >= 1 && v <= 9; }

  function decodeInvite(o) {
    if (!o || !validVersion(o) || !validKey(o.k)) return null;
    var owner = cleanLine(o.o, LIMITS.NAME);
    if (!owner) return null;
    return { k: o.k, o: owner, s: cleanLine(o.s, LIMITS.SCHOOL), c: cleanLine(o.c, LIMITS.BATCH) };
  }
  function decodeSignature(o) {
    if (!o || !validVersion(o) || !validKey(o.k)) return null;
    var name = cleanLine(o.n, LIMITS.NAME);
    if (!name) return null;
    var p = (typeof o.p === 'number' && o.p >= 0 && o.p < LIMITS.PENS) ? Math.floor(o.p) : 0;
    return { k: o.k, o: cleanLine(o.o, LIMITS.NAME), n: name, m: cleanLine(o.m, LIMITS.MESSAGE), p: p, d: decodeDoodle(o.d) };
  }

  /* ── doodles: strokes of [x0,y0,x1,y1,...] in a unit box, 64x64 grid, 2 chars per point ── */
  function q(v) { return Math.max(0, Math.min(63, Math.round(Math.max(0, Math.min(1, v)) * 63))); }
  function encodeDoodle(strokes) {
    var out = [], points = 0;
    for (var s = 0; s < strokes.length && out.length < LIMITS.STROKES; s++) {
      var st = strokes[s], str = '', lx = -1, ly = -1;
      for (var i = 0; i + 1 < st.length; i += 2) {
        if (points >= LIMITS.POINTS) break;
        var x = q(st[i]), y = q(st[i + 1]);
        if (x !== lx || y !== ly) { str += ALPH[x] + ALPH[y]; points++; }
        lx = x; ly = y;
      }
      if (str) out.push(str);
    }
    return out;
  }
  function decodeDoodle(raw) {
    var out = [], points = 0;
    if (!Array.isArray(raw)) return out;
    for (var s = 0; s < raw.length && out.length < LIMITS.STROKES; s++) {
      var str = raw[s];
      if (typeof str !== 'string' || !str || str.length % 2 || str.length > LIMITS.POINTS * 2) continue;
      var pts = [], ok = true;
      for (var i = 0; i < str.length; i++) { var k = ALPH.indexOf(str[i]); if (k < 0) { ok = false; break; } pts.push(k / 63); }
      if (!ok) continue;
      if (points + pts.length / 2 > LIMITS.POINTS) break;
      points += pts.length / 2;
      out.push(pts);
    }
    return out;
  }
  function simplify(st, minDist) {
    if (st.length <= 4) return st.slice();
    var out = [st[0], st[1]], lx = st[0], ly = st[1];
    for (var i = 2; i + 1 < st.length; i += 2) {
      var dx = st[i] - lx, dy = st[i + 1] - ly;
      if (dx * dx + dy * dy >= minDist * minDist) { out.push(st[i], st[i + 1]); lx = st[i]; ly = st[i + 1]; }
    }
    var n = st.length;
    if (out[out.length - 2] !== st[n - 2] || out[out.length - 1] !== st[n - 1]) out.push(st[n - 2], st[n - 1]);
    return out;
  }

  function inviteLink(inv) {
    return BASE + '#' + b64encode(JSON.stringify({ v: 1, k: inv.k, o: inv.o, s: inv.s, c: inv.c }));
  }
  /** Signature link, kept under ~1800 chars by simplifying (then dropping) the doodle. */
  function signatureLink(sig) {
    var strokes = sig.d.map(function (s) { return s.slice(); });
    var tol = 0.022;
    for (var tries = 0; tries < 12; tries++) {
      var json = JSON.stringify({ v: 1, k: sig.k, o: sig.o, n: sig.n, m: sig.m, p: sig.p, d: encodeDoodle(strokes) });
      var link = BASE + 's/#' + b64encode(json);
      if (link.length <= 1800) return link;
      tol *= 1.6;
      strokes = strokes.map(function (s) { return simplify(s, tol); });
      if (tries > 8) strokes = [];
    }
    return BASE + 's/#' + b64encode(JSON.stringify({ v: 1, k: sig.k, o: sig.o, n: sig.n, m: sig.m, p: sig.p, d: [] }));
  }

  /* ── drawing (design space 1000 x 1100, same as the app's ShirtArt) ── */
  var W = 1000, H = 1100;
  function bodyPath(c, front) {
    c.beginPath();
    c.moveTo(392, 86); c.lineTo(222, 132); c.quadraticCurveTo(140, 220, 76, 322); c.lineTo(182, 388);
    c.quadraticCurveTo(214, 340, 240, 304); c.lineTo(236, 1030); c.quadraticCurveTo(500, 1086, 764, 1030);
    c.lineTo(760, 304); c.quadraticCurveTo(786, 340, 818, 388); c.lineTo(924, 322);
    c.quadraticCurveTo(860, 220, 778, 132); c.lineTo(608, 86); c.quadraticCurveTo(500, front ? 118 : 100, 392, 86);
    c.closePath();
  }
  function drawShirt(c, opts) {
    var front = opts.side !== 'back';
    c.save();
    c.save(); c.translate(12, 22); bodyPath(c, front); c.fillStyle = 'rgba(0,0,0,.18)'; c.filter = 'blur(14px)'; c.fill(); c.restore();
    c.filter = 'none';
    bodyPath(c, front); c.fillStyle = '#FDFDFB'; c.fill();
    c.save(); bodyPath(c, front); c.clip();
    var g = c.createLinearGradient(70, 0, 930, 0);
    g.addColorStop(0, 'rgba(0,0,0,.09)'); g.addColorStop(.2, 'rgba(0,0,0,0)'); g.addColorStop(.78, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.1)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(0,0,0,.035)'; c.lineCap = 'round';
    [[330, 360, 300, 660, 320, 1000], [600, 340, 630, 650, 590, 1010], [450, 420, 420, 700, 470, 1020]].forEach(function (k) {
      c.lineWidth = 28; c.beginPath(); c.moveTo(k[0], k[1]); c.quadraticCurveTo(k[2], k[3], k[4], k[5]); c.stroke();
    });
    var line = '#AEBBCB';
    if (front) {
      c.fillStyle = 'rgba(0,0,0,.05)'; c.fillRect(474, 160, 52, 940);
      c.strokeStyle = 'rgba(174,187,203,.8)'; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(474, 168); c.lineTo(474, 1100); c.moveTo(526, 168); c.lineTo(526, 1100); c.stroke();
      [232, 342, 452, 562, 672, 782, 892, 1002].forEach(function (y) {
        c.beginPath(); c.arc(500, y, 12, 0, Math.PI * 2); c.fillStyle = '#F3F5F8'; c.fill(); c.strokeStyle = '#B9C3CF'; c.lineWidth = 2.4; c.stroke();
      });
      c.beginPath(); c.moveTo(568, 290); c.lineTo(742, 290); c.lineTo(742, 470); c.lineTo(655, 488); c.lineTo(568, 470); c.closePath();
      c.fillStyle = 'rgba(0,0,0,.04)'; c.fill(); c.strokeStyle = line; c.lineWidth = 2.4; c.stroke();
      c.beginPath(); c.moveTo(607, 322); c.lineTo(703, 322); c.lineTo(703, 376); c.quadraticCurveTo(703, 414, 655, 434); c.quadraticCurveTo(607, 414, 607, 376); c.closePath();
      c.fillStyle = '#24407A'; c.fill(); c.strokeStyle = '#E0B040'; c.lineWidth = 4; c.stroke();
      var ini = initials(opts.school || '') || '★';
      c.fillStyle = '#fff'; c.font = '700 30px Poppins, sans-serif'; c.textAlign = 'center'; c.fillText(ini, 655, 394);
    } else {
      c.strokeStyle = 'rgba(174,187,203,.8)'; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(232, 250); c.quadraticCurveTo(500, 270, 768, 250); c.stroke();
    }
    (opts.signatures || []).forEach(function (s) { drawSignature(c, s); });
    // cotton weave on top so the ink looks soaked in
    c.strokeStyle = 'rgba(30,42,68,.04)'; c.lineWidth = 1; c.beginPath();
    for (var y = 60; y < H; y += 7) { c.moveTo(60, y); c.lineTo(940, y); }
    for (var x = 64; x < 940; x += 7) { c.moveTo(x, 60); c.lineTo(x, H); }
    c.stroke();
    c.restore();
    if (front) {
      [[1, 390, 440, 500, 446, 360], [-1, 610, 560, 500, 554, 640]].forEach(function (f) {
        c.beginPath(); c.moveTo(f[1], 80); c.quadraticCurveTo(f[2], 130, f[3], 170); c.lineTo(f[4], 230); c.quadraticCurveTo(f[0] > 0 ? 396 : 604, 176, f[5], 126); c.closePath();
        c.fillStyle = '#FDFDFB'; c.fill(); c.strokeStyle = line; c.lineWidth = 3; c.stroke();
      });
    }
    bodyPath(c, front); c.strokeStyle = line; c.lineWidth = 3; c.stroke();
    c.restore();
  }
  function initials(school) {
    var w = school.trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '';
    if (w.length === 1) return Array.from(w[0]).slice(0, 3).join('').toUpperCase();
    return w.slice(0, 3).map(function (x) { return Array.from(x)[0]; }).join('').toUpperCase();
  }
  function wrap(c, text, maxW, maxLines) {
    var words = text.split(' ').filter(Boolean), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (!line || c.measureText(t).width <= maxW) line = t; else { lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += '…'; }
    return lines;
  }
  /** s: {n, m, p, d, x, y, r, sc} with x/y normalized. */
  function drawSignature(c, s) {
    var color = PENS[s.p] || PENS[0];
    c.save();
    c.translate(s.x * W, s.y * H); c.rotate((s.r || 0) * Math.PI / 180); var sc = s.sc || 1; c.scale(sc, sc);
    c.font = '700 36px Caveat, cursive';
    var lines = s.m ? wrap(c, s.m, 340, 4) : [];
    c.font = '700 48px Caveat, cursive';
    var nameTxt = '– ' + s.n, nameW = c.measureText(nameTxt).width;
    var hasD = s.d && s.d.length, D = hasD ? 104 : 0;
    c.font = '700 36px Caveat, cursive';
    var w = Math.max(D, nameW + 30); lines.forEach(function (l) { w = Math.max(w, c.measureText(l).width); });
    var h = (hasD ? D + 10 : 0) + lines.length * 40 + (lines.length ? 10 : 0) + 55;
    var y = -h / 2;
    c.strokeStyle = color; c.fillStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
    c.shadowColor = color; c.shadowBlur = 3;
    if (hasD) {
      c.lineWidth = 5.5;
      s.d.forEach(function (st) {
        c.beginPath();
        if (st.length < 4) { c.arc(-D / 2 + st[0] * D, y + st[1] * D, 4, 0, Math.PI * 2); c.fill(); return; }
        c.moveTo(-D / 2 + st[0] * D, y + st[1] * D);
        for (var i = 2; i + 1 < st.length; i += 2) c.lineTo(-D / 2 + st[i] * D, y + st[i + 1] * D);
        c.stroke();
      });
      y += D + 10;
    }
    c.textAlign = 'center';
    lines.forEach(function (l, i) { c.fillText(l, 0, y + 40 * (i + 1) - 9); });
    if (lines.length) y += lines.length * 40 + 10;
    c.font = '700 48px Caveat, cursive'; c.textAlign = 'left';
    var nx = w / 2 - nameW - 10, base = y + 42;
    c.fillText(nameTxt, nx, base);
    c.lineWidth = 3.6; c.beginPath(); c.moveTo(nx + 26, base + 12); c.quadraticCurveTo(nx + nameW * .55, base + 24, nx + nameW + 14, base + 4); c.stroke();
    c.restore();
  }
  /** Fit the 1000x1100 design into a canvas (HiDPI aware) and run draw(ctx). */
  function paint(canvas, draw) {
    var dpr = Math.min(window.devicePixelRatio || 1, 3), r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    var c = canvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
    var s = Math.min(canvas.width / W, canvas.height / H) * 0.94;
    c.translate((canvas.width - W * s) / 2, (canvas.height - H * s) / 2); c.scale(s, s);
    draw(c);
  }

  global.Shirt = {
    PLAY: PLAY, LIMITS: LIMITS, PENS: PENS, PEN_NAMES: PEN_NAMES,
    cleanLine: cleanLine, firstName: firstName, readHash: readHash,
    decodeInvite: decodeInvite, decodeSignature: decodeSignature, simplify: simplify,
    inviteLink: inviteLink, signatureLink: signatureLink,
    drawShirt: drawShirt, paint: paint
  };
})(window);
