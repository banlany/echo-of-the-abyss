/* ==========================================================
   main.js — 引导、输入、主循环
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  const STEP = 1 / 60;

  const game = {
    world: null,
    renderer: null,
    ui: null,
    acc: 0,
    last: 0,
    idleT: 0,
    _dots: null,

    init() {
      const canvas = document.getElementById('cv');
      this.renderer = new RG.Renderer(canvas);
      this.ui = new RG.UI(this);

      window.addEventListener('resize', () => this.renderer.resize());
      this.bindInput();

      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));

      // 直接开局：index.html?autostart=rayn
      const q = new URLSearchParams(location.search);
      const auto = q.get('autostart');
      if (auto) {
        setTimeout(() => {
          RG.Audio.init();
          this.start(auto === '1' ? 'rayn' : auto);
          // 演示/调试：?autostart=rayn&sim=20 直接推演 20 秒
          const simSecs = parseFloat(q.get('sim') || '0');
          if (simSecs > 0) {
            RG.Debug.simulate(this.world, simSecs, true, q.get('hold'));
            this.ui._wornKey = '';
            this.ui._bondKey = '';
            this.ui.updateHUD(this.world);
          }
          // 调试：?die=1 / ?pause=1
          if (q.get('die')) { this.world.player.invuln = 0; this.world.damagePlayer(1e9); }
          if (q.get('pause')) this.pause();
          if (q.get('bag')) this.ui.openBag('combat');
        }, 80);
      }
    },

    /* ---------------- 生命周期 ---------------- */
    start(charId) {
      const seed = (Math.random() * 0xffffffff) >>> 0;
      this.world = new RG.World({ charId, seed });
      this.world.zoom = this.renderer.zoom;
      this.world.events.length = 0;
      this.world.phase = 'combat';

      this.ui.hideAll();
      this.ui.el.hud.classList.remove('hidden');
      this.ui._wornKey = '';
      this.ui._bondKey = '';
      this.ui.bagReturn = 'combat';
      this.ui.perkRerollCost = 25;
      this.ui.setAvatar(this.world.player.char);
      this.ui.updateHUD(this.world);

      this.acc = 0;
      this.world.viewHalfW = this.renderer.w / this.renderer.zoom / 2;
      this.world.viewHalfH = this.renderer.h / this.renderer.zoom / 2;
      this.world.primeWave();
      this.ui.showWaveBanner(1);
      this.ui.toast('WASD 移动 · 攻击自动进行', 'good');
    },

    pause() {
      if (!this.world || this.world.phase !== 'combat' || this.world.paused) return;
      this.world.paused = true;
      this.ui.showPause(this.world);
    },

    resume() {
      if (!this.world) return;
      this.world.paused = false;
      this.ui.hideAll();
      this.ui.el.hud.classList.remove('hidden');
      this.ui.updateHUD(this.world);
    },

    quit() {
      this.world = null;
      this.ui.hideAll();
      this.ui.el.hud.classList.add('hidden');
      this.ui.showScreen('screenTitle');
    },

    backToTitle() {
      this.world = null;
      this.ui.hideAll();
      this.ui.el.hud.classList.add('hidden');
      this.ui.showScreen('screenTitle');
    },

    /* ---------------- 输入 ---------------- */
    bindInput() {
      const w = () => this.world;

      window.addEventListener('keydown', (e) => {
        const world = w();
        if (e.code === 'KeyM') {
          const muted = RG.Audio.toggleMute();
          this.ui.toast(muted ? '音效已静音' : '音效已开启');
          return;
        }
        if (e.code === 'Tab' || e.code === 'KeyB') {
          e.preventDefault();
          const ww = w();
          if (!ww || ww.phase === 'dead') return;
          if (this.ui.el.screenBag.classList.contains('show')) {
            this.ui.closeBag();
          } else if (!this.ui.el.screenPause.classList.contains('show')) {
            this.ui.openBag(ww.phase === 'shop' ? 'shop' : 'combat');
          }
          return;
        }
        if (e.code === 'Escape') {
          const world2 = w();
          if (!world2) return;
          if (this.ui.el.screenBag.classList.contains('show')) {
            this.ui.closeBag();
            return;
          }
          if (world2.paused) this.resume();
          else this.pause();
          return;
        }
        if (!world) return;
        if (world.phase !== 'combat') return;

        switch (e.code) {
          case 'KeyW': case 'ArrowUp': world.input.up = true; break;
          case 'KeyS': case 'ArrowDown': world.input.down = true; break;
          case 'KeyA': case 'ArrowLeft': world.input.left = true; break;
          case 'KeyD': case 'ArrowRight': world.input.right = true; break;
          case 'Space': world.input.dash = true; e.preventDefault(); break;
          default: return;
        }
        e.preventDefault();
      });

      window.addEventListener('keyup', (e) => {
        const world = w();
        if (!world) return;
        switch (e.code) {
          case 'KeyW': case 'ArrowUp': world.input.up = false; break;
          case 'KeyS': case 'ArrowDown': world.input.down = false; break;
          case 'KeyA': case 'ArrowLeft': world.input.left = false; break;
          case 'KeyD': case 'ArrowRight': world.input.right = false; break;
          default: break;
        }
      });

      const cv = this.renderer.cv;
      window.addEventListener('mousemove', (e) => {
        const world = w();
        if (!world) return;
        world.input.mouseX = e.clientX - window.innerWidth / 2;
        world.input.mouseY = e.clientY - window.innerHeight / 2;
        world.input.hasMouse = true;
      });
      cv.addEventListener('contextmenu', (e) => e.preventDefault());

      // 失焦自动暂停，避免后台被怪打死
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.world && this.world.phase === 'combat' && !this.world.paused) {
          this.pause();
        }
      });
    },

    /* ---------------- 主循环 ---------------- */
    loop(now) {
      const dt = Math.min(0.08, (now - this.last) / 1000);
      this.last = now;

      if (this.world) {
        this.acc += dt;
        let guard = 0;
        while (this.acc >= STEP && guard++ < 6) {
          this.world.step(STEP);
          this.acc -= STEP;
        }
        this.renderer.render(this.world, dt);
        this.ui.update(dt);
      } else {
        this.renderIdle(dt);
      }

      requestAnimationFrame((t) => this.loop(t));
    },

    /** 标题页背景：缓慢平移的像素地面 + 烛尘 */
    renderIdle(dt) {
      const r = this.renderer;
      const ctx = r.ctx;
      this.idleT += dt;

      ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      const S = RG.GROUND_TILE * RG.GROUND_CHUNK;
      const ox = -((this.idleT * 9) % S);
      const oy = -((this.idleT * 4) % S);
      ctx.save();
      ctx.translate(ox, oy);
      const cols = Math.ceil(r.w / S) + 2;
      const rows = Math.ceil(r.h / S) + 2;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          ctx.drawImage(RG.pixel.chunkAt(i, j), i * S, j * S);
        }
      }
      ctx.restore();

      // 压暗 + 暖调
      ctx.fillStyle = 'rgba(10,7,4,0.58)';
      ctx.fillRect(0, 0, r.w, r.h);

      // 漂浮的烛尘
      if (!this._dots) {
        this._dots = [];
        for (let i = 0; i < 60; i++) {
          this._dots.push({
            x: Math.random(), y: Math.random(),
            r: 0.6 + Math.random() * 2,
            v: 0.006 + Math.random() * 0.018,
            a: 0.05 + Math.random() * 0.18,
          });
        }
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const d of this._dots) {
        d.y -= d.v * dt;
        if (d.y < -0.03) { d.y = 1.03; d.x = Math.random(); }
        const px = d.x * r.w;
        const py = d.y * r.h;
        ctx.fillStyle = `rgba(255,206,140,${d.a})`;
        ctx.fillRect(px, py, d.r * 2, d.r * 2);
      }
      ctx.restore();

      if (r.vignette) ctx.drawImage(r.vignette, 0, 0);
    },
  };

  RG.game = game;

  /* ---------------------------------------------------------
     开发工具：无交互推演（供截图 / 平衡测试使用）
     --------------------------------------------------------- */
  RG.Debug = {
    /**
     * @param {World} world
     * @param {number} seconds 推进的模拟秒数
     * @param {boolean} autoPick 自动选第一个特性、自动过商店
     * @param {string} [stopAt] 'levelup' | 'shop' 到达该阶段立即停止（保留事件给 UI）
     */
    simulate(world, seconds, autoPick, stopAt) {
      const steps = Math.round(seconds * 60);
      for (let i = 0; i < steps; i++) {
        const t = i / 60;
        world.input.right = Math.cos(t * 1.1) > 0;
        world.input.left = Math.cos(t * 1.1) <= 0;
        world.input.down = Math.sin(t * 1.1) > 0;
        world.input.up = Math.sin(t * 1.1) <= 0;
        if (i % 120 === 0) world.input.dash = true;
        // 模拟玩家每隔几秒整理一次行囊
        if (i % 240 === 0) RG.Debug.tidyBag(world);

        world.step(1 / 60);

        if (stopAt && world.phase === stopAt) return;
        if (world.phase === 'dead') return;

        const evs = world.events.splice(0, world.events.length);
        for (const ev of evs) {
          if (ev.type === 'levelup' && world.phase === 'levelup' && autoPick) {
            world.choosePerk(ev.choices[0].id);
          }
        }
        if (world.phase === 'shop' && autoPick) {
          RG.Debug.tidyBag(world);
          RG.Debug.autoShop(world);
          world.nextWave();
        }
      }
      world.input.up = world.input.down = world.input.left = world.input.right = false;
    },

    /** 演示用：模拟理性玩家整理行囊 */
    tidyBag(world) {
      const p = world.player;
      // 1) 把背包里最好的武器/防具换上
      ['weapon', 'armor'].forEach((slot) => {
        let bestIdx = -1;
        let bestScore = p.equip[slot] ? RG.itemScore(p.equip[slot]) : -1;
        for (let i = 0; i < p.bag.length; i++) {
          const it = p.bag[i];
          if (!it || it.slot !== slot) continue;
          const sc = RG.itemScore(it);
          if (sc > bestScore) { bestScore = sc; bestIdx = i; }
        }
        if (bestIdx >= 0) world.equipFromBag(bestIdx);
      });
      // 2) 背包里的武器/防具不生效，丢掉最差的，至少留 3 个空位
      let guard = 0;
      while (world.bagUsed() > 9 && guard++ < 12) {
        let worst = -1, worstScore = Infinity;
        for (let i = 0; i < p.bag.length; i++) {
          const it = p.bag[i];
          if (!it || it.slot === 'trinket') continue;
          const sc = RG.itemScore(it);
          if (sc < worstScore) { worstScore = sc; worst = i; }
        }
        if (worst < 0) break;
        world.dropFromBag(worst);
      }
      // 3) 仍然满员则丢掉评分最低的饰品
      guard = 0;
      while (!world.bagHasSpace() && guard++ < 12) {
        world.sellWorstFromBag();
      }
    },

    /** 演示用：自动买当前金币能买到的最强装备 */
    autoShop(world) {
      let best = -1, bestScore = -1;
      for (let k = 0; k < world.shop.stock.length; k++) {
        const entry = world.shop.stock[k];
        if (!entry || entry.sold) continue;
        if (world.player.gold < entry.price) continue;
        const sc = RG.itemScore(entry.item) / Math.max(1, entry.price);
        if (sc > bestScore) { bestScore = sc; best = k; }
      }
      if (best >= 0) return world.buyShopItem(best);
      return false;
    },
  };

  window.addEventListener('DOMContentLoaded', () => game.init());
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // 若脚本在 DOMContentLoaded 之后执行
    setTimeout(() => { if (!game.renderer) game.init(); }, 0);
  }
})(window);
