/* ==========================================================
   pixels.js — 像素贴图烘焙与绘制工具
   ----------------------------------------------------------
   把 PIXEL_ART 里的字符矩阵烘焙成 canvas 纹理并缓存。
   所有贴图在首次使用时生成，之后全是 drawImage。

   地面：程序化生成 4 块 256×256 的像素地块（内含 8×8 个
   32px 地砖），平铺时按坐标哈希选块，看不出重复。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  const spriteCache = new Map();
  const whiteCache = new Map();
  const urlCache = new Map();
  let chunks = null;

  /* ---------------- 基础工具 ---------------- */
  function hexRGB(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mixRGB(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  /** 稳定的二维哈希，支持负坐标 */
  function hash2(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ---------------- 精灵烘焙 ---------------- */
  function bake(name, white) {
    const def = RG.PIXEL_ART[name];
    if (!def) return null;
    const c = document.createElement('canvas');
    c.width = def.w;
    c.height = def.h;
    const g = c.getContext('2d');
    const img = g.createImageData(def.w, def.h);
    const d = img.data;

    for (let y = 0; y < def.h; y++) {
      const row = def.rows[y] || '';
      for (let x = 0; x < def.w; x++) {
        const ch = row[x];
        if (!ch || ch === '.' || ch === ' ') continue;
        let rgb;
        if (white) {
          rgb = [255, 255, 255];
        } else {
          const hex = def.pal[ch];
          if (typeof hex !== 'string' || hex.charAt(0) !== '#') continue;
          rgb = hexRGB(hex);
        }
        const i = (y * def.w + x) * 4;
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ---------------- 地面地块 ---------------- */
  const PAL_CACHE = {};

  function makeChunk(seed) {
    const T = RG.GROUND_TILE || 32;
    const N = RG.GROUND_CHUNK || 8;
    const S = T * N;

    const P = RG.GROUND_PAL;
    const base = PAL_CACHE.base || (PAL_CACHE.base = hexRGB(P.base));
    const dark = PAL_CACHE.dark || (PAL_CACHE.dark = hexRGB(P.dark));
    const deeper = PAL_CACHE.deeper || (PAL_CACHE.deeper = hexRGB(P.deeper));
    const light = PAL_CACHE.light || (PAL_CACHE.light = hexRGB(P.light));
    const lighter = PAL_CACHE.lighter || (PAL_CACHE.lighter = hexRGB(P.lighter));
    const moss = PAL_CACHE.moss || (PAL_CACHE.moss = hexRGB(P.moss));

    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const d = img.data;
    const off = seed * 8191;

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = hash2(x + off, y + off * 3);
        const fine = hash2(x >> 1, y >> 1);
        const mid = hash2((x >> 2) + off, (y >> 2) + off);
        const coarse = hash2((x >> 4) + off, (y >> 4) + off * 7);

        // 微噪点弱、大色块强 —— 看起来像有起伏的泥地而不是雪花屏
        const s = 0.5
          + (n - 0.5) * 0.16
          + (fine - 0.5) * 0.10
          + (mid - 0.5) * 0.34
          + (coarse - 0.5) * 0.56;

        let col;
        if (s < 0.42) col = mixRGB(dark, deeper, (0.42 - s) / 0.42);
        else if (s > 0.70) col = mixRGB(base, light, (s - 0.70) / 0.30);
        else col = base;

        // 苔藓斑
        if (coarse > 0.86 && n > 0.5) col = mixRGB(col, moss, 0.40);
        // 零星石粒
        if (n > 0.9935) col = lighter;
        else if (n > 0.989) col = mixRGB(col, lighter, 0.4);

        const i = (y * S + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ---------------- 对外 API ---------------- */
  const Pixel = {
    /** 取（并缓存）烘焙好的精灵 canvas */
    sprite(name) {
      if (spriteCache.has(name)) return spriteCache.get(name);
      const c = bake(name, false);
      if (c) spriteCache.set(name, c);
      return c;
    },

    /** 纯白剪影，用于受击闪白 */
    white(name) {
      if (whiteCache.has(name)) return whiteCache.get(name);
      const c = bake(name, true);
      if (c) whiteCache.set(name, c);
      return c;
    },

    /** UI 用的 dataURL（放大 scale 倍，配合 image-rendering: pixelated） */
    dataURL(name, scale) {
      const sc = scale || 4;
      const key = name + '@' + sc;
      if (urlCache.has(key)) return urlCache.get(key);
      const src = this.sprite(name);
      if (!src) return '';
      const c = document.createElement('canvas');
      c.width = src.width * sc;
      c.height = src.height * sc;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(src, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/png');
      urlCache.set(key, url);
      return url;
    },

    /** UI 用的 <img> 标签 */
    img(name, cls) {
      const url = this.dataURL(name, 4);
      if (!url) return '';
      return `<img class="${cls || 'px-icon'}" src="${url}" alt="" draggable="false">`;
    },

    /** 是否存在该贴图 */
    has(name) {
      return !!RG.PIXEL_ART[name];
    },

    /** 地面地块（4 种变体，惰性生成） */
    chunk(i) {
      if (!chunks) {
        chunks = [];
        for (let k = 0; k < 4; k++) chunks.push(makeChunk(k * 17 + 3));
      }
      return chunks[i & 3];
    },

    /** 按世界坐标挑一块地块 */
    chunkAt(bx, by) {
      return this.chunk(Math.floor(hash2(bx, by) * 4));
    },

    /** 绘制一个精灵：以 (x,y) 为底部中心，宽高按 size 等比 */
    draw(ctx, name, x, y, w, h, flip) {
      const s = this.sprite(name);
      if (!s) return false;
      if (flip) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        ctx.drawImage(s, -w / 2, -h, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(s, x - w / 2, y - h, w, h);
      }
      return true;
    },

    hash2,
  };

  RG.pixel = Pixel;
})(window);
