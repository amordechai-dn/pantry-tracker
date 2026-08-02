/* Tiny QR Code generator — VENDORED locally (no CDN, no deps).
 *
 * Faithful ES5 port of Project Nayuki's "QR Code generator library"
 * (MIT License, https://www.nayuki.io/page/qr-code-generator-library).
 * Trimmed to what HomeStock needs: byte/alphanumeric/numeric segments, ECC,
 * masking, and a small canvas renderer. Node-requireable for the test harness.
 *
 * Exposes:
 *   global.qrcodegen.QrCode.encodeText(text, ecl) -> QrCode { size, getModule }
 *   global.QRCodeMini.toCanvas(canvas, text, opts)
 *   global.QRCodeMini.modules(text) -> boolean[][]
 */
(function (global) {
  'use strict';

  function appendBits(val, len, bb) {
    if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError('Value out of range');
    for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  }
  function getBit(x, i) {
    return ((x >>> i) & 1) !== 0;
  }

  // ---- Error-correction levels ----
  var Ecc = {
    LOW: { ordinal: 0, formatBits: 1 },
    MEDIUM: { ordinal: 1, formatBits: 0 },
    QUARTILE: { ordinal: 2, formatBits: 3 },
    HIGH: { ordinal: 3, formatBits: 2 },
  };

  // ---- Segment encoding modes ----
  var Mode = {
    NUMERIC: { modeBits: 0x1, cc: [10, 12, 14] },
    ALPHANUMERIC: { modeBits: 0x2, cc: [9, 11, 13] },
    BYTE: { modeBits: 0x4, cc: [8, 16, 16] },
  };
  function numCharCountBits(mode, ver) {
    return mode.cc[Math.floor((ver + 7) / 17)];
  }

  var ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  var NUMERIC_RE = /^[0-9]*$/;
  var ALNUM_RE = /^[A-Z0-9 $%*+.\/:-]*$/;

  function QrSegment(mode, numChars, bitData) {
    this.mode = mode;
    this.numChars = numChars;
    this.bitData = bitData.slice();
  }
  QrSegment.prototype.getData = function () {
    return this.bitData.slice();
  };
  function toUtf8Bytes(str) {
    var s = encodeURI(str);
    var out = [];
    for (var i = 0; i < s.length; i++) {
      if (s.charAt(i) !== '%') out.push(s.charCodeAt(i));
      else {
        out.push(parseInt(s.substr(i + 1, 2), 16));
        i += 2;
      }
    }
    return out;
  }
  function makeBytes(data) {
    var bb = [];
    for (var i = 0; i < data.length; i++) appendBits(data[i], 8, bb);
    return new QrSegment(Mode.BYTE, data.length, bb);
  }
  function makeNumeric(digits) {
    var bb = [];
    for (var i = 0; i < digits.length; ) {
      var n = Math.min(digits.length - i, 3);
      appendBits(parseInt(digits.substr(i, n), 10), n * 3 + 1, bb);
      i += n;
    }
    return new QrSegment(Mode.NUMERIC, digits.length, bb);
  }
  function makeAlphanumeric(text) {
    var bb = [];
    var i;
    for (i = 0; i + 2 <= text.length; i += 2) {
      var v = ALNUM.indexOf(text.charAt(i)) * 45 + ALNUM.indexOf(text.charAt(i + 1));
      appendBits(v, 11, bb);
    }
    if (i < text.length) appendBits(ALNUM.indexOf(text.charAt(i)), 6, bb);
    return new QrSegment(Mode.ALPHANUMERIC, text.length, bb);
  }
  function makeSegments(text) {
    if (text === '') return [];
    if (NUMERIC_RE.test(text)) return [makeNumeric(text)];
    if (ALNUM_RE.test(text)) return [makeAlphanumeric(text)];
    return [makeBytes(toUtf8Bytes(text))];
  }
  function getTotalBits(segs, ver) {
    var result = 0;
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var ccbits = numCharCountBits(seg.mode, ver);
      if (seg.numChars >= 1 << ccbits) return Infinity;
      result += 4 + ccbits + seg.bitData.length;
    }
    return result;
  }

  var MIN_VERSION = 1;
  var MAX_VERSION = 40;
  var PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

  // Standard QR ECC tables (index 0 unused). Rows: L, M, Q, H.
  var ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  function getNumRawDataModules(ver) {
    if (ver < MIN_VERSION || ver > MAX_VERSION) throw new RangeError('Version out of range');
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function getNumDataCodewords(ver, ecl) {
    return (
      Math.floor(getNumRawDataModules(ver) / 8) -
      ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver]
    );
  }

  function rsMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }
  function rsComputeDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = rsMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = rsMultiply(root, 0x02);
    }
    return result;
  }
  function rsComputeRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    for (var d = 0; d < data.length; d++) {
      var factor = data[d] ^ result.shift();
      result.push(0);
      for (var i = 0; i < divisor.length; i++) result[i] ^= rsMultiply(divisor[i], factor);
    }
    return result;
  }

  // ---- QrCode ----
  function QrCode(version, ecl, dataCodewords, msk) {
    this.version = version;
    this.errorCorrectionLevel = ecl;
    this.size = version * 4 + 17;
    this.modules = [];
    this.isFunction = [];
    var row = [];
    for (var i = 0; i < this.size; i++) row.push(false);
    for (var i = 0; i < this.size; i++) {
      this.modules.push(row.slice());
      this.isFunction.push(row.slice());
    }
    this.drawFunctionPatterns();
    var allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);
    if (msk === -1) {
      var minPenalty = Infinity;
      for (var m = 0; m < 8; m++) {
        this.applyMask(m);
        this.drawFormatBits(m);
        var p = this.getPenaltyScore();
        if (p < minPenalty) { msk = m; minPenalty = p; }
        this.applyMask(m); // undo
      }
    }
    this.mask = msk;
    this.applyMask(msk);
    this.drawFormatBits(msk);
    this.isFunction = [];
  }
  QrCode.prototype.getModule = function (x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size && this.modules[y][x];
  };
  QrCode.prototype.setFunctionModule = function (x, y, isDark) {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  };
  QrCode.prototype.drawFunctionPatterns = function () {
    for (var i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);
    var pos = this.getAlignmentPatternPositions();
    var n = pos.length;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (!((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0))) {
          this.drawAlignmentPattern(pos[i], pos[j]);
        }
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  };
  QrCode.prototype.drawFormatBits = function (mask) {
    var data = (this.errorCorrectionLevel.formatBits << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    for (var i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (var i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));
    for (var i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (var i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true);
  };
  QrCode.prototype.drawVersion = function () {
    if (this.version < 7) return;
    var rem = this.version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var bits = (this.version << 12) | rem;
    for (var i = 0; i < 18; i++) {
      var color = getBit(bits, i);
      var a = this.size - 11 + (i % 3);
      var b = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  };
  QrCode.prototype.drawFinderPattern = function (x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };
  QrCode.prototype.drawAlignmentPattern = function (x, y) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };
  QrCode.prototype.getAlignmentPatternPositions = function () {
    if (this.version === 1) return [];
    var numAlign = Math.floor(this.version / 7) + 2;
    var step = this.version === 32 ? 26 : Math.ceil((this.size - 13) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var p = this.size - 7; result.length < numAlign; p -= step) result.splice(1, 0, p);
    return result;
  };
  QrCode.prototype.addEccAndInterleave = function (data) {
    var ver = this.version;
    var ecl = this.errorCorrectionLevel;
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
    var rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    var numShort = numBlocks - (rawCodewords % numBlocks);
    var shortLen = Math.floor(rawCodewords / numBlocks);
    var blocks = [];
    var rsDiv = rsComputeDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortLen - blockEccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      var ecc = rsComputeRemainder(dat, rsDiv);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (var i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        if (i !== shortLen - blockEccLen || j >= numShort) result.push(blocks[j][i]);
      }
    }
    return result;
  };
  QrCode.prototype.drawCodewords = function (data) {
    var i = 0;
    for (var right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < this.size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  };
  QrCode.prototype.applyMask = function (mask) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: throw new Error('unreachable');
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  };
  QrCode.prototype.finderPenaltyCountPatterns = function (rh) {
    var n = rh[1];
    var core = n > 0 && rh[2] === n && rh[3] === n * 3 && rh[4] === n && rh[5] === n;
    return (
      (core && rh[0] >= n * 4 && rh[6] >= n ? 1 : 0) +
      (core && rh[6] >= n * 4 && rh[0] >= n ? 1 : 0)
    );
  };
  QrCode.prototype.finderPenaltyAddHistory = function (len, rh) {
    if (rh[0] === 0) len += this.size;
    rh.pop();
    rh.unshift(len);
  };
  QrCode.prototype.finderPenaltyTerminateAndCount = function (color, len, rh) {
    if (color) {
      this.finderPenaltyAddHistory(len, rh);
      len = 0;
    }
    len += this.size;
    this.finderPenaltyAddHistory(len, rh);
    return this.finderPenaltyCountPatterns(rh);
  };
  QrCode.prototype.getPenaltyScore = function () {
    var result = 0;
    var size = this.size;
    for (var y = 0; y < size; y++) {
      var runColor = false, runX = 0, rh = [0, 0, 0, 0, 0, 0, 0];
      for (var x = 0; x < size; x++) {
        if (this.modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runX, rh);
          if (!runColor) result += this.finderPenaltyCountPatterns(rh) * PENALTY_N3;
          runColor = this.modules[y][x];
          runX = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, rh) * PENALTY_N3;
    }
    for (var x = 0; x < size; x++) {
      var runColor = false, runY = 0, rh = [0, 0, 0, 0, 0, 0, 0];
      for (var y = 0; y < size; y++) {
        if (this.modules[y][x] === runColor) {
          runY++;
          if (runY === 5) result += PENALTY_N1;
          else if (runY > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runY, rh);
          if (!runColor) result += this.finderPenaltyCountPatterns(rh) * PENALTY_N3;
          runColor = this.modules[y][x];
          runY = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runY, rh) * PENALTY_N3;
    }
    for (var y = 0; y < size - 1; y++) {
      for (var x = 0; x < size - 1; x++) {
        var c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) {
          result += PENALTY_N2;
        }
      }
    }
    var dark = 0;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) if (this.modules[y][x]) dark++;
    }
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  };

  function encodeSegments(segs, ecl, minVersion, maxVersion, mask, boostEcl) {
    minVersion = minVersion || 1;
    maxVersion = maxVersion || 40;
    mask = mask == null ? -1 : mask;
    boostEcl = boostEcl == null ? true : boostEcl;
    var version, dataUsedBits;
    for (version = minVersion; ; version++) {
      var cap = getNumDataCodewords(version, ecl) * 8;
      var used = getTotalBits(segs, version);
      if (used <= cap) { dataUsedBits = used; break; }
      if (version >= maxVersion) throw new RangeError('Data too long');
    }
    [Ecc.MEDIUM, Ecc.QUARTILE, Ecc.HIGH].forEach(function (newEcl) {
      if (boostEcl && dataUsedBits <= getNumDataCodewords(version, newEcl) * 8) ecl = newEcl;
    });
    var bb = [];
    segs.forEach(function (seg) {
      appendBits(seg.mode.modeBits, 4, bb);
      appendBits(seg.numChars, numCharCountBits(seg.mode, version), bb);
      seg.getData().forEach(function (b) { bb.push(b); });
    });
    var cap = getNumDataCodewords(version, ecl) * 8;
    appendBits(0, Math.min(4, cap - bb.length), bb);
    appendBits(0, (8 - (bb.length % 8)) % 8, bb);
    for (var pad = 0xec; bb.length < cap; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bb);
    var dataCodewords = [];
    while (dataCodewords.length * 8 < bb.length) dataCodewords.push(0);
    bb.forEach(function (b, i) { dataCodewords[i >>> 3] |= b << (7 - (i & 7)); });
    return new QrCode(version, ecl, dataCodewords, mask);
  }
  QrCode.encodeText = function (text, ecl) {
    return encodeSegments(makeSegments(text), ecl || Ecc.MEDIUM);
  };
  QrCode.Ecc = Ecc;

  var qrcodegen = { QrCode: QrCode };

  // ---- Small helpers (browser rendering) ----
  var QRCodeMini = {
    Ecc: Ecc,
    modules: function (text, ecl) {
      return QrCode.encodeText(text, ecl || Ecc.MEDIUM).modules;
    },
    // Render into a <canvas>. opts: { scale, border, dark, light }.
    toCanvas: function (canvas, text, opts) {
      opts = opts || {};
      var scale = opts.scale || 4;
      var border = opts.border == null ? 4 : opts.border;
      var dark = opts.dark || '#0b0f14';
      var light = opts.light || '#ffffff';
      var qr = QrCode.encodeText(text, opts.ecl || Ecc.MEDIUM);
      var dim = (qr.size + border * 2) * scale;
      canvas.width = dim;
      canvas.height = dim;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, dim, dim);
      ctx.fillStyle = dark;
      for (var y = 0; y < qr.size; y++) {
        for (var x = 0; x < qr.size; x++) {
          if (qr.getModule(x, y)) {
            ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
          }
        }
      }
      return canvas;
    },
  };

  global.qrcodegen = qrcodegen;
  global.QRCodeMini = QRCodeMini;
  if (typeof module !== 'undefined' && module.exports) module.exports = { qrcodegen: qrcodegen, QRCodeMini: QRCodeMini };
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
