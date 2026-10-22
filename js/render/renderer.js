/* ==========================================================
   renderer.js — Canvas 2D 渲染
   ----------------------------------------------------------
   2.5D 俯视表现：
     · 所有实体在 (x, y) 处画椭圆投影
     · 身体向上抬升 r*0.42，制造"站立"的错觉
     · 顶部高光 + 底部压暗形成体积感
     · 按 y 坐标排序绘制，产生前后遮挡
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});
  const U = RG.U;
  const TAU = Math.PI * 2;

  /* roundRect 兜底：老浏览器没有该方法 */
  if (global.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rr = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
      return this;
    };
  }

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.dpr = 1;
      this.w = 0;
      this.h = 0;
      this.zoom = 1;
      this.tile = null;
      this.vignette = null;
      this._sortBuf = [];
      this._time = 0;
      this.resize();
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.dpr = dpr;
      this.w = w;
      this.h = h;
      this.cv.width = Math.round(w * dpr);
      this.cv.height = Math.round(h * dpr);
      this.cv.style.width = w + 'px';
      this.cv.style.height = h + 'px';
      this.zoom = U.clamp(Math.min(w / 1280, h / 800) * 1.28, 0.86, 1.62);
      this.buildVignette();
    }

    /** 预渲染地面网格 tile */
    buildTile() {
      const S = 128;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');

      g.fillStyle = '#0d0a07';
      g.fillRect(0, 0, S, S);

      // 大格
      g.strokeStyle = 'rgba(180,142,88,0.15)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0.5, 0); g.lineTo(0.5, S);
      g.moveTo(0, 0.5); g.lineTo(S, 0.5);
      g.stroke();

      // 内部细格
      g.strokeStyle = 'rgba(180,142,88,0.07)';
      const step = S / 4;
      g.beginPath();
      for (let i = 1; i < 4; i++) {
        g.moveTo(i * step + 0.5, 0); g.lineTo(i * step + 0.5, S);
        g.moveTo(0, i * step + 0.5); g.lineTo(S, i * step + 0.5);
      }
      g.stroke();

      // 交点亮点
      g.fillStyle = 'rgba(214,176,116,0.20)';
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          g.fillRect(i * step - 0.5, j * step - 0.5, 1.6, 1.6);
        }
      }
      this.tile = c;
      this.tileSize = S;
    }

    buildVignette() {
      const c = document.createElement('canvas');
      c.width = this.w; c.height = this.h;
      const g = c.getContext('2d');
      const cx = this.w / 2, cy = this.h / 2;
      const r = Math.hypot(cx, cy);
      const grd = g.createRadialGradient(cx, cy, r * 0.42, cx, cy, r);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.72, 'rgba(0,0,0,0.30)');
      grd.addColorStop(1, 'rgba(0,0,0,0.78)');
      g.fillStyle = grd;
      g.fillRect(0, 0, this.w, this.h);
      this.vignette = c;
    }

    /* ===================================================== */
    render(world, dt) {
      const ctx = this.ctx;
      this._time += dt;
      const z = this.zoom;
      world.zoom = z;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;  // 像素贴图不做插值

      // 背景
      ctx.fillStyle = '#0a0806';
      ctx.fillRect(0, 0, this.w, this.h);

      const camX = world.camera.x + world.camera.shakeX;
      const camY = world.camera.y + world.camera.shakeY;

      ctx.save();
      ctx.translate(this.w / 2, this.h / 2);
      ctx.scale(z, z);
      ctx.translate(-camX, -camY);

      const viewW = this.w / z, viewH = this.h / z;
      const vx0 = camX - viewW / 2, vx1 = camX + viewW / 2;
      const vy0 = camY - viewH / 2, vy1 = camY + viewH / 2;

      // 敌人沿视野边缘外生成（供 world 刷怪使用）
      world.viewHalfW = viewW / 2;
      world.viewHalfH = viewH / 2;

      this.drawGround(ctx, vx0, vy0, vx1, vy1);
      this.drawPickups(ctx, world, vx0, vy0, vx1, vy1);
      this.drawEntities(ctx, world, vx0, vy0, vx1, vy1);
      this.drawProjectiles(ctx, world);
      this.drawEffects(ctx, world);
      this.drawParticles(ctx, world);
      this.drawTexts(ctx, world);

      ctx.restore();

      // 受击红屏
      const hpRatio = world.player.hp / world.player.stats.maxHp;
      if (hpRatio < 0.35) {
        const a = (0.35 - hpRatio) * 1.1;
        ctx.save();
        const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.22,
          this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.62);
        g.addColorStop(0, 'rgba(255,40,70,0)');
        g.addColorStop(1, `rgba(255,30,60,${a.toFixed(3)})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.restore();
      }

      // 暗角
      if (this.vignette) ctx.drawImage(this.vignette, 0, 0);
    }

    /* ---------------- 地面 ---------------- */
    /**
     * 像素地面：256×256 的预烘焙地块平铺 + 稀疏地表装饰。
     * 地块变体按坐标哈希挑选，避免出现明显的重复阵列。
     */
    drawGround(ctx, x0, y0, x1, y1) {
      const S = RG.GROUND_TILE * RG.GROUND_CHUNK;
      const bx0 = Math.floor(x0 / S), bx1 = Math.floor(x1 / S);
      const by0 = Math.floor(y0 / S), by1 = Math.floor(y1 / S);

      for (let bx = bx0; bx <= bx1; bx++) {
        for (let by = by0; by <= by1; by++) {
          ctx.drawImage(RG.pixel.chunkAt(bx, by), bx * S, by * S);
        }
      }

      this.drawGroundDecor(ctx, x0, y0, x1, y1);
    }

    /** 地表装饰：石砾 / 枯骨 / 枯草 / 发光菌 / 裂纹 / 头骨 */
    drawGroundDecor(ctx, x0, y0, x1, y1) {
      const G = 116;
      const h2 = RG.pixel.hash2;
      const gx0 = Math.floor(x0 / G), gx1 = Math.ceil(x1 / G);
      const gy0 = Math.floor(y0 / G), gy1 = Math.ceil(y1 / G);
      const kinds = ['d_rock', 'd_grass', 'd_crack', 'd_bones', 'd_mush', 'd_skull'];
      const sizes = { d_rock: 22, d_grass: 18, d_crack: 20, d_bones: 20, d_mush: 14, d_skull: 16 };

      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const h = h2(gx * 31 + 7, gy * 17 - 3);
          if (h > 0.36) continue;

          const px = gx * G + h2(gx + 11, gy - 7) * (G - 28) + 14;
          const py = gy * G + h2(gx - 3, gy + 13) * (G - 28) + 14;
          if (px < x0 - 30 || px > x1 + 30 || py < y0 - 30 || py > y1 + 30) continue;

          const name = kinds[Math.floor(h * 41) % kinds.length];
          const sz = sizes[name] || 18;
          const spr = RG.pixel.sprite(name);
          if (!spr) continue;

          // 发光菌带一点呼吸光
          if (name === 'd_mush') {
            const pulse = 0.55 + 0.45 * Math.sin(this._time * 1.8 + h * 30);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.16 * pulse;
            ctx.drawImage(spr, px - sz * 0.9, py - sz * 1.5, sz * 1.8, sz * 1.8);
            ctx.restore();
            ctx.globalAlpha = 0.9;
            ctx.drawImage(spr, px - sz / 2, py - sz, sz, sz);
            ctx.globalAlpha = 1;
          } else {
            ctx.drawImage(spr, px - sz / 2, py - sz, sz, sz);
          }
        }
      }
    }

    /* ---------------- 掉落物 ---------------- */
    drawPickups(ctx, w, x0, y0, x1, y1) {
      const list = w.pickups;
      const t = this._time;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.x < x0 - 40 || o.x > x1 + 40 || o.y < y0 - 40 || o.y > y1 + 40) continue;

        const bob = Math.sin(t * 4 + o.x * 0.05) * 2;

        if (o.kind === 'item') {
          // 装备：悬浮菱形 + 光柱
          const col = o.item.glow || o.item.color;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const R = 26 + Math.sin(t * 3.2) * 3;
          const g = ctx.createRadialGradient(o.x, o.y + bob, 0, o.x, o.y + bob, R * 1.6);
          g.addColorStop(0, this.hexA(col, 0.55));
          g.addColorStop(0.45, this.hexA(col, 0.16));
          g.addColorStop(1, this.hexA(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(o.x, o.y + bob, R * 1.6, 0, TAU);
          ctx.fill();
          ctx.restore();

          // 菱形核心
          ctx.save();
          ctx.translate(o.x, o.y + bob - 6);
          ctx.rotate(t * 1.5);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(0, -9); ctx.lineTo(7, 0); ctx.lineTo(0, 9); ctx.lineTo(-7, 0);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          ctx.moveTo(0, -9); ctx.lineTo(3, -3); ctx.lineTo(-3, -3);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          const col = o.color;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = this.hexA(col, 0.10);
          ctx.beginPath();
          ctx.arc(o.x, o.y + bob, o.r * 1.7, 0, TAU);
          ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(o.x, o.y + bob, o.r * 0.58, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    /* ---------------- 实体（玩家 + 敌人） ---------------- */
    drawEntities(ctx, w, x0, y0, x1, y1) {
      const buf = this._sortBuf;
      buf.length = 0;

      const p = w.player;
      buf.push(p);

      const list = w.enemies;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead) continue;
        if (e.x < x0 - 60 || e.x > x1 + 60 || e.y < y0 - 60 || e.y > y1 + 60) continue;
        buf.push(e);
      }

      buf.sort((a, b) => a.y - b.y);

      for (let i = 0; i < buf.length; i++) {
        const o = buf[i];
        if (o === p) this.drawPlayer(ctx, w, p);
        else this.drawEnemy(ctx, o);
      }

      // 玩家定位环：被怪群淹没时也能一眼找到自己
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(235,215,175,0.30)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 3, p.r * 1.55, p.r * 0.64, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    drawShadow(ctx, x, y, r, alpha) {
      ctx.fillStyle = `rgba(0,0,0,${alpha === undefined ? 0.30 : alpha})`;
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.44, r * 0.82, r * 0.34, 0, 0, TAU);
      ctx.fill();
    }

    drawEnemy(ctx, e) {
      const d = e.def;
      const art = RG.pixel.has(e.defId) ? e.defId : 'grunt';
      const w = e.r * 1.95;
      const h = w;
      const bx = e.x;
      const by = e.y + e.r * 0.30;          // 精灵底部贴地
      const flip = Math.cos(e.rot || 0) < 0; // 只做水平翻转，不旋转像素
      const frozen = this._time < (e.frozenUntil || 0);

      this.drawShadow(ctx, e.x, e.y, e.r * 0.95, e.elite ? 0.42 : 0.28);

      // 精英：脚下一圈金环
      if (e.elite) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,190,80,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + e.r * 0.34, e.r * 1.05, e.r * 0.46, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      // 走动起伏：让像素小人有点"踏地"感
      const bob = Math.sin(this._time * 7 + e.id) * (e.r > 16 ? 1.4 : 0.9);
      RG.pixel.draw(ctx, art, bx, by + bob, w, h, flip);

      // 受击闪白
      if (e.flash > 0.02) {
        const white = RG.pixel.white(art);
        if (white) {
          ctx.save();
          ctx.globalAlpha = Math.min(0.85, e.flash * 1.1);
          if (flip) {
            ctx.translate(bx, by + bob);
            ctx.scale(-1, 1);
            ctx.drawImage(white, -w / 2, -h, w, h);
          } else {
            ctx.drawImage(white, bx - w / 2, by + bob - h, w, h);
          }
          ctx.restore();
        }
      }

      // 冻结
      if (frozen) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(140,230,255,0.20)';
        ctx.beginPath();
        ctx.ellipse(bx, by + bob - h * 0.45, w * 0.5, h * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      // 灼烧火星
      if (e.burn && e.burn.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < e.burn.length; i++) {
          const a = this._time * 7 + i * 2.1;
          ctx.fillStyle = 'rgba(255,140,60,0.55)';
          ctx.fillRect(
            bx + Math.cos(a) * e.r * 0.55 - 1.5,
            by + bob - h * 0.6 + Math.sin(a * 1.3) * e.r * 0.5 - 1.5,
            3, 3
          );
        }
        ctx.restore();
      }

      // 血条
      const bw = Math.max(18, e.r * 1.7);
      const byy = by + bob - h - 7;
      if (e.elite) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx - bw / 2 - 1, byy - 1, bw + 2, 5);
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(bx - bw / 2, byy, bw * U.clamp(e.hp / e.maxHp, 0, 1), 3);
      } else if (e.hp < e.maxHp * 0.98 && e.r > 12) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx - bw / 2, byy, bw, 2.5);
        ctx.fillStyle = 'rgba(180,56,40,0.95)';
        ctx.fillRect(bx - bw / 2, byy, bw * U.clamp(e.hp / e.maxHp, 0, 1), 2.5);
      }
    }

    drawPlayer(ctx, w, p) {
      const r = p.r;
      const art = p.charId;
      const sw = r * 2.75;
      const sh = sw;
      const flip = Math.cos(p.aim) < 0;

      this.drawShadow(ctx, p.x, p.y, r + 2, 0.36);

      // 脚下职业色微光
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y + 6, 0, p.x, p.y + 6, r * 2.6);
      g.addColorStop(0, this.hexA(p.char.color, 0.14));
      g.addColorStop(1, this.hexA(p.char.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y + 6, r * 2.6, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 环绕刀刃
      const wpn = p.equip.weapon;
      if (p.orbitBlades && wpn && wpn.atk && wpn.atk.type === 'orbit') {
        const col = wpn.atk.color;
        for (let i = 0; i < p.orbitBlades; i++) {
          const a = (p.orbitAng || 0) + (i / p.orbitBlades) * TAU;
          const bx = p.x + Math.cos(a) * (p.orbitRadius || 70);
          const by = p.y + Math.sin(a) * (p.orbitRadius || 70) * 0.62;
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(a * 3);
          ctx.fillStyle = col;
          ctx.fillRect(-7, -3, 14, 6);
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillRect(-5, -1, 10, 2);
          ctx.restore();
        }
      }

      // 本体
      const bob = Math.sin(this._time * 6) * 1.2;
      const baseY = p.y + r * 0.42 + bob;

      // 受击闪烁
      if (p.invuln > 0 && Math.floor(p.invuln * 24) % 2 === 0) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        RG.pixel.draw(ctx, art, p.x, baseY, sw, sh, flip);
        ctx.restore();
      } else {
        RG.pixel.draw(ctx, art, p.x, baseY, sw, sh, flip);
      }

      // 手持武器（当前武器的像素图标，缩到很小）
      if (wpn && wpn.icon) {
        const ic = RG.pixel.sprite(wpn.icon);
        if (ic) {
          const s2 = r * 1.05;
          const hx = p.x + (flip ? -1 : 1) * (r * 0.85);
          const hy = baseY - r * 0.15;
          ctx.save();
          ctx.globalAlpha = 0.96;
          ctx.drawImage(ic, hx - s2 / 2, hy - s2 / 2, s2, s2);
          ctx.restore();
        }
      }

      // 血条
      const bw = 42, bh = 4;
      const hy2 = baseY - sh - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(p.x - bw / 2 - 1, hy2 - 1, bw + 2, bh + 2);
      const hr = U.clamp(p.hp / p.stats.maxHp, 0, 1);
      ctx.fillStyle = hr > 0.5 ? '#5c9a4a' : hr > 0.25 ? '#c9a227' : '#a8392a';
      ctx.fillRect(p.x - bw / 2, hy2, bw * hr, bh);
    }

    /* ---------------- 投射物 ---------------- */
    drawProjectiles(ctx, w) {
      const list = w.projectiles;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const r = p.r;

        // 拖尾
        ctx.strokeStyle = this.hexA(p.color, 0.35);
        ctx.lineWidth = r * 1.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
        ctx.stroke();

        // 光晕
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.4);
        g.addColorStop(0, this.hexA(p.color, 0.55));
        g.addColorStop(1, this.hexA(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3.4, 0, TAU);
        ctx.fill();

        // 核心
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.62, 0, TAU);
        ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.95, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // 敌方子弹
      const eb = w.enemyBullets;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < eb.length; i++) {
        const b = eb[i];
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3);
        g.addColorStop(0, this.hexA(b.color, 0.6));
        g.addColorStop(1, this.hexA(b.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.8, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ---------------- 特效 ---------------- */
    drawEffects(ctx, w) {
      const list = w.effects;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        const t = 1 - e.life / e.maxLife; // 0 -> 1

        if (e.type === 'slash') {
          const a = (1 - t) * 0.85;
          ctx.strokeStyle = this.hexA(e.color, a);
          ctx.lineWidth = 5 + (1 - t) * 12;
          ctx.lineCap = 'round';
          const spread = e.arc * (0.4 + t * 0.6);
          ctx.beginPath();
          ctx.arc(e.x, e.y - 6, e.r1 * (0.5 + t * 0.5), e.dir - spread / 2, e.dir + spread / 2);
          ctx.stroke();
        } else if (e.type === 'ring') {
          const rr = U.lerp(e.r0, e.r1, 1 - Math.pow(1 - t, 2));
          ctx.strokeStyle = this.hexA(e.color, (1 - t) * 0.8);
          ctx.lineWidth = 3 + (1 - t) * 4;
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, rr, rr * 0.72, 0, 0, TAU);
          ctx.stroke();
        } else if (e.type === 'flare') {
          const rr = e.r1 * (0.4 + t * 0.7);
          const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr);
          g.addColorStop(0, this.hexA(e.color, (1 - t) * 0.5));
          g.addColorStop(0.5, this.hexA(e.color, (1 - t) * 0.18));
          g.addColorStop(1, this.hexA(e.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(e.x, e.y, rr, 0, TAU);
          ctx.fill();
        } else if (e.type === 'bolt') {
          const a = 1 - t;
          ctx.strokeStyle = this.hexA(e.color, a);
          ctx.lineWidth = e.width || 3;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          const segs = 5;
          ctx.moveTo(e.x, e.y);
          for (let s = 1; s < segs; s++) {
            const tt = s / segs;
            const jx = (Math.random() - 0.5) * (e.jitter || 8);
            const jy = (Math.random() - 0.5) * (e.jitter || 8);
            ctx.lineTo(U.lerp(e.x, e.x2, tt) + jx, U.lerp(e.y, e.y2, tt) + jy);
          }
          ctx.lineTo(e.x2, e.y2);
          ctx.stroke();
          // 白光芯
          ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`;
          ctx.lineWidth = (e.width || 3) * 0.36;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    /* ---------------- 粒子 ---------------- */
    drawParticles(ctx, w) {
      const list = w.particles;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const a = U.clamp(p.life / p.maxLife, 0, 1);
        ctx.fillStyle = this.hexA(p.color, a * 0.85);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ---------------- 伤害数字 ---------------- */
    drawTexts(ctx, w) {
      const list = w.texts;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const a = U.clamp(t.life / t.maxLife, 0, 1);
        const scale = t.crit ? 1 + (1 - a) * 0.35 : 1;
        ctx.globalAlpha = a;
        ctx.font = `${t.crit ? '800' : '700'} ${Math.round(t.size * scale)}px "JetBrains Mono", Consolas, monospace`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.restore();
    }

    /* ---------------- 工具 ---------------- */
    hexA(hex, a) {
      if (!hex) return `rgba(255,255,255,${a})`;
      if (hex[0] !== '#') return hex;
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return `rgba(${r},${g},${b},${a})`;
    }
  }

  RG.Renderer = Renderer;
})(window);
