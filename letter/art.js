/*
 * Inland Letter: hand-drawn postal art on <canvas>, ported from PostalArt.kt so the web page
 * looks like the app. Original illustrations; no real stamps, emblems or logos.
 */
(function (root) {
  'use strict';
  var C = {
    inland: '#DCE9F5', inlandDeep: '#C7DAEC', print: '#2D5683',
    postcard: '#F3E1A2', postcardDeep: '#E2C66F', postcardPrint: '#6A4A12',
    red: '#B0261E', redDark: '#7C1913', redLight: '#D9473C',
    khaki: '#B79D62', khakiDark: '#7B6634', stampInk: 'rgba(91,58,142,0.8)',
    desk: '#F4EAD8', deskDeep: '#E7D5B5', dark: '#3A2A1E'
  };
  var INKS = ['#1C3C8C', '#1E1C22', '#2A3DB0'];

  function rng(seed) { // small deterministic PRNG (mulberry32)
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function alpha(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function circle(g, x, y, r, fill) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); }
  function ring(g, x, y, r, stroke, w) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.strokeStyle = stroke; g.lineWidth = w; g.stroke(); }
  function line(g, x1, y1, x2, y2, stroke, w) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = stroke; g.lineWidth = w; g.lineCap = 'round'; g.stroke();
  }
  function oval(g, x, y, w, h, fill) { g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); }

  function fibres(g, w, h, seed, color, d, count) {
    var r = rng(seed);
    var n = Math.max(40, Math.min(900, Math.floor((count || 220) * (w * h) / (360 * 560 * d * d))));
    g.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var x = r() * w, y = r() * h, len = (3 + r() * 9) * d, a = r() * Math.PI * 2;
      g.globalAlpha = 0.35 + r() * 0.65;
      line(g, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, color, 0.7 * d);
    }
    g.globalAlpha = 1;
  }

  function palette(kind) {
    return kind === 'p'
      ? { paper: C.postcard, deep: C.postcardDeep, print: C.postcardPrint }
      : { paper: C.inland, deep: C.inlandDeep, print: C.print };
  }

  /** Open sheet: paper, fibres, double printed border, fold lines for the inland letter. */
  function sheet(g, w, h, kind, d) {
    var p = palette(kind);
    var grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, p.paper); grad.addColorStop(0.6, p.paper); grad.addColorStop(1, alpha(p.deep, 1));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    fibres(g, w, h, kind === 'p' ? 7 : 3, p.deep, d);
    var m = 10 * d, m2 = m + 4 * d;
    g.strokeStyle = alpha(p.print, 0.75); g.lineWidth = 1.6 * d; g.strokeRect(m, m, w - 2 * m, h - 2 * m);
    g.strokeStyle = alpha(p.print, 0.45); g.lineWidth = 0.8 * d; g.strokeRect(m2, m2, w - 2 * m2, h - 2 * m2);
    if (kind !== 'p') {
      [1 / 3, 2 / 3].forEach(function (f) {
        var y = h * f;
        g.setLineDash([7 * d, 5 * d]);
        line(g, m2, y, w - m2, y, alpha(p.print, 0.35), d);
        g.setLineDash([]);
        line(g, 0, y, m * 0.8, y, alpha(p.print, 0.6), 1.4 * d);
        line(g, w - m * 0.8, y, w, y, alpha(p.print, 0.6), 1.4 * d);
      });
    }
  }

  function sheetBack(g, w, h, kind, d, addressLines) {
    var p = palette(kind);
    g.fillStyle = p.paper; g.fillRect(0, 0, w, h);
    g.fillStyle = alpha(p.deep, 0.5); g.fillRect(0, 0, w, h);
    fibres(g, w, h, 11, p.deep, d, 160);
    var m = 8 * d;
    g.strokeStyle = alpha(p.print, 0.55); g.lineWidth = 1.2 * d; g.strokeRect(m, m, w - 2 * m, h - 2 * m);
    if (addressLines) {
      for (var i = 0, y = h * 0.52; i < 3; i++, y += h * 0.13) line(g, w * 0.42, y, w - m * 3, y, alpha(p.print, 0.45), d);
    }
  }

  var STAMP_BG = {
    tiger: '#F1C27D', peacock: '#9FD3C7', lotus: '#F5C6D0', chai: '#E9D2B0', monsoon: '#B9CFE6',
    train: '#D7C9E8', mango: '#CFE3A3', kite: '#FFE08A', postbox: '#F2D3C4', cycle: '#C9E1F0'
  };

  function stamp(g, id, x, y, w, h, behind, d) {
    g.save(); g.translate(x, y);
    var hole = Math.min(w, h) * 0.045;
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(1.5 * d, 2 * d, w, h);
    g.fillStyle = '#FFFCF4'; g.fillRect(0, 0, w, h);
    var step = hole * 2.6, t;
    for (t = step / 2; t < w; t += step) { circle(g, t, 0, hole, behind); circle(g, t, h, hole, behind); }
    for (t = step / 2; t < h; t += step) { circle(g, 0, t, hole, behind); circle(g, w, t, hole, behind); }
    var inset = Math.min(w, h) * 0.11, pw = w - 2 * inset, ph = h - 2 * inset;
    g.translate(inset, inset);
    g.fillStyle = STAMP_BG[id] || STAMP_BG.tiger; g.fillRect(0, 0, pw, ph);
    g.save(); g.beginPath(); g.rect(0, 0, pw, ph); g.clip();
    picture(g, id, pw, ph, d);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 0.8 * d; g.strokeRect(0, 0, pw, ph);
    g.restore();
  }

  function picture(g, id, w, h, d) {
    var lw = Math.max(Math.min(w, h) * 0.035, d), dark = C.dark, i, a;
    function P(x, y) { return [w * x, h * y]; }
    switch (id) {
      case 'peacock': {
        var b = P(0.5, 0.78);
        for (i = 0; i <= 8; i++) {
          a = Math.PI * (0.1 + 0.8 * i / 8);
          var tx = b[0] - Math.cos(a) * w * 0.42, ty = b[1] - Math.sin(a) * h * 0.55;
          line(g, b[0], b[1], tx, ty, '#1F7A5A', lw * 0.8);
          circle(g, tx, ty, Math.min(w, h) * 0.075, '#1F7A5A');
          circle(g, tx, ty, Math.min(w, h) * 0.045, '#2A4FA0');
          circle(g, tx, ty, Math.min(w, h) * 0.018, '#E2B33C');
        }
        oval(g, b[0] - w * 0.08, b[1] - h * 0.18, w * 0.16, h * 0.24, '#1E4FA8');
        circle(g, b[0], b[1] - h * 0.26, w * 0.06, '#1E4FA8');
        break;
      }
      case 'lotus': {
        var c = P(0.5, 0.6);
        [-55, -28, 0, 28, 55].forEach(function (deg) {
          g.save(); g.translate(c[0], c[1] + h * 0.12); g.rotate(deg * Math.PI / 180); g.translate(-c[0], -(c[1] + h * 0.12));
          oval(g, c[0] - w * 0.09, c[1] - h * 0.3, w * 0.18, h * 0.42, '#E0668A');
          oval(g, c[0] - w * 0.05, c[1] - h * 0.24, w * 0.1, h * 0.3, '#F2A0B6');
          g.restore();
        });
        for (i = 0; i < 3; i++) line(g, w * 0.12, h * (0.8 + i * 0.07), w * 0.88, h * (0.8 + i * 0.07), '#2E6FA0', lw * 0.7);
        break;
      }
      case 'chai': {
        g.beginPath(); g.moveTo(w * 0.3, h * 0.38); g.lineTo(w * 0.7, h * 0.38); g.lineTo(w * 0.64, h * 0.86); g.lineTo(w * 0.36, h * 0.86); g.closePath();
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.fill();
        g.beginPath(); g.moveTo(w * 0.315, h * 0.48); g.lineTo(w * 0.685, h * 0.48); g.lineTo(w * 0.64, h * 0.86); g.lineTo(w * 0.36, h * 0.86); g.closePath();
        g.fillStyle = '#B0703A'; g.fill();
        g.beginPath(); g.moveTo(w * 0.3, h * 0.38); g.lineTo(w * 0.7, h * 0.38); g.lineTo(w * 0.64, h * 0.86); g.lineTo(w * 0.36, h * 0.86); g.closePath();
        g.strokeStyle = dark; g.lineWidth = lw; g.stroke();
        for (i = 0; i < 3; i++) {
          var x = w * (0.4 + i * 0.1);
          g.beginPath(); g.moveTo(x, h * 0.32); g.bezierCurveTo(x - w * 0.06, h * 0.25, x + w * 0.06, h * 0.2, x, h * 0.12);
          g.strokeStyle = 'rgba(107,84,64,0.67)'; g.lineWidth = lw; g.stroke();
        }
        break;
      }
      case 'monsoon': {
        circle(g, w * 0.38, h * 0.32, w * 0.16, '#6E8FB5');
        circle(g, w * 0.58, h * 0.28, w * 0.2, '#6E8FB5');
        g.fillStyle = '#6E8FB5'; g.fillRect(w * 0.2, h * 0.3, w * 0.62, h * 0.14);
        var r = rng(5);
        for (i = 0; i < 9; i++) { var rx = w * (0.2 + r() * 0.6), ry = h * (0.5 + r() * 0.18); line(g, rx, ry, rx - w * 0.03, ry + h * 0.07, '#2E5F9A', lw * 0.7); }
        g.beginPath(); g.ellipse(w * 0.5, h * 0.78, w * 0.14, h * 0.1, 0, Math.PI, 0); g.closePath(); g.fillStyle = C.red; g.fill();
        line(g, w * 0.5, h * 0.78, w * 0.5, h * 0.92, dark, lw * 0.7);
        break;
      }
      case 'train': {
        g.fillStyle = '#3A2F4A';
        g.fillRect(w * 0.18, h * 0.5, w * 0.5, h * 0.2); g.fillRect(w * 0.52, h * 0.36, w * 0.24, h * 0.34); g.fillRect(w * 0.24, h * 0.36, w * 0.08, h * 0.14);
        g.fillStyle = '#E2B33C'; g.fillRect(w * 0.57, h * 0.42, w * 0.13, h * 0.1);
        circle(g, w * 0.3, h * 0.74, w * 0.08, C.red); circle(g, w * 0.62, h * 0.74, w * 0.08, C.red);
        line(g, w * 0.08, h * 0.83, w * 0.92, h * 0.83, dark, lw);
        circle(g, w * 0.28, h * 0.27, w * 0.07, 'rgba(255,255,255,0.8)'); circle(g, w * 0.18, h * 0.16, w * 0.09, 'rgba(255,255,255,0.8)');
        break;
      }
      case 'mango': {
        g.save(); g.translate(w * 0.5, h * 0.55); g.rotate(-20 * Math.PI / 180); g.translate(-w * 0.5, -h * 0.55);
        oval(g, w * 0.26, h * 0.3, w * 0.5, h * 0.52, '#F2A61F'); oval(g, w * 0.5, h * 0.5, w * 0.22, h * 0.26, 'rgba(224,85,31,0.33)');
        g.restore();
        g.beginPath(); g.moveTo(w * 0.52, h * 0.28); g.quadraticCurveTo(w * 0.72, h * 0.08, w * 0.86, h * 0.2); g.quadraticCurveTo(w * 0.7, h * 0.36, w * 0.52, h * 0.28);
        g.fillStyle = '#3E8A3A'; g.fill();
        line(g, w * 0.5, h * 0.3, w * 0.48, h * 0.2, '#5A3A1A', lw);
        break;
      }
      case 'kite': {
        g.beginPath(); g.moveTo(w * 0.5, h * 0.12); g.lineTo(w * 0.78, h * 0.42); g.lineTo(w * 0.5, h * 0.72); g.lineTo(w * 0.22, h * 0.42); g.closePath(); g.fillStyle = '#D94A7A'; g.fill();
        g.beginPath(); g.moveTo(w * 0.5, h * 0.12); g.lineTo(w * 0.78, h * 0.42); g.lineTo(w * 0.5, h * 0.72); g.closePath(); g.fillStyle = '#7B3FB0'; g.fill();
        line(g, w * 0.5, h * 0.12, w * 0.5, h * 0.72, dark, lw * 0.6); line(g, w * 0.22, h * 0.42, w * 0.78, h * 0.42, dark, lw * 0.6);
        g.beginPath(); g.moveTo(w * 0.5, h * 0.72); g.bezierCurveTo(w * 0.35, h * 0.8, w * 0.65, h * 0.86, w * 0.42, h * 0.95); g.strokeStyle = dark; g.lineWidth = lw; g.stroke();
        break;
      }
      case 'postbox': {
        g.save(); g.translate(w * 0.3, h * 0.12); postBox(g, w * 0.4, h * 0.78, d); g.restore();
        break;
      }
      case 'cycle': {
        var rr = w * 0.15;
        ring(g, w * 0.3, h * 0.68, rr, dark, lw); ring(g, w * 0.72, h * 0.68, rr, dark, lw);
        g.beginPath();
        g.moveTo(w * 0.3, h * 0.68); g.lineTo(w * 0.46, h * 0.44); g.lineTo(w * 0.66, h * 0.44); g.lineTo(w * 0.72, h * 0.68);
        g.moveTo(w * 0.46, h * 0.44); g.lineTo(w * 0.52, h * 0.68); g.lineTo(w * 0.3, h * 0.68);
        g.moveTo(w * 0.66, h * 0.44); g.lineTo(w * 0.62, h * 0.32);
        g.strokeStyle = '#1C3C8C'; g.lineWidth = lw; g.lineCap = 'round'; g.stroke();
        g.fillStyle = '#8A5A2A'; g.fillRect(w * 0.72, h * 0.36, w * 0.16, h * 0.12);
        break;
      }
      default: { // tiger
        var cx = w * 0.5, cy = h * 0.55, R = Math.min(w, h) * 0.3;
        circle(g, cx - R * 0.75, cy - R * 0.8, R * 0.32, '#E07B22'); circle(g, cx + R * 0.75, cy - R * 0.8, R * 0.32, '#E07B22');
        circle(g, cx, cy, R, '#E07B22');
        oval(g, cx - R * 0.55, cy + R * 0.05, R * 1.1, R * 0.85, '#FFF3E0');
        [-0.45, 0, 0.45].forEach(function (s) { line(g, cx + s * R, cy - R * 0.98, cx + s * R * 0.8, cy - R * 0.6, dark, lw); });
        line(g, cx - R, cy, cx - R * 0.65, cy + R * 0.05, dark, lw); line(g, cx + R, cy, cx + R * 0.65, cy + R * 0.05, dark, lw);
        circle(g, cx - R * 0.38, cy - R * 0.2, R * 0.1, dark); circle(g, cx + R * 0.38, cy - R * 0.2, R * 0.1, dark);
        circle(g, cx, cy + R * 0.2, R * 0.12, '#8A3A2A');
      }
    }
  }

  /** Rubber-stamp rings + date/town text; wavy killer lines optional. */
  function postmark(g, cx, cy, r, date, town, d, wavy) {
    g.save();
    ring(g, cx, cy, r, C.stampInk, 2.2 * d);
    ring(g, cx, cy, r * 0.66, C.stampInk, 1.4 * d);
    if (wavy) {
      for (var i = -2; i <= 2; i++) {
        var y0 = cy + i * r * 0.28, x = cx + r * 1.1, up = true;
        g.beginPath(); g.moveTo(x, y0);
        while (x < cx + r * 3.4) { var nx = x + r * 0.38; g.quadraticCurveTo((x + nx) / 2, y0 + (up ? -1 : 1) * r * 0.12, nx, y0); x = nx; up = !up; }
        g.strokeStyle = C.stampInk; g.lineWidth = 1.8 * d; g.stroke();
      }
    }
    g.translate(cx, cy); g.rotate(-14 * Math.PI / 180);
    g.fillStyle = C.stampInk; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 ' + Math.round(r * 0.27) + 'px Poppins, sans-serif';
    g.fillText(date, 0, 0);
    g.font = '700 ' + Math.round(r * 0.2) + 'px Poppins, sans-serif';
    var t = town; while (t.length > 3 && g.measureText(t).width > r * 1.5) t = t.slice(0, -1);
    g.fillText(t, 0, -r * 0.83 + r * 0.2);
    g.restore();
  }

  function postBox(g, w, h, d) {
    var capH = h * 0.2;
    g.beginPath(); g.ellipse(w / 2, capH * 0.8, w * 0.54, capH * 0.8, 0, Math.PI, 0); g.closePath(); g.fillStyle = C.redDark; g.fill();
    g.fillStyle = C.redDark; g.fillRect(-w * 0.06, capH * 0.78, w * 1.12, h * 0.06);
    var grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, C.redDark); grad.addColorStop(0.35, C.redLight); grad.addColorStop(0.65, C.red); grad.addColorStop(1, C.redDark);
    g.fillStyle = grad; g.fillRect(0, capH * 0.78 + h * 0.06, w, h * 0.74 - capH * 0.78 + capH);
    g.fillStyle = '#2A0D0B'; g.fillRect(w * 0.18, h * 0.3, w * 0.64, h * 0.045);
    g.fillStyle = '#F4EAD8'; g.fillRect(w * 0.26, h * 0.46, w * 0.48, h * 0.16);
    for (var i = 0; i < 3; i++) line(g, w * 0.32, h * (0.5 + i * 0.04), w * 0.68, h * (0.5 + i * 0.04), 'rgba(59,42,26,0.6)', d);
    g.fillStyle = C.redDark; g.fillRect(-w * 0.05, h * 0.92, w * 1.1, h * 0.08);
  }

  /** The dakiya on his bicycle facing right in a w×h box. pedal 0..1 turns wheels/legs. */
  function dakiya(g, w, h, pedal, bell, d) {
    var wheelR = h * 0.2, back = [w * 0.24, h * 0.78], front = [w * 0.78, h * 0.78], metal = '#2B2B33', i, a;
    [back, front].forEach(function (c) {
      ring(g, c[0], c[1], wheelR, metal, h * 0.028);
      for (i = 0; i < 4; i++) {
        a = pedal * 2 * Math.PI + i * Math.PI / 4;
        line(g, c[0] - Math.cos(a) * wheelR, c[1] - Math.sin(a) * wheelR, c[0] + Math.cos(a) * wheelR, c[1] + Math.sin(a) * wheelR, 'rgba(59,59,68,0.6)', d);
      }
    });
    var crank = [w * 0.47, h * 0.78], seat = [w * 0.4, h * 0.5], head = [w * 0.72, h * 0.48];
    g.beginPath();
    g.moveTo(back[0], back[1]); g.lineTo(seat[0], seat[1]); g.lineTo(head[0], head[1]); g.lineTo(front[0], front[1]);
    g.moveTo(back[0], back[1]); g.lineTo(crank[0], crank[1]); g.lineTo(seat[0], seat[1]);
    g.moveTo(crank[0], crank[1]); g.lineTo(head[0], head[1]);
    g.strokeStyle = '#1C3C8C'; g.lineWidth = h * 0.03; g.lineCap = 'round'; g.stroke();
    line(g, head[0], head[1], head[0] - w * 0.03, h * 0.38, metal, h * 0.025);
    line(g, head[0] - w * 0.07, h * 0.38, head[0] + w * 0.02, h * 0.38, metal, h * 0.025);
    g.save(); g.translate(head[0], h * 0.36); g.rotate(Math.sin(bell * Math.PI * 6) * 18 * bell * Math.PI / 180);
    circle(g, w * 0.005, -h * 0.01, h * 0.025, '#D9B23C'); g.restore();
    g.fillStyle = metal; g.fillRect(back[0] - w * 0.02, h * 0.55, w * 0.16, h * 0.02);
    g.fillStyle = C.khakiDark; g.fillRect(back[0] - w * 0.06, h * 0.5, w * 0.17, h * 0.17);
    g.fillStyle = C.red; g.fillRect(back[0] - w * 0.06, h * 0.5, w * 0.17, h * 0.05);
    a = pedal * 2 * Math.PI;
    var pA = [crank[0] + Math.cos(a) * h * 0.08, crank[1] + Math.sin(a) * h * 0.08];
    var pB = [crank[0] - Math.cos(a) * h * 0.08, crank[1] - Math.sin(a) * h * 0.08];
    var hip = [seat[0] + w * 0.01, seat[1] - h * 0.03];
    [[pB, C.khakiDark], [pA, C.khaki]].forEach(function (e) {
      var pd = e[0], knee = [(hip[0] + pd[0]) / 2 + w * 0.07, (hip[1] + pd[1]) / 2 - h * 0.05];
      g.beginPath(); g.moveTo(hip[0], hip[1]); g.lineTo(knee[0], knee[1]); g.lineTo(pd[0], pd[1]);
      g.strokeStyle = e[1]; g.lineWidth = h * 0.05; g.lineJoin = 'round'; g.stroke();
      line(g, pd[0], pd[1], pd[0] + w * 0.035, pd[1], '#2A1A10', h * 0.035);
    });
    var sh = [w * 0.47, h * 0.22];
    line(g, hip[0], hip[1], sh[0], sh[1], C.khaki, h * 0.09);
    line(g, sh[0] + w * 0.01, sh[1] + h * 0.03, head[0] - w * 0.05, h * 0.38, C.khakiDark, h * 0.04);
    line(g, sh[0] - w * 0.03, sh[1], hip[0] + w * 0.04, hip[1] - h * 0.02, '#6B4A22', h * 0.015);
    var hc = [sh[0] + w * 0.02, h * 0.11];
    circle(g, hc[0], hc[1], h * 0.065, '#9A6A48');
    g.beginPath(); g.ellipse(hc[0], hc[1] - h * 0.035, h * 0.07, h * 0.05, 0, Math.PI, 0); g.closePath(); g.fillStyle = C.khakiDark; g.fill();
    line(g, hc[0], hc[1] - h * 0.035, hc[0] + h * 0.1, hc[1] - h * 0.03, C.khakiDark, h * 0.018);
    line(g, hc[0] + h * 0.02, hc[1] + h * 0.025, hc[0] + h * 0.065, hc[1] + h * 0.02, '#2A1A10', h * 0.014);
  }

  /** Folded, sealed letter (address side). */
  function folded(g, w, h, kind, d, seed) {
    var p = palette(kind);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(2 * d, 3 * d, w, h);
    g.fillStyle = p.paper; g.fillRect(0, 0, w, h);
    fibres(g, w, h, seed || 1, p.deep, d, 90);
    if (kind !== 'p') {
      g.fillStyle = alpha(p.deep, 0.55); g.fillRect(0, 0, w, h * 0.16);
      line(g, 0, h * 0.16, w, h * 0.16, alpha(p.print, 0.55), 1.2 * d);
      g.setLineDash([3 * d, 3 * d]);
      line(g, w * 0.03, 0, w * 0.03, h, alpha(p.print, 0.3), d);
      line(g, w * 0.97, 0, w * 0.97, h, alpha(p.print, 0.3), d);
      g.setLineDash([]);
    } else {
      line(g, w * 0.5, h * 0.12, w * 0.5, h * 0.88, alpha(p.print, 0.5), d);
    }
    var left = kind !== 'p' ? w * 0.36 : w * 0.56;
    for (var i = 0, y = h * 0.5; i < 3; i++, y += h * 0.13) line(g, left, y, w * 0.92, y, alpha(p.print, 0.5), d);
  }

  /** Prepares a canvas for crisp drawing at devicePixelRatio; returns a 2D context in CSS px. */
  function setup(canvas, cssW, cssH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }

  root.PostalArt = {
    C: C, INKS: INKS, sheet: sheet, sheetBack: sheetBack, stamp: stamp, postmark: postmark,
    postBox: postBox, dakiya: dakiya, folded: folded, fibres: fibres, setup: setup, palette: palette
  };
})(this);
