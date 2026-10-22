/* ==========================================================
   world.js — 世界状态与模拟主循环
   ----------------------------------------------------------
   设计原则（为将来的服务器 / 联机预留）：
   1. 模拟层不碰 DOM、不碰 Canvas、不读全局鼠标。
   2. 一切随机来自 world.rng，同种子 + 同输入 = 同结果。
   3. 对外只暴露 step(dt) / applyInput() / dispatch(action)。
   4. 状态可序列化（见 serialize()/snapshot()），便于快照同步。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});
  const U = RG.U;

  const WAVE_DURATION = 42;      // 每波时长（秒）
  const MAX_ENEMIES = 220;       // 性能上限
  const MAX_PARTICLES = 700;
  const MAX_TEXTS = 140;
  const BAG_SIZE = RG.BAG_MAX || 24;   // 行囊数组按上限预分配，实际可用格数见 bagCapacity()

  let _eid = 0;

  class World {
    constructor(opt) {
      opt = opt || {};
      this.rng = new RG.RNG(opt.seed || ((Date.now() ^ (Math.random() * 0xffff)) >>> 0));
      this.time = 0;
      this.wave = 1;
      this.phase = 'combat';       // combat | levelup | shop | dead | paused
      this.events = [];            // 供 UI 消费的事件队列
      this.paused = false;

      this.enemies = [];
      this.projectiles = [];
      this.enemyBullets = [];
      this.pickups = [];
      this.particles = [];
      this.texts = [];
      this.effects = [];
      this.pendingSpawns = [];

      this.grid = new RG.SpatialHash(96);
      this.orbitHitCd = new Map();
      this.zoom = 1;

      this.camera = { x: 0, y: 0, shake: 0, shakeX: 0, shakeY: 0 };

      this.kills = 0;
      this.waveTime = WAVE_DURATION;
      this.spawnAcc = 0;
      this.waveKills = 0;
      this.waveGold = 0;
      this.totalGold = 0;
      this.runTime = 0;
      this.maxWave = 1;
      this.eliteCount = 0;

      // 商店
      this.shop = { stock: [], rerollCost: 20, healed: 0 };

      this.input = {
        up: false, down: false, left: false, right: false,
        mouseX: 0, mouseY: 0, hasMouse: false,
        dash: false,
      };

      this.createPlayer(opt.charId || 'rayn');
    }

    /* ================== 玩家 ================== */
    createPlayer(charId) {
      const ch = RG.CHAR_MAP[charId] || RG.CHARACTERS[0];
      const p = {
        charId: ch.id,
        char: ch,
        x: 0, y: 0, vx: 0, vy: 0, r: 15,
        hp: 1, maxHp: 1,
        base: Object.assign({}, ch.base),
        stats: {},
        // 佩戴位：只有武器与防具需要"穿上"才生效
        equip: { weapon: null, armor: null },
        // 背包：饰品放在里面就生效，武器/防具放里面不生效但可随时换装
        bag: new Array(BAG_SIZE).fill(null),
        perkCounts: {},
        level: 1,
        xp: 0,
        xpNext: 12,
        gold: 0,
        aim: 0,
        atkTimer: 0,
        dashCd: 0,
        dashTime: 0,
        dashDir: { x: 1, y: 0 },
        invuln: 0,
        mods: {},
        bonds: [],
        passive: ch.passive,
        passiveDmgStack: 0,
        moveActive: 0,
        orbitAng: 0,
        pendingLevels: 0,
        damageDealt: 0,
        lastCritT: -99,
      };
      this.player = p;

      // 初始武器（普通品质，固定强度）
      p.equip.weapon = RG.makeItem(ch.startWeapon, {
        wave: 1, rarity: 'common', rng: this.rng,
      });

      this.recomputeStats();
      p.hp = p.stats.maxHp;
      this.camera.x = p.x;
      this.camera.y = p.y;
      return p;
    }

    /* ================== 生效装备 ================== */
    /**
     * 返回当前真正生效的装备：
     *   武器位 + 防具位 + 背包里的全部饰品
     * 背包中的武器/防具不生效（必须换到佩戴位）。
     */
    activeItems() {
      const p = this.player;
      const out = [];
      if (p.equip.weapon) out.push(p.equip.weapon);
      if (p.equip.armor) out.push(p.equip.armor);
      for (let i = 0; i < p.bag.length; i++) {
        const it = p.bag[i];
        if (it && it.slot === 'trinket') out.push(it);
      }
      return out;
    }

    /**
     * 当前行囊可用格数：
     *   基础 12 + 每 5 级 +1 + 「扩容」特性 + 装备的行囊词条
     */
    bagCapacity() {
      const p = this.player;
      const base = RG.BAG_BASE || 12;
      const max = RG.BAG_MAX || 24;
      const per = RG.BAG_PER_LEVEL || 5;
      const lvBonus = Math.floor(p.level / per);   // 5/10/15 级各解锁 1 格
      const eqBonus = Math.round(p.stats.bagSpace || 0);
      return Math.min(max, base + lvBonus + eqBonus);
    }

    /** 可用范围内第一个空位，没有则 -1 */
    firstFreeSlot() {
      const bag = this.player.bag;
      const cap = this.bagCapacity();
      for (let i = 0; i < cap; i++) if (!bag[i]) return i;
      return -1;
    }

    bagUsed() {
      const bag = this.player.bag;
      const cap = this.bagCapacity();
      let n = 0;
      for (let i = 0; i < cap; i++) if (bag[i]) n++;
      return n;
    }

    bagHasSpace() {
      return this.firstFreeSlot() >= 0;
    }

    /**
     * 容量可能因为丢装备/换装而缩小：把超出可用范围的东西
     * 挪回空位，实在没地方就折算成金币，避免"物品消失"。
     */
    normalizeBag() {
      const p = this.player;
      const cap = this.bagCapacity();
      let count = 0, gold = 0;
      for (let i = cap; i < p.bag.length; i++) {
        const it = p.bag[i];
        if (!it) continue;
        const free = this.firstFreeSlot();
        if (free >= 0) {
          p.bag[free] = it;
        } else {
          gold += Math.max(1, Math.round(it.price * 0.3));
          count++;
        }
        p.bag[i] = null;
      }
      if (count > 0) {
        p.gold += gold;
        this.totalGold += gold;
        this.events.push({ type: 'bagShrink', count, gold });
      }
    }

    /* ================== 属性重算 ================== */
    /**
     * @param {object} [opts] { heal:true } 时把"获得最大生命"类特性的
     *        立即治疗效果结算掉。只在升级时传 true，
     *        避免换装备反复触发白嫖回血。
     */
    recomputeStats(opts) {
      const p = this.player;
      const s = {};

      // 1. 角色基础
      for (const k in p.base) s[k] = p.base[k];

      // 默认值兜底
      const defaults = {
        maxHp: 100, armor: 0, moveSpeed: 180, attackSpeed: 0, damage: 1,
        crit: 0, critMult: 1.5, pickup: 1, luck: 0, cdr: 0, area: 1,
        regen: 0, xpGain: 0, goldGain: 0, thorns: 0, lifesteal: 0, bagSpace: 0,
      };
      for (const k in defaults) if (s[k] === undefined) s[k] = defaults[k];

      // 2. 生效装备的属性
      const active = this.activeItems();
      for (let i = 0; i < active.length; i++) {
        const it = active[i];
        for (const k in it.stats) U.addInto(s, k, it.stats[k]);
      }

      // 3. 升级特性
      const mods = {};
      const ctx = {};
      for (const id in p.perkCounts) {
        const n = p.perkCounts[id];
        const perk = RG.PERK_MAP[id];
        if (!perk) continue;
        for (let i = 0; i < n; i++) perk.apply(s, mods, ctx);
      }

      // 4. 羁绊：按生效装备的标签统计
      RG.applyBonds(active, s, mods);
      p.bonds = RG.resolveBonds(active);

      // 5. 被动属性型角色加成
      if (p.passive) {
        if (p.passive.id === 'overload') s.area += p.passive.area;
        if (p.passive.id === 'bloodlust') {
          // 在 damageMult 里动态计算，这里不动
        }
      }

      // 6. 收敛
      s.maxHp = Math.max(1, Math.round(s.maxHp));
      s.armor = Math.max(0, s.armor);
      s.moveSpeed = Math.max(60, s.moveSpeed);
      s.crit = U.clamp(s.crit, 0, 0.95);
      s.cdr = U.clamp(s.cdr, 0, 0.62);
      s.critMult = Math.max(1.1, s.critMult);
      s.pickup = Math.max(0.4, s.pickup);
      s.area = Math.max(0.5, s.area);
      s.attackSpeed = Math.max(-0.7, s.attackSpeed);

      p.stats = s;
      p.mods = mods;

      // 新上限下的血量修正
      if (p.hp > s.maxHp) p.hp = s.maxHp;
      if (opts && opts.heal && ctx.healOnApply) {
        p.hp = Math.min(s.maxHp, p.hp + ctx.healOnApply);
      }
      // 容量可能变化（特性/词条），把越界物品收回来
      this.normalizeBag();
      return s;
    }

    /* ================== 输入 ================== */
    setInput(k, v) {
      if (k in this.input) this.input[k] = v;
    }

    /** 屏幕坐标 -> 世界坐标 */
    screenToWorld(sx, sy, halfW, halfH, zoom) {
      return {
        x: this.camera.x + (sx - halfW) / zoom,
        y: this.camera.y + (sy - halfH) / zoom,
      };
    }

    /* ================== 主步进 ================== */
    step(dt) {
      if (this.phase !== 'combat' || this.paused) return;
      // 固定步长上限，避免切标签页后大步跳跃
      dt = Math.min(dt, 0.05);
      this.time += dt;
      this.runTime += dt;

      this.updatePlayer(dt);
      this.updateAim(dt);

      this.grid.rebuild(this.enemies);

      this.updateEnemies(dt);
      RG.Combat.updateWeapon(this, dt);
      RG.Combat.updateProjectiles(this, dt);
      RG.Combat.updateEnemyBullets(this, dt);
      RG.Combat.updateTimers(this, dt);
      this.updatePickups(dt);
      this.updateVisuals(dt);
      this.updateWave(dt);

      // 镜头
      this.camera.x = U.damp(this.camera.x, this.player.x, 9, dt);
      this.camera.y = U.damp(this.camera.y, this.player.y, 9, dt);
      if (this.camera.shake > 0) {
        this.camera.shake = Math.max(0, this.camera.shake - dt * 34);
        const s = this.camera.shake;
        this.camera.shakeX = (Math.random() - 0.5) * s * 2;
        this.camera.shakeY = (Math.random() - 0.5) * s * 2;
      } else {
        this.camera.shakeX = this.camera.shakeY = 0;
      }
    }

    /* ================== 玩家更新 ================== */
    updatePlayer(dt) {
      const p = this.player;
      const inp = this.input;

      let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      let dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
      const len = Math.hypot(dx, dy);
      if (len > 0) { dx /= len; dy /= len; }

      if (len > 0) {
        p.moveActive = 0.6;
        p.dashDir.x = dx; p.dashDir.y = dy;
      } else {
        p.moveActive = Math.max(0, (p.moveActive || 0) - dt);
      }

      const speed = p.stats.moveSpeed;
      if (p.dashTime > 0) {
        p.dashTime -= dt;
        p.x += p.dashDir.x * speed * 4.1 * dt;
        p.y += p.dashDir.y * speed * 4.1 * dt;
        // 冲刺伤害
        if (p.mods.dashDamage) {
          this.grid.query(p.x, p.y, 34, this._q || (this._q = []));
          const q = this._q;
          for (let i = 0; i < q.length; i++) {
            const e = q[i];
            if (e.dead || e.dashHitT === this.time) continue;
            e.dashHitT = this.time;
            RG.Combat.damageEnemy(this, e, 22 * p.mods.dashDamage * RG.Combat.damageMult(p), {
              color: '#8fe3ff', knock: 200, noChain: true, baseDmg: 20,
            });
          }
        }
        // 拖尾
        if (this.rng.chance(0.9)) {
          this.addParticle(p.x, p.y, 0, 0, 10, '#7de3ff', 0.25, 2);
        }
      } else {
        p.x += dx * speed * dt;
        p.y += dy * speed * dt;
      }

      // 冲刺冷却
      if (p.dashCd > 0) p.dashCd -= dt;
      if (this.input.dash && p.dashCd <= 0) {
        this.input.dash = false;
        p.dashCd = (p.mods.dashFast ? 0.75 : 1.35) * (1 - Math.min(0.5, p.stats.cdr * 0.5));
        p.dashTime = 0.16;
        p.invuln = Math.max(p.invuln, 0.28);
        RG.Audio.dash();
      }

      // 无敌帧 / 回复
      if (p.invuln > 0) p.invuln -= dt;
      if (p.stats.regen > 0 && p.hp < p.stats.maxHp) {
        p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * dt);
      }
    }

    updateAim(dt) {
      const p = this.player;
      const inp = this.input;
      if (inp.hasMouse) {
        const wx = this.camera.x + (inp.mouseX) / this.zoom;
        const wy = this.camera.y + (inp.mouseY) / this.zoom;
        const d = U.dist(p.x, p.y, wx, wy);
        if (d > 95) {
          p.aim = U.angleTo(p.x, p.y, wx, wy);
          p.autoAim = false;
          return;
        }
      }
      const t = this.grid.nearest(p.x, p.y, 620);
      if (t) {
        p.aim = U.angleLerp(p.aim, U.angleTo(p.x, p.y, t.x, t.y), Math.min(1, 18 * dt));
        p.autoAim = true;
      }
    }

    /* ================== 敌人 ================== */
    spawnEnemy(defId, x, y, opt) {
      opt = opt || {};
      const d = RG.ENEMY_MAP[defId];
      if (!d) return null;
      const sc = RG.waveScaling(this.wave);
      const elite = !!opt.elite;
      const hpMul = sc.hp * (elite ? 4.2 : 1) * (opt.hpMul || 1);

      const e = {
        id: ++_eid,
        def: d,
        defId: defId,
        x, y,
        vx: 0, vy: 0,
        r: d.r * (elite ? 1.35 : 1),
        hp: d.hp * hpMul,
        maxHp: d.hp * hpMul,
        speed: d.speed * sc.speed * (elite ? 0.9 : 1) * this.rng.float(0.94, 1.06),
        dmg: d.dmg * sc.dmg * (elite ? 1.4 : 1),
        armor: (d.armor || 0) * (1 + (this.wave - 1) * 0.1),
        xp: d.xp * (elite ? 6 : 1),
        gold: d.gold * (elite ? 5 : 1),
        elite,
        dead: false,
        flash: 0,
        kx: 0, ky: 0,
        contactCd: 0,
        burn: null,
        slowAmt: 0, slowUntil: 0,
        frozenUntil: 0,
        dodge: d.dodge || 0,
        aiTimer: this.rng.float(0, 1),
        state: 'idle',
        wob: this.rng.float(0, U.TAU),
        spawnT: 0,
      };
      this.enemies.push(e);
      if (elite) this.eliteCount++;
      return e;
    }

    updateEnemies(dt) {
      const p = this.player;
      const list = this.enemies;
      const q = this._q2 || (this._q2 = []);

      // 延迟生成的分裂体
      if (this.pendingSpawns.length) {
        for (let i = 0; i < this.pendingSpawns.length; i++) {
          const s = this.pendingSpawns[i];
          this.spawnEnemy(s.id, s.x, s.y, s.opt);
        }
        this.pendingSpawns.length = 0;
      }

      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (e.dead) { U.swapRemove(list, i); continue; }

        e.spawnT += dt;
        if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 5);
        if (e.contactCd > 0) e.contactCd -= dt;

        // 状态
        let speedMul = 1;
        if (this.time < (e.slowUntil || 0)) speedMul *= 1 - (e.slowAmt || 0);
        const frozen = this.time < (e.frozenUntil || 0);
        if (frozen) speedMul = 0;

        const d = e.def;
        const distToP = U.dist(e.x, e.y, p.x, p.y);
        e.rot = Math.atan2(p.y - e.y, p.x - e.x);

        // ---- AI ----
        let mx = 0, my = 0;
        if (d.ai === 'chase' || !d.ai) {
          const ang = U.angleTo(e.x, e.y, p.x, p.y);
          mx = Math.cos(ang); my = Math.sin(ang);
          if (d.wobble) {
            const perp = ang + Math.PI / 2;
            const w = Math.sin(this.time * 5 + e.wob) * d.wobble;
            mx += Math.cos(perp) * w; my += Math.sin(perp) * w;
            const l = Math.hypot(mx, my) || 1;
            mx /= l; my /= l;
          }
        } else if (d.ai === 'ranged') {
          const ang = U.angleTo(e.x, e.y, p.x, p.y);
          const keep = d.keepDist;
          const dir = distToP > keep ? 1 : -1;
          mx = Math.cos(ang) * dir; my = Math.sin(ang) * dir;
          // 侧移
          const perp = ang + Math.PI / 2;
          mx += Math.cos(perp) * 0.55 * Math.sin(this.time * 1.7 + e.wob);
          my += Math.sin(perp) * 0.55 * Math.sin(this.time * 1.7 + e.wob);
          e.aiTimer -= dt;
          if (e.aiTimer <= 0 && distToP < d.keepDist * 1.7) {
            e.aiTimer = d.fireCd * this.rng.float(0.85, 1.2);
            this.fireEnemyBullet(e, d, ang);
          }
        } else if (d.ai === 'bomber') {
          const ang = U.angleTo(e.x, e.y, p.x, p.y);
          mx = Math.cos(ang); my = Math.sin(ang);
          if (distToP < d.fuseRange) {
            e.state = 'fuse';
            e.fuse = (e.fuse || d.fuseTime) - dt;
            speedMul *= 1.9;
            if (!e.fuseInit) { e.fuseInit = true; e.fuse = d.fuseTime; }
            if (e.fuse <= 0) {
              this.explodeEnemy(e, d);
              continue;
            }
          }
        } else if (d.ai === 'charger') {
          e.aiTimer -= dt;
          if (e.state === 'charge') {
            e.chargeT -= dt;
            mx = Math.cos(e.chargeAng); my = Math.sin(e.chargeAng);
            speedMul *= d.chargeSpeed / d.speed;
            if (e.chargeT <= 0) { e.state = 'idle'; e.aiTimer = d.chargeCd; }
          } else {
            const ang = U.angleTo(e.x, e.y, p.x, p.y);
            mx = Math.cos(ang) * 0.8; my = Math.sin(ang) * 0.8;
            if (e.aiTimer <= 0 && distToP < d.chargeRange && distToP > 70) {
              e.state = 'charge';
              e.chargeT = d.chargeTime;
              e.chargeAng = ang;
              this.addEffect({ type: 'ring', x: e.x, y: e.y, r0: 4, r1: e.r * 2, life: 0.25, color: '#ff4d6d' });
            }
          }
        }

        // ---- 位移 ----
        if (!frozen) {
          const sp = e.speed * speedMul;
          e.x += mx * sp * dt;
          e.y += my * sp * dt;
        }

        // 击退
        if (e.kx || e.ky) {
          e.x += e.kx * dt;
          e.y += e.ky * dt;
          const damp = Math.exp(-9 * dt);
          e.kx *= damp; e.ky *= damp;
          if (Math.abs(e.kx) < 1 && Math.abs(e.ky) < 1) { e.kx = 0; e.ky = 0; }
        }

        // ---- 敌人之间轻推，避免完全重叠 ----
        if (d.ai !== 'ranged') {
          this.grid.query(e.x, e.y, e.r, q);
          let px = 0, py = 0, cnt = 0;
          for (let k = 0; k < q.length && cnt < 4; k++) {
            const o = q[k];
            if (o === e || o.dead) continue;
            const dx2 = e.x - o.x, dy2 = e.y - o.y;
            const dd = Math.hypot(dx2, dy2);
            const want = e.r + o.r;
            if (dd > 0.01 && dd < want) {
              const push = (want - dd) / want;
              px += (dx2 / dd) * push;
              py += (dy2 / dd) * push;
              cnt++;
            }
          }
          e.x += px * 26 * dt * 2;
          e.y += py * 26 * dt * 2;
        }

        // ---- 接触伤害 ----
        if (e.contactCd <= 0 && U.circleHit(e.x, e.y, e.r, p.x, p.y, p.r)) {
          e.contactCd = 0.72;
          this.damagePlayer(e.dmg, 'contact', e);
        }
      }
    }

    fireEnemyBullet(e, d, ang) {
      this.enemyBullets.push({
        x: e.x, y: e.y,
        vx: Math.cos(ang) * d.bulletSpeed,
        vy: Math.sin(ang) * d.bulletSpeed,
        r: 6,
        dmg: d.bulletDmg * RG.waveScaling(this.wave).dmg,
        color: d.accent || '#9f6',
        life: 4,
        dead: false,
      });
      RG.Audio.shoot();
    }

    explodeEnemy(e, d) {
      const R = d.blastR;
      this.addEffect({ type: 'ring', x: e.x, y: e.y, r0: 8, r1: R, life: 0.36, color: '#ff8a3d' });
      this.addEffect({ type: 'flare', x: e.x, y: e.y, r1: R * 0.8, life: 0.3, color: '#ffd28a' });
      this.spawnBurst(e.x, e.y, R * 0.8, '#ff8a3d', 14);
      this.shake(5);
      RG.Audio.explode();
      if (U.dist(e.x, e.y, this.player.x, this.player.y) < R + this.player.r) {
        this.damagePlayer(d.blastDmg * RG.waveScaling(this.wave).dmg, 'explode', e);
      }
      e.dead = true;
      this.onEnemyKilled(e, { silent: true });
    }

    /* ================== 玩家受伤 ================== */
    damagePlayer(amount, cause, attacker) {
      const p = this.player;
      if (p.invuln > 0 || this.phase !== 'combat') return;

      // 闪避
      if (p.mods.dodge && this.rng.chance(p.mods.dodge)) {
        this.addText(p.x, p.y - 30, '闪避', '#9dffb0', 13);
        p.invuln = 0.15;
        return;
      }

      const armor = p.stats.armor;
      let dmg = amount * (100 / (100 + armor));
      dmg = Math.max(1, dmg);

      p.hp -= dmg;
      p.invuln = 0.52;
      p.lastHurtT = this.time;
      this.shake(6);
      RG.Audio.hurt();
      this.addText(p.x + this.rng.float(-8, 8), p.y - 26, '-' + Math.round(dmg), '#ff5c78', 15, true);
      this.spawnBurst(p.x, p.y, 24, '#ff5c78', 6);

      RG.Combat.onPlayerHit(this, attacker, dmg);

      if (p.hp <= 0) {
        p.hp = 0;
        this.phase = 'dead';
        RG.Audio.death();
        this.shake(16);
        this.spawnBurst(p.x, p.y, 80, '#ff3b5c', 30);
        this.events.push({ type: 'dead' });
      }
    }

    /* ================== 击杀 ================== */
    onEnemyKilled(e, opt) {
      if (e.dead) return;
      e.dead = true;
      opt = opt || {};
      this.kills++;
      this.waveKills++;
      const p = this.player;

      // 死亡特效
      this.spawnBurst(e.x, e.y, e.r * 1.6, e.def.color, e.elite ? 14 : 6);
      this.addParticle(e.x, e.y, 0, 0, e.r * 1.2, e.def.accent || '#fff', 0.3, 0);

      // 落物
      this.spawnDrops(e);

      // 分裂
      if (e.def.splitInto) {
        const n = e.def.splitCount || 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * U.TAU + this.rng.float(0, 1);
          this.pendingSpawns.push({
            id: e.def.splitInto,
            x: e.x + Math.cos(a) * e.r,
            y: e.y + Math.sin(a) * e.r,
            opt: {},
          });
        }
      }

      const mods = p.mods || {};
      // 击杀回血
      if (mods.killHeal) {
        p.hp = Math.min(p.stats.maxHp, p.hp + mods.killHeal);
      }
      // 爆裂
      if (mods.killExplode) {
        const R = 78 * p.stats.area * mods.killExplode;
        this.addEffect({ type: 'ring', x: e.x, y: e.y, r0: 4, r1: R, life: 0.26, color: '#ffc861' });
        RG.Combat.explode(this, e.x, e.y, R, p.stats.damage * 14 * RG.Combat.damageMult(p), {
          color: '#ffc861', noChain: true,
        });
      }
      // 灼烧爆裂
      if (mods.burnExplode && e.burn && e.burn.length) {
        RG.Combat.explode(this, e.x, e.y, 92 * p.stats.area, 16 * RG.Combat.damageMult(p), {
          color: '#ff8a3d', noChain: true,
        });
        this.addEffect({ type: 'ring', x: e.x, y: e.y, r0: 4, r1: 92, life: 0.24, color: '#ff8a3d' });
      }

      // 角色被动
      if (p.passive && p.passive.id === 'bladecreed') {
        p.passiveDmgStack = Math.min(p.passive.cap, (p.passiveDmgStack || 0) + p.passive.perKill);
      }
      if (p.passive && p.passive.id === 'overload') {
        if (this.rng.chance(p.passive.procCd)) p.atkTimer = 0;
      }

      RG.Audio.kill();
    }

    /* ================== 掉落 ================== */
    spawnDrops(e) {
      const p = this.player;
      const ch = RG.dropChances(p.stats.luck);

      // 经验球
      const orbCount = e.elite ? 4 : 1;
      for (let i = 0; i < orbCount; i++) {
        this.pickups.push({
          kind: 'xp',
          x: e.x + this.rng.float(-10, 10),
          y: e.y + this.rng.float(-10, 10),
          vx: this.rng.float(-40, 40),
          vy: this.rng.float(-40, 40),
          value: e.xp / orbCount,
          r: 6,
          color: '#54c9b4',
          life: 26,
          age: 0,
          magnet: false,
        });
      }

      // 金币
      if (this.rng.chance(ch.gold)) {
        const goldMul = 1 + (p.stats.goldGain || 0) + (p.passive && p.passive.extraGold ? p.passive.extraGold : 0);
        const g = Math.max(1, Math.round(e.gold * goldMul * this.rng.float(0.8, 1.3)));
        this.pickups.push({
          kind: 'gold', x: e.x + this.rng.float(-8, 8), y: e.y + this.rng.float(-8, 8),
          vx: this.rng.float(-50, 50), vy: this.rng.float(-50, 50),
          value: g, r: 6, color: '#ffc53d', life: 24, age: 0, magnet: false,
        });
      }

      // 装备
      const itemChance = e.elite ? ch.eliteItem : ch.item;
      if (this.rng.chance(itemChance)) {
        const item = RG.rollRandomItem({
          wave: this.wave, rng: this.rng, luck: p.stats.luck,
        });
        this.pickups.push({
          kind: 'item', x: e.x, y: e.y, vx: this.rng.float(-20, 20), vy: this.rng.float(-20, 20),
          value: 0, r: 13, color: item.color, life: 60, age: 0, magnet: false, item,
        });
        this.addEffect({ type: 'ring', x: e.x, y: e.y, r0: 4, r1: 40, life: 0.5, color: item.color });
      }

      // 治疗
      if (this.rng.chance(ch.heal)) {
        this.pickups.push({
          kind: 'heal', x: e.x, y: e.y, vx: 0, vy: 0,
          value: 0.10, r: 8, color: '#3ddc84', life: 30, age: 0, magnet: false,
        });
      }
    }

    updatePickups(dt) {
      const p = this.player;
      const pickR = 96 * p.stats.pickup;
      const list = this.pickups;

      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        o.age += dt;
        o.life -= dt;

        const d = U.dist(o.x, o.y, p.x, p.y);
        const isItem = o.kind === 'item';
        // 装备同样会被吸引；但行囊已满时留在原地，不再追着玩家跑
        const canTake = !isItem || this.bagHasSpace();

        if (canTake && d < pickR) o.magnet = true;
        // 落地 2.4 秒后自动飘向玩家，避免满地光点
        if (!isItem && o.age > 2.4) o.magnet = true;

        if (o.magnet && canTake) {
          const ang = U.angleTo(o.x, o.y, p.x, p.y);
          const sp = 320 + (pickR - Math.min(d, pickR)) * 3;
          o.x += Math.cos(ang) * sp * dt;
          o.y += Math.sin(ang) * sp * dt;
        } else {
          o.x += o.vx * dt;
          o.y += o.vy * dt;
          o.vx *= Math.exp(-5 * dt);
          o.vy *= Math.exp(-5 * dt);
        }

        // 拾取判定
        const grabR = isItem ? p.r + 30 : 22;
        if (d < grabR) {
          // 装备：背包满了就不拾取，留在地上
          if (isItem && !this.bagHasSpace()) {
            this.warnBagFull(o.x, o.y);
          } else if (this.collectPickup(o)) {
            U.swapRemove(list, i);
            continue;
          }
        }

        if (o.life <= 0) U.swapRemove(list, i);
      }
    }

    warnBagFull(x, y) {
      if (x !== undefined) this.addText(x, y - 18, '行囊已满', '#ff9a6a', 13, true);
      if (this._bagWarnT && this.time - this._bagWarnT < 5) return;
      this._bagWarnT = this.time;
      this.events.push({ type: 'bagFull' });
    }

    /** @returns {boolean} 是否成功消耗掉这个掉落物 */
    collectPickup(o) {
      const p = this.player;
      if (o.kind === 'xp') {
        this.gainXp(o.value);
        RG.Audio.pickup();
        return true;
      }
      if (o.kind === 'gold') {
        p.gold += Math.round(o.value);
        this.totalGold += Math.round(o.value);
        this.waveGold += Math.round(o.value);
        RG.Audio.coin();
        return true;
      }
      if (o.kind === 'heal') {
        const h = p.stats.maxHp * o.value;
        p.hp = Math.min(p.stats.maxHp, p.hp + h);
        this.addText(p.x, p.y - 34, '+' + Math.round(h), '#3ddc84', 13);
        RG.Audio.heal();
        return true;
      }
      if (o.kind === 'item') {
        return this.pickupItem(o.item);
      }
      return true;
    }

    /* ================== 背包 ================== */
    /**
     * 拾取装备：进入背包。
     * - 饰品：进背包即生效（背包就是饰品的佩戴位置）
     * - 武器/防具：进背包；若对应佩戴位为空则自动装上
     * 背包满时返回 false，掉落物会留在地上。
     */
    pickupItem(item) {
      const p = this.player;
      const idx = this.firstFreeSlot();
      if (idx < 0) {
        this.warnBagFull();
        return false;
      }

      const oldBonds = this.bondTierMap();
      p.bag[idx] = item;

      let autoWorn = null;
      if (item.slot === 'weapon' || item.slot === 'armor') {
        if (!p.equip[item.slot]) {
          p.equip[item.slot] = item;
          p.bag[idx] = null;
          autoWorn = item.slot;
        }
      }

      this.recomputeStats();

      const newlyActive = this.newBonds(oldBonds);
      this.events.push({
        type: 'pickup', item, bagIndex: idx, autoWorn, newlyActive,
      });
      if (newlyActive.length) RG.Audio.bond();
      return true;
    }

    /** 把背包里的武器/防具换到佩戴位（与原佩戴位互换） */
    equipFromBag(idx) {
      const p = this.player;
      if (idx < 0 || idx >= this.bagCapacity()) return false;
      const it = p.bag[idx];
      if (!it) return false;
      if (it.slot !== 'weapon' && it.slot !== 'armor') return false;

      const slot = it.slot;
      const oldBonds = this.bondTierMap();
      const prev = p.equip[slot];
      p.equip[slot] = it;
      p.bag[idx] = prev || null;
      this.recomputeStats();

      this.events.push({
        type: 'equipSwap', slot, item: it, old: prev, newlyActive: this.newBonds(oldBonds),
      });
      RG.Audio.buy();
      return true;
    }

    /** 丢弃背包物品，返还少量金币 */
    dropFromBag(idx) {
      const p = this.player;
      if (idx < 0 || idx >= this.bagCapacity()) return false;
      const it = p.bag[idx];
      if (!it) return false;
      const refund = Math.max(1, Math.round(it.price * 0.25));
      p.gold += refund;
      p.bag[idx] = null;
      this.recomputeStats();
      this.events.push({ type: 'drop', item: it, refund });
      RG.Audio.coin();
      return true;
    }

    /** 自动出售背包里评分最低的物品（用于背包满时的兜底决策） */
    sellWorstFromBag(keepSlot) {
      const p = this.player;
      let worst = -1, worstScore = Infinity;
      const cap = this.bagCapacity();
      for (let i = 0; i < cap; i++) {
        const it = p.bag[i];
        if (!it) continue;
        if (keepSlot && it.slot !== keepSlot) continue;
        const sc = RG.itemScore(it);
        if (sc < worstScore) { worstScore = sc; worst = i; }
      }
      if (worst < 0) return false;
      return this.dropFromBag(worst);
    }

    bondTierMap() {
      const m = {};
      (this.player.bonds || []).forEach((b) => { if (b.tier > 0) m[b.bond.id] = b.tier; });
      return m;
    }

    newBonds(oldMap) {
      return (this.player.bonds || []).filter(
        (b) => b.tier > 0 && (oldMap[b.bond.id] || 0) < b.tier
      );
    }


    /* ================== 经验 / 升级 ================== */
    gainXp(v) {
      const p = this.player;
      p.xp += v * (1 + (p.stats.xpGain || 0));
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = this.xpForLevel(p.level);
        p.pendingLevels++;
      }
      if (p.pendingLevels > 0 && this.phase === 'combat') {
        this.openLevelUp();
      }
    }

    xpForLevel(lv) {
      return Math.round(12 + Math.pow(lv, 1.8) * 8.5);
    }

    openLevelUp() {
      this.phase = 'levelup';
      const p = this.player;
      const choices = RG.rollPerkChoices(this.rng, p.perkCounts, p.level, 3);
      this.events.push({
        type: 'levelup',
        level: p.level,
        choices,
        pending: p.pendingLevels,
      });
      RG.Audio.levelup();
    }

    choosePerk(perkId, rerolled) {
      const p = this.player;
      const perk = RG.PERK_MAP[perkId];
      if (!perk) return;
      p.perkCounts[perkId] = (p.perkCounts[perkId] || 0) + 1;
      this.recomputeStats({ heal: true });
      p.pendingLevels = Math.max(0, p.pendingLevels - 1);
      this.events.push({ type: 'perkChosen', perk });
      if (p.pendingLevels > 0) {
        this.openLevelUp();
      } else {
        this.phase = 'combat';
      }
    }

    rerollPerks(cost) {
      const p = this.player;
      if (p.gold < cost) return false;
      p.gold -= cost;
      const choices = RG.rollPerkChoices(this.rng, p.perkCounts, p.level, 3);
      this.events.push({ type: 'levelup', level: p.level, choices, pending: p.pendingLevels, rerolled: true });
      return true;
    }

    /* ================== 波次 ================== */
    updateWave(dt) {
      const p = this.player;
      this.waveTime -= dt;

      // 刷怪
      const sc = RG.waveScaling(this.wave);
      const cap = Math.min(MAX_ENEMIES, Math.round(26 + this.wave * 11));
      const rate = (1.2 + this.wave * 0.9) * sc.density;
      this.spawnAcc += dt * rate;

      while (this.spawnAcc >= 1) {
        if (this.enemies.length >= cap) { this.spawnAcc = 0; break; }
        this.spawnAcc -= 1;
        this.spawnRandomGroup();
      }

      if (this.waveTime <= 0) {
        this.endWave();
      }
    }

    spawnRandomGroup() {
      const wave = this.wave;
      const pool = RG.enemiesForWave(wave);
      if (!pool.length) return;
      const weights = pool.map((e) => e.weight);
      const def = this.rng.weighted(pool, weights);

      // 沿屏幕椭圆边缘外生成，让怪潮"贴脸"涌来
      const hw = (this.viewHalfW || 560) + 70;
      const hh = (this.viewHalfH || 320) + 70;
      const ang = this.rng.float(0, U.TAU);
      const k = this.rng.float(1.0, 1.14);
      const x = this.player.x + Math.cos(ang) * hw * k;
      const y = this.player.y + Math.sin(ang) * hh * k;

      const elite = this.rng.chance(Math.min(0.07, 0.005 * wave));

      if (def.pack) {
        const n = this.rng.int(def.pack[0], def.pack[1]);
        for (let i = 0; i < n; i++) {
          this.spawnEnemy(def.id, x + this.rng.float(-28, 28), y + this.rng.float(-28, 28), { elite: false });
        }
      } else {
        this.spawnEnemy(def.id, x, y, { elite });
      }
    }

    /** 波次开始时立刻铺一批，避免开局空场 */
    primeWave() {
      const cap = Math.min(MAX_ENEMIES, Math.round(26 + this.wave * 11));
      const n = Math.round(cap * 0.45);
      for (let i = 0; i < n; i++) this.spawnRandomGroup();
    }

    endWave() {
      // 清场：残敌被深渊吞噬，转化为经验
      const remain = this.enemies.length;
      const p = this.player;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dead) continue;
        e.dead = true;
        this.spawnBurst(e.x, e.y, e.r * 1.4, e.def.color, 3);
        p.xp += e.xp * (1 + (p.stats.xpGain || 0));
      }
      this.enemies.length = 0;
      this.enemyBullets.length = 0;
      this.projectiles.length = 0;
      this.orbitHitCd.clear();

      // 场上所有未拾取的掉落自动结算（避免玩家白打）
      let overflow = 0, overflowGold = 0;
      for (let i = 0; i < this.pickups.length; i++) {
        const o = this.pickups[i];
        if (o.kind === 'xp') {
          p.xp += o.value * (1 + (p.stats.xpGain || 0));
        } else if (o.kind === 'gold') {
          p.gold += Math.round(o.value);
          this.totalGold += Math.round(o.value);
        } else if (o.kind === 'heal') {
          p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * o.value);
        } else if (o.kind === 'item') {
          if (!this.pickupItem(o.item)) {
            // 背包满：折算成金币，不让玩家白打
            const g = Math.max(1, Math.round(o.item.price * 0.3));
            p.gold += g;
            this.totalGold += g;
            overflow++;
            overflowGold += g;
          }
        }
      }
      this.pickups.length = 0;
      if (overflow > 0) {
        this.events.push({ type: 'bagOverflow', count: overflow, gold: overflowGold });
      }

      // 结算积压的经验（升级在选择界面之前统一处理）
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = this.xpForLevel(p.level);
        p.pendingLevels++;
      }

      this.phase = 'shop';
      this.openShop();
      this.events.push({ type: 'waveEnd', wave: this.wave, remain });
      RG.Audio.wave();
    }

    /* ================== 商店 ================== */
    openShop() {
      const p = this.player;
      this.shop.rerollCost = Math.round(30 + this.wave * 9);
      this.shop.stock = RG.makeShopStock({
        wave: this.wave,
        luck: p.stats.luck,
        count: 4,
        rng: this.rng,
      });
      this.shop.healCost = Math.round(30 + p.stats.maxHp * 0.10);
      this.events.push({ type: 'openShop' });
    }

    buyShopItem(index) {
      const p = this.player;
      const entry = this.shop.stock[index];
      if (!entry || entry.sold) return false;
      if (p.gold < entry.price) { RG.Audio.deny(); return 'gold'; }
      if (!this.bagHasSpace()) { RG.Audio.deny(); return 'bag'; }
      p.gold -= entry.price;
      entry.sold = true;
      this.pickupItem(entry.item);
      RG.Audio.buy();
      this.events.push({ type: 'bought', item: entry.item });
      return true;
    }

    rerollShop() {
      const p = this.player;
      if (p.gold < this.shop.rerollCost) { RG.Audio.deny(); return false; }
      p.gold -= this.shop.rerollCost;
      this.shop.rerollCost = Math.round(this.shop.rerollCost * 1.85);
      this.shop.stock = RG.makeShopStock({
        wave: this.wave, luck: p.stats.luck, count: 4, rng: this.rng,
      });
      RG.Audio.buy();
      this.events.push({ type: 'shopReroll' });
      return true;
    }

    buyHeal() {
      const p = this.player;
      const cost = this.shop.healCost;
      if (p.gold < cost) { RG.Audio.deny(); return false; }
      const heal = p.stats.maxHp * 0.45;
      p.gold -= cost;
      p.hp = Math.min(p.stats.maxHp, p.hp + heal);
      this.shop.healCost = Math.round(cost * 1.35);
      RG.Audio.heal();
      this.addText(p.x, p.y - 40, '+' + Math.round(heal), '#3ddc84', 15);
      return true;
    }

    nextWave() {
      this.wave++;
      this.maxWave = Math.max(this.maxWave, this.wave);
      this.waveTime = WAVE_DURATION;
      this.spawnAcc = 0;
      this.waveKills = 0;
      this.waveGold = 0;
      this.phase = 'combat';
      this.orbitHitCd.clear();
      this.primeWave();
      this.events.push({ type: 'waveStart', wave: this.wave });

      // 波间结算攒下的升级，在进入新一波时逐次处理
      if (this.player.pendingLevels > 0) this.openLevelUp();
    }

    /* ================== 视觉对象 ================== */
    addParticle(x, y, vx, vy, size, color, life, drag, additive) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      this.particles.push({
        x, y, vx, vy, size, color,
        life, maxLife: life, drag: drag === undefined ? 2 : drag,
        add: additive !== false,
      });
    }

    spawnHitParticle(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU;
        const sp = 60 + Math.random() * 160;
        this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 2 + Math.random() * 2.5, color, 0.2 + Math.random() * 0.15, 3);
      }
    }

    spawnBurst(x, y, r, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU;
        const sp = (r / 4) * (0.6 + Math.random() * 1.4);
        this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
          2 + Math.random() * 3.5, color, 0.25 + Math.random() * 0.35, 2.6);
      }
    }

    addText(x, y, val, color, size, crit) {
      if (this.texts.length >= MAX_TEXTS) this.texts.shift();
      this.texts.push({
        x, y, vy: crit ? -62 : -46,
        text: String(val), color: color || '#fff',
        size: size || 12, crit: !!crit,
        life: crit ? 0.85 : 0.62, maxLife: crit ? 0.85 : 0.62,
        vx: (Math.random() - 0.5) * 26,
      });
    }

    addEffect(e) {
      if (this.effects.length > 120) this.effects.shift();
      e.maxLife = e.life;
      this.effects.push(e);
    }

    updateVisuals(dt) {
      const P = this.particles;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life -= dt;
        if (p.life <= 0) { U.swapRemove(P, i); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
      const T = this.texts;
      for (let i = T.length - 1; i >= 0; i--) {
        const t = T[i];
        t.life -= dt;
        if (t.life <= 0) { U.swapRemove(T, i); continue; }
        t.y += t.vy * dt;
        t.vy *= Math.exp(-3.2 * dt);
        t.x += t.vx * dt;
      }
      const E = this.effects;
      for (let i = E.length - 1; i >= 0; i--) {
        E[i].life -= dt;
        if (E[i].life <= 0) U.swapRemove(E, i);
      }
    }

    shake(v) {
      this.camera.shake = Math.min(24, this.camera.shake + v);
    }

    /* ================== 统计 / 序列化 ================== */
    stats() {
      const p = this.player;
      return {
        wave: this.wave,
        kills: this.kills,
        level: p.level,
        gold: this.totalGold,
        time: this.runTime,
      };
    }

    /** 轻量快照：为将来联机同步预留 */
    snapshot() {
      const p = this.player;
      return {
        t: this.time,
        wave: this.wave,
        phase: this.phase,
        player: {
          x: p.x, y: p.y, hp: p.hp, level: p.level, xp: p.xp,
          aim: p.aim, gold: p.gold,
          equip: p.equip,
          bag: p.bag.map((it) => (it ? it.uid : null)),
          perks: p.perkCounts,
        },
        enemies: this.enemies.map((e) => ({
          i: e.id, d: e.defId, x: Math.round(e.x), y: Math.round(e.y),
          h: Math.round(e.hp),
        })),
      };
    }

    /** 恢复快照（客户端预测纠正用） */
    restore(snap) {
      if (!snap) return;
      this.time = snap.t;
      this.wave = snap.wave;
      this.phase = snap.phase;
      const p = this.player;
      p.x = snap.player.x; p.y = snap.player.y;
      p.hp = snap.player.hp; p.level = snap.player.level;
      p.xp = snap.player.xp; p.gold = snap.player.gold;
      p.aim = snap.player.aim;
      // 敌人按 id 对齐 —— 完整实现见 net.js 的权威校正
      const map = new Map();
      snap.enemies.forEach((s) => map.set(s.i, { x: s.x, y: s.y, hp: s.h }));
      for (const e of this.enemies) {
        const s = map.get(e.id);
        if (s) { e.x = s.x; e.y = s.y; e.hp = s.hp; }
      }
    }
  }

  RG.World = World;
  RG.WAVE_DURATION = WAVE_DURATION;
  RG.MAX_ENEMIES = MAX_ENEMIES;
})(window);
