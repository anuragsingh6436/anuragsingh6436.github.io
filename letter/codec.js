/*
 * Inland Letter: link codec (mirror of LetterCodec.kt in the Android app; keep both in sync).
 *
 * Payload (the part after '#', never sent to any server) =
 *   VERSION '1' + FORMAT ('z' = raw DEFLATE of UTF-8 JSON, 'u' = plain UTF-8 JSON) + base64url (no padding).
 * JSON keys: k kind ("i"/"p"), s salutation, t to, b body, c closing, f from, w town,
 *            d sentAt ms, a deliverAt ms, n ink (0 blue, 1 black, 2 royal), m stamp id.
 */
(function (root) {
  'use strict';

  var LIMITS = {
    NAME_MAX: 24, SALUTATION_MAX: 20, CLOSING_MAX: 24, TOWN_MAX: 24,
    BODY_MAX_INLAND: 900, BODY_MAX_POSTCARD: 260,
    BODY_MAX_LINES_INLAND: 30, BODY_MAX_LINES_POSTCARD: 10,
    MAX_PAYLOAD_CHARS: 6000, MAX_JSON_BYTES: 8192,
    MAX_DELAY_MS: 3 * 24 * 60 * 60 * 1000
  };
  var STAMPS = ['tiger', 'peacock', 'lotus', 'chai', 'monsoon', 'train', 'mango', 'kite', 'postbox', 'cycle'];
  var MAX_SANE_TIME = 7258118400000;

  function isControl(code) { return code <= 0x1f || (code >= 0x7f && code <= 0x9f); }

  /** Clip to max UTF-16 units without cutting a surrogate pair. */
  function clip(s, max) {
    if (s.length <= max) return s;
    var end = max;
    if (end > 0) { var c = s.charCodeAt(end - 1); if (c >= 0xd800 && c <= 0xdbff) end--; }
    return s.substring(0, end);
  }

  function line(raw, max) {
    if (typeof raw !== 'string') return '';
    var out = '', lastSpace = false;
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      if (ch === '\n' || ch === '\r' || ch === '\t') ch = ' ';
      if (isControl(ch.charCodeAt(0))) continue;
      if (ch === ' ') { if (lastSpace || out.length === 0) continue; lastSpace = true; } else lastSpace = false;
      out += ch;
    }
    return clip(out.trim(), max);
  }

  function body(raw, max, maxLines) {
    if (typeof raw !== 'string') return '';
    var unified = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var cleaned = '';
    for (var i = 0; i < unified.length; i++) {
      var ch = unified[i];
      if (ch === '\n') cleaned += ch;
      else if (ch === '\t') cleaned += ' ';
      else if (!isControl(ch.charCodeAt(0))) cleaned += ch;
    }
    var lines = cleaned.split('\n').map(function (l) { return l.replace(/\s+$/, ''); });
    var out = [];
    lines.forEach(function (l) {
      if (l.trim() === '' && (out.length === 0 || out[out.length - 1].trim() === '')) return;
      out.push(l);
    });
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    return clip(out.slice(0, maxLines).join('\n').trim(), max);
  }

  function num(v) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0 || v >= 9e15) return 0;
    return Math.floor(v);
  }

  function sanitize(l) {
    var kind = l.kind === 'p' ? 'p' : 'i';
    var sentAt = (l.sentAt >= 1 && l.sentAt <= MAX_SANE_TIME) ? l.sentAt : 0;
    var deliverAt = l.deliverAt;
    if (sentAt === 0 || deliverAt <= sentAt || deliverAt - sentAt > LIMITS.MAX_DELAY_MS) deliverAt = 0;
    return {
      kind: kind,
      salutation: line(l.salutation, LIMITS.SALUTATION_MAX),
      to: line(l.to, LIMITS.NAME_MAX),
      body: body(l.body, kind === 'p' ? LIMITS.BODY_MAX_POSTCARD : LIMITS.BODY_MAX_INLAND,
        kind === 'p' ? LIMITS.BODY_MAX_LINES_POSTCARD : LIMITS.BODY_MAX_LINES_INLAND),
      closing: line(l.closing, LIMITS.CLOSING_MAX),
      from: line(l.from, LIMITS.NAME_MAX),
      town: line(l.town, LIMITS.TOWN_MAX),
      sentAt: sentAt,
      deliverAt: deliverAt,
      ink: (l.ink === 1 || l.ink === 2) ? l.ink : 0,
      stamp: STAMPS.indexOf(l.stamp) >= 0 ? l.stamp : 'tiger'
    };
  }

  function fromJson(o) {
    var str = function (v) { return typeof v === 'string' ? v : ''; };
    return {
      kind: o.k === 'p' ? 'p' : 'i',
      salutation: str(o.s), to: str(o.t), body: str(o.b), closing: str(o.c), from: str(o.f), town: str(o.w),
      sentAt: num(o.d), deliverAt: num(o.a), ink: num(o.n), stamp: typeof o.m === 'string' ? o.m : 'tiger'
    };
  }

  function toJson(l) {
    var o = { k: l.kind };
    if (l.salutation) o.s = l.salutation;
    if (l.to) o.t = l.to;
    o.b = l.body;
    if (l.closing) o.c = l.closing;
    if (l.from) o.f = l.from;
    if (l.town) o.w = l.town;
    if (l.sentAt > 0) o.d = l.sentAt;
    if (l.deliverAt > 0) o.a = l.deliverAt;
    if (l.ink) o.n = l.ink;
    o.m = l.stamp;
    return JSON.stringify(o);
  }

  function bytesToB64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlToBytes(s) {
    if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) throw new Error('bad base64');
    var t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var bin = atob(t);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  /** Pipes bytes through a (De)CompressionStream, aborting past maxBytes. */
  async function pipe(bytes, stream, maxBytes) {
    var reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
    var chunks = [], total = 0;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      total += r.value.length;
      if (maxBytes && total > maxBytes) { try { await reader.cancel(); } catch (e) { /* ignore */ } throw new Error('too big'); }
      chunks.push(r.value);
    }
    var out = new Uint8Array(total), off = 0;
    chunks.forEach(function (c) { out.set(c, off); off += c.length; });
    return out;
  }

  var canInflate = typeof DecompressionStream === 'function';
  var canDeflate = typeof CompressionStream === 'function';

  /** Resolves to {ok:true, letter} or {ok:false, reason}. Never throws. */
  async function decode(payload) {
    var p = (payload || '').trim();
    if (!p) return { ok: false, reason: 'EMPTY' };
    if (p.length > LIMITS.MAX_PAYLOAD_CHARS) return { ok: false, reason: 'TOO_LONG' };
    if (p.length < 3) return { ok: false, reason: 'BAD_ENCODING' };
    if (p[0] !== '1' || (p[1] !== 'z' && p[1] !== 'u')) return { ok: false, reason: 'UNKNOWN_VERSION' };
    var raw;
    try { raw = b64urlToBytes(p.substring(2)); } catch (e) { return { ok: false, reason: 'BAD_ENCODING' }; }
    var jsonBytes;
    if (p[1] === 'z') {
      if (!canInflate) return { ok: false, reason: 'NO_INFLATE' };
      try { jsonBytes = await pipe(raw, new DecompressionStream('deflate-raw'), LIMITS.MAX_JSON_BYTES); } catch (e) { return { ok: false, reason: 'TOO_BIG' }; }
    } else {
      if (raw.length > LIMITS.MAX_JSON_BYTES) return { ok: false, reason: 'TOO_BIG' };
      jsonBytes = raw;
    }
    var obj;
    try {
      obj = JSON.parse(new TextDecoder('utf-8').decode(jsonBytes));
    } catch (e) { return { ok: false, reason: 'BAD_DATA' }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'BAD_DATA' };
    var letter = sanitize(fromJson(obj));
    if (!letter.body.trim()) return { ok: false, reason: 'BLANK_LETTER' };
    return { ok: true, letter: letter };
  }

  /** Shortest payload for a letter; plain format when this browser can't compress. */
  async function encode(letter) {
    var json = new TextEncoder().encode(toJson(sanitize(letter)));
    var plain = '1u' + bytesToB64url(json);
    if (!canDeflate) return plain;
    try {
      var z = '1z' + bytesToB64url(await pipe(json, new CompressionStream('deflate-raw'), 0));
      return z.length <= plain.length ? z : plain;
    } catch (e) { return plain; }
  }

  var BASE = 'https://anuragsingh6436.github.io/letter/';

  var api = {
    LIMITS: LIMITS, STAMPS: STAMPS, decode: decode, encode: encode, sanitize: sanitize,
    line: line, body: body, clip: clip, link: function (p) { return BASE + '#' + p; }, BASE: BASE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LetterCodec = api;
})(this);
