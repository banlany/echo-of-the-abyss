/* ==========================================================
   combat.js — 战斗内核
   ----------------------------------------------------------
   所有武器共用同一套伤害管线：
     基础伤害 × 玩家伤害倍率 × 被动修正 → 暴击判定 → 敌人护甲
   武器之间的差异来自 attack.type 的行为实现。
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});
  const U = RG.U;

  const Combat = {};
  RG.Combat = Combat;

  /* 复用缓冲，避免每帧分配 */
  const _buf = [];
  const _buf2 = [];

  /* ---------------------------------------------------------
     伤害管线
     --------------------------------------------------------- */

  /** 玩家动态伤害倍率（被动 / 羁绊触发） */
  Combat.damageMult = function (p) {
    let m = 1;
    const mods = p.mods || {};
    const hpRatio = p.hp / Math.max(1, p.stats.maxHp);

    // 血怒羁绊
    if (mods.rage && hpRatio < 0.4) m += mods.rage;

    // 格罗姆 · 嗜血
    if (p.passive && p.passive.id === 'bloodlust') {
      m += p.passive.max * (1 - hpRatio);
    }
    // 雷恩 · 剑势（击杀累积）
    m += p.passiveDmgStack || 0;

    // 凯 · 疾风步
    if (p.passive && p.passive.id === 'windstep' && (p.moveActive || 0) > 0) {
      // 攻速加成在 recompute 里处理不了，这里不涉及
    }
    return m;
  };

  /** 玩家当前攻速倍率（含被动） */
  Combat.speedMult = function (p) {
    let s = 1 + (p.stats.attackSpeed || 0);
    if (p.passive && p.passive.id === 'windstep' && (p.moveActive || 0) > 0) {
      s += p.passive.speedBonus;
    }
    // 血怒 4 层：狂暴攻速
    if (p.mods && p.mods.rageSpeed && p.hp / p.stats.maxHp < 0.4) s += p.mods.rageSpeed;
    return Math.max(0.2, s);
  };

  /** 一次攻击的最终伤害（含暴击） */
  Combat.rollHit = function (w, p, base, opt) {
    opt = opt || {};
    const st = p.stats;
    let dmg = base * Combat.damageMult(p) * (opt.mul || 1);
    const crit = !opt.noCrit && w.rng.chance(st.crit);
    if (crit) dmg *= st.critMult;
    return { dmg, crit };
  };

  /**
   * 对单个敌人造成伤害
   * @param {object} w 世界
   * @param {object} e 敌人
   * @param {number} amount 已计算暴击的伤害
   * @param {object} opt { crit, noText, source, element, knock, from: 'player'|'dot' }
   */
  Combat.damageEnemy = function (w, e, amount, opt) {
    if (!e || e.dead) return;
    opt = opt || {};
    const p = w.player;

    // 处决：残血翻倍
    if (p.mods && p.mods.execute && !opt.noExecute) {
      if (e.hp / e.maxHp < 0.3) amount *= 2;
    }

    // 敌人护甲减伤
    const ar = e.armor || 0;
    if (ar > 0) amount *= 1 - ar / (ar + 70);

    amount = Math.max(1, amount);
    e.hp -= amount;
    e.flash = 1;
    e.hitCount = (e.hitCount || 0) + 1;

    // 击退
    if (opt.knock) {
      const resist = 1 - (e.knockResist || 0);
      const ang = U.angleTo(p.x, p.y, e.x, e.y);
      e.kx = (e.kx || 0) + Math.cos(ang) * opt.knock * resist;
      e.ky = (e.ky || 0) + Math.sin(ang) * opt.knock * resist;
    }

    // 生命偷取
    if (p.stats.lifesteal > 0) {
      p.hp = Math.min(p.stats.maxHp, p.hp + amount * p.stats.lifesteal);
    }

    // 伤害数字
    if (!opt.noText) {
      const isCrit = !!opt.crit;
      w.addText(
        e.x + w.rng.float(-6, 6),
        e.y - e.r - 4,
        Math.round(amount),
        isCrit ? '#ffd866' : opt.color || '#ffffff',
        isCrit ? 17 : 12,
        isCrit
      );
    }

    // 命中粒子
    w.spawnHitParticle(e.x, e.y, opt.color || '#ffffff', opt.crit ? 5 : 2);

    // 元素附着
    this.applyElements(w, e, opt);

    // 暗影羁绊：暴击弹射
    if (opt.crit && p.mods && p.mods.shadowBolt) {
      this.shadowBolt(w, e, p.mods.shadowBolt);
    }

    if (e.hp <= 0) w.onEnemyKilled(e, opt);
  };

  /** 灼烧 / 减速 / 冻结 / 链电 */
  Combat.applyElements = function (w, e, opt) {
    const p = w.player;
    const mods = p.mods || {};
    const dmgBase = opt.baseDmg || opt.dmg || 0;

    // 烈焰
    const burnRate = mods.burnOnHit || (mods.fireEnchant ? 0.30 : 0);
    if (burnRate > 0 && dmgBase > 0 && !opt.dot) {
      const stacks = mods.burnStacks || 1;
      e.burn = e.burn || [];
      if (e.burn.length < stacks) {
        e.burn.push({ dps: dmgBase * burnRate, until: w.time + 3 });
      } else {
        // 刷新最强的一层
        let weakest = 0;
        for (let i = 1; i < e.burn.length; i++) if (e.burn[i].dps < e.burn[weakest].dps) weakest = i;
        if (e.burn[weakest].dps < dmgBase * burnRate) {
          e.burn[weakest] = { dps: dmgBase * burnRate, until: w.time + 3 };
        } else {
          for (let i = 0; i < e.burn.length; i++) e.burn[i].until = Math.max(e.burn[i].until, w.time + 1.5);
        }
      }
    }

    // 寒霜
    const slow = mods.slowOnHit || (mods.frostEnchant ? 0.30 : 0);
    if (slow > 0 && !opt.dot) {
      if ((e.slowAmt || 0) < slow || w.time > (e.slowUntil || 0)) e.slowAmt = slow;
      e.slowUntil = w.time + 1.6;
      if (mods.freezeChance && w.rng.chance(mods.freezeChance)) {
        e.frozenUntil = w.time + 1.0;
        w.addEffect({ type: 'ring', x: e.x, y: e.y, r0: 4, r1: e.r * 2.4, life: 0.35, color: '#a8ecff' });
      }
    }

    // 雷霆
    const chainChance = mods.chainChance || (mods.stormEnchant ? 0.20 : 0);
    if (chainChance > 0 && !opt.dot && !opt.noChain && w.rng.chance(chainChance)) {
      this.chainLightning(w, e, dmgBase * 0.55, 2 + (mods.chainBonus || 0));
    }
  };

  /** 暗影弹 */
  Combat.shadowBolt = function (w, from, count) {
    const p = w.player;
    for (let i = 0; i < count; i++) {
      const t = w.grid.nearest(from.x, from.y, 420, (q) => q !== from);
      if (!t) break;
      const ang = U.angleTo(p.x, p.y, t.x, t.y) + w.rng.float(-0.2, 0.2);
      this.spawnProjectile(w, {
        x: from.x, y: from.y,
        ang,
        speed: 700,
        dmg: 16 * Combat.damageMult(p) * p.stats.damage,
        pierce: 0,
        life: 1.2,
        size: 5,
        color: '#b18cff',
        kind: 'shadowbolt',
        noSplit: true,
      });
    }
  };

  /* ---------------------------------------------------------
     投射物
     --------------------------------------------------------- */
  Combat.spawnProjectile = function (w, cfg) {
    w.projectiles.push({
      x: cfg.x, y: cfg.y,
      vx: Math.cos(cfg.ang) * cfg.speed,
      vy: Math.sin(cfg.ang) * cfg.speed,
      ang: cfg.ang,
      speed: cfg.speed,
      r: cfg.size || 5,
      dmg: cfg.dmg,
      pierce: cfg.pierce || 0,
      life: cfg.life || 1.6,
      maxLife: cfg.life || 1.6,
      color: cfg.color || '#fff',
      kind: cfg.kind || 'bolt',
      homing: cfg.homing || 0,
      turn: cfg.turn || 0,
      target: cfg.target || null,
      novaR: cfg.novaR || 0,
      slow: cfg.slow || 0,
      trail: !!cfg.trail,
      noSplit: !!cfg.noSplit,
      hit: null,
      boomerang: cfg.boomerang || null,
      dead: false,
    });
  };

  Combat.updateProjectiles = function (w, dt) {
    const list = w.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const pr = list[i];
      pr.life -= dt;

      // 追踪
      if (pr.homing > 0) {
        if (!pr.target || pr.target.dead) {
          pr.target = w.grid.nearest(pr.x, pr.y, 460);
        }
        if (pr.target) {
          const want = U.angleTo(pr.x, pr.y, pr.target.x, pr.target.y);
          pr.ang = U.angleLerp(pr.ang, want, Math.min(1, pr.homing * dt));
          pr.vx = Math.cos(pr.ang) * pr.speed;
          pr.vy = Math.sin(pr.ang) * pr.speed;
        }
      }

      // 回旋镖折返
      if (pr.boomerang) {
        pr.boomerang.traveled += Math.hypot(pr.vx, pr.vy) * dt;
        if (!pr.boomerang.back && pr.boomerang.traveled >= pr.boomerang.dist) {
          pr.boomerang.back = true;
        }
        if (pr.boomerang.back) {
          const want = U.angleTo(pr.x, pr.y, w.player.x, w.player.y);
          pr.ang = U.angleLerp(pr.ang, want, Math.min(1, 9 * dt));
          pr.vx = Math.cos(pr.ang) * pr.speed;
          pr.vy = Math.sin(pr.ang) * pr.speed;
          if (U.dist(pr.x, pr.y, w.player.x, w.player.y) < 22) { pr.dead = true; }
        }
      }

      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;

      // 尾迹
      if (pr.trail && w.rng.chance(0.55)) {
        w.addParticle(pr.x, pr.y, 0, 0, pr.r * 0.7, pr.color, 0.22, 0.4);
      }

      // 命中检测
      w.grid.query(pr.x, pr.y, pr.r + 6, _buf);
      for (let k = 0; k < _buf.length; k++) {
        const e = _buf[k];
        if (e.dead) continue;
        if (pr.hit && pr.hit.has(e.id)) continue;
        if (U.dist2(pr.x, pr.y, e.x, e.y) > (pr.r + e.r) * (pr.r + e.r)) continue;

        if (!pr.hit) pr.hit = new Set();
        pr.hit.add(e.id);

        const h = { dmg: pr.dmg, crit: w.rng.chance(w.player.stats.crit) };
        if (h.crit) h.dmg *= w.player.stats.critMult;
        Combat.damageEnemy(w, e, h.dmg, {
          crit: h.crit, color: pr.color, baseDmg: pr.dmg, dmg: pr.dmg, knock: 60,
        });

        // 寒霜新星
        if (pr.novaR > 0) {
          Combat.explode(w, pr.x, pr.y, pr.novaR, pr.dmg * 0.65, {
            color: pr.color, slow: pr.slow, fromProjectile: true,
          });
          w.addEffect({ type: 'ring', x: pr.x, y: pr.y, r0: 6, r1: pr.novaR, life: 0.32, color: pr.color });
          w.addEffect({ type: 'flare', x: pr.x, y: pr.y, r1: pr.novaR * 0.6, life: 0.28, color: pr.color });
          pr.dead = true;
        }

        // 分裂弹
        if (w.player.mods && w.player.mods.splitShot && !pr.noSplit && !pr.isSplit) {
          for (let s = -1; s <= 1; s += 2) {
            Combat.spawnProjectile(w, {
              x: pr.x, y: pr.y, ang: pr.ang + s * 0.7, speed: pr.speed * 0.8,
              dmg: pr.dmg * 0.45, pierce: 0, life: 0.5, size: pr.r * 0.7,
              color: pr.color, kind: pr.kind, isSplit: true, noSplit: true,
            });
          }
        }

        if (pr.pierce-- <= 0) { pr.dead = true; break; }
      }

      if (pr.life <= 0) {
        // 到期爆炸（nova 类）
        if (pr.novaR > 0 && !pr.dead) {
          Combat.explode(w, pr.x, pr.y, pr.novaR, pr.dmg * 0.65, { color: pr.color, slow: pr.slow });
          w.addEffect({ type: 'ring', x: pr.x, y: pr.y, r0: 6, r1: pr.novaR, life: 0.3, color: pr.color });
        }
        pr.dead = true;
      }

      if (pr.dead) U.swapRemove(list, i);
    }
  };

  /* ---------------------------------------------------------
     范围伤害
     --------------------------------------------------------- */
  Combat.explode = function (w, x, y, radius, dmg, opt) {
    opt = opt || {};
    w.grid.query(x, y, radius, _buf2);
    for (let i = 0; i < _buf2.length; i++) {
      const e = _buf2[i];
      if (e.dead) continue;
      if (U.dist2(x, y, e.x, e.y) > (radius + e.r) * (radius + e.r)) continue;
      const crit = w.rng.chance(w.player.stats.crit);
      let d = dmg * (opt.mul || 1);
      if (crit) d *= w.player.stats.critMult;
      Combat.damageEnemy(w, e, d, {
        crit, color: opt.color, baseDmg: opt.baseDmg || dmg, knock: opt.knock || 80,
        noChain: opt.noChain, dot: opt.dot,
      });
      if (opt.slow) {
        e.slowAmt = Math.max(e.slowAmt || 0, opt.slow);
        e.slowUntil = w.time + 2.0;
      }
    }
    w.spawnBurst(x, y, radius, opt.color || '#ffaa55', Math.min(16, 4 + radius / 8));
  };

  /** 链式闪电 */
  Combat.chainLightning = function (w, from, dmg, jumps) {
    let cur = from;
    let d = dmg;
    const visited = new Set([from.id]);
    for (let j = 0; j < jumps; j++) {
      const next = w.grid.nearest(cur.x, cur.y, 200, (q) => !visited.has(q.id));
      if (!next) break;
      visited.add(next.id);
      w.addEffect({
        type: 'bolt', x: cur.x, y: cur.y, x2: next.x, y2: next.y,
        life: 0.16, color: '#8fe3ff', width: 2.5, jitter: 7,
      });
      const crit = w.rng.chance(w.player.stats.crit);
      let dd = d * (crit ? w.player.stats.critMult : 1);
      Combat.damageEnemy(w, next, dd, {
        crit, color: '#8fe3ff', baseDmg: d, knock: 20, noChain: true,
      });
      d *= 0.82;
      cur = next;
    }
  };

  /* ---------------------------------------------------------
     武器驱动
     --------------------------------------------------------- */
  const _orbitState = { ang: 0, hitCd: new Map() };

  Combat.updateWeapon = function (w, dt) {
    const p = w.player;
    const wpn = p.equip.weapon;
    if (!wpn || !wpn.atk) { p.orbitAng = (p.orbitAng || 0); return; }
    const atk = wpn.atk;
    const st = p.stats;
    const areaMul = st.area;

    // 环绕类武器：常驻，不走冷却
    if (atk.type === 'orbit') {
      this.updateOrbitWeapon(w, dt, atk, areaMul);
      return;
    }

    const cd = Math.max(0.06, (atk.cd / Combat.speedMult(p)) * (1 - Math.min(0.62, st.cdr)));
    p.atkTimer -= dt;
    if (p.atkTimer > 0) return;
    p.atkTimer = cd;

    const aim = p.aim;

    switch (atk.type) {
      case 'meleeArc': this.fireMelee(w, p, atk, areaMul, aim); break;
      case 'projectile': this.fireProjectiles(w, p, atk, areaMul, aim, false); break;
      case 'homing': this.fireProjectiles(w, p, atk, areaMul, aim, true); break;
      case 'nova': this.fireProjectiles(w, p, atk, areaMul, aim, false, true); break;
      case 'boomerang': this.fireBoomerang(w, p, atk, areaMul, aim); break;
      case 'cone': this.fireCone(w, p, atk, areaMul, aim); break;
      case 'chain': this.fireChain(w, p, atk, areaMul, aim); break;
      default: break;
    }
  };

  /* ---- 近战扇形 ---- */
  Combat.fireMelee = function (w, p, atk, areaMul, aim) {
    const range = atk.range * areaMul;
    const halfArc = (atk.arc * Math.PI) / 360;

    w.addEffect({
      type: 'slash', x: p.x, y: p.y, dir: aim, arc: halfArc * 2,
      r1: range, life: 0.19, color: atk.color || '#9fe4ff',
    });
    RG.Audio.slash();

    const hit = Combat.rollHit(w, p, atk.dmg);
    w.grid.query(p.x, p.y, range, _buf);

    let hits = 0;
    for (let i = 0; i < _buf.length; i++) {
      const e = _buf[i];
      if (e.dead) continue;
      if (!U.inCone(e.x, e.y, p.x, p.y, aim, halfArc, range + e.r)) continue;
      const c = w.rng.chance(p.stats.crit);
      let d = atk.dmg * Combat.damageMult(p) * (c ? p.stats.critMult : 1);
      Combat.damageEnemy(w, e, d, {
        crit: c, color: atk.color, baseDmg: atk.dmg, knock: atk.knock || 120,
      });
      hits++;
    }

    // 战锤：命中后前方震荡
    if (atk.aoe && hits > 0) {
      const ex = p.x + Math.cos(aim) * range * 0.7;
      const ey = p.y + Math.sin(aim) * range * 0.7;
      Combat.explode(w, ex, ey, atk.aoe * areaMul, atk.dmg * 0.55, {
        color: atk.color, baseDmg: atk.dmg, knock: 200,
      });
      w.addEffect({ type: 'ring', x: ex, y: ey, r0: 4, r1: atk.aoe * areaMul, life: 0.3, color: atk.color });
      w.shake(atk.shake || 0);
    }
  };

  /* ---- 投射物（直线 / 追踪 / 霜核） ---- */
  Combat.fireProjectiles = function (w, p, atk, areaMul, aim, homing, isNova) {
    const st = p.stats;
    let count = (atk.count || 1) + (p.mods.multiShot || 0);
    const pierce = (atk.pierce || 0) + (p.mods.pierceBonus || 0);
    const spread = atk.spread || 0;
    const total = Math.max(spread, (count - 1) * 0.14);

    RG.Audio[homing ? 'magic' : 'shoot']();

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * total * 2;
      const ang = aim + t;
      const crit = w.rng.chance(st.crit);
      let d = atk.dmg * Combat.damageMult(p) * (crit ? st.critMult : 1);
      Combat.spawnProjectile(w, {
        x: p.x + Math.cos(ang) * 14,
        y: p.y + Math.sin(ang) * 14,
        ang,
        speed: atk.speed,
        dmg: d,
        pierce,
        life: atk.life || 1.5,
        size: (atk.size || 5) * Math.sqrt(areaMul),
        color: atk.color,
        kind: homing ? 'homing' : isNova ? 'nova' : 'bolt',
        homing: homing ? atk.turn || 5 : 0,
        trail: atk.trail,
        novaR: isNova ? atk.aoe * areaMul : 0,
        slow: atk.slow || 0,
      });
    }
  };

  /* ---- 回旋镖 ---- */
  Combat.fireBoomerang = function (w, p, atk, areaMul, aim) {
    RG.Audio.shoot();
    const count = (atk.count || 1) + (p.mods.multiShot || 0);
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : (i / (count - 1) - 0.5) * 1.0;
      const ang = aim + off;
      Combat.spawnProjectile(w, {
        x: p.x, y: p.y, ang, speed: atk.speed,
        dmg: atk.dmg * Combat.damageMult(p) * p.stats.damage,
        pierce: 99, life: 3.0, size: 9, color: atk.color,
        kind: 'boomerang',
        boomerang: { traveled: 0, dist: atk.dist * areaMul, back: false },
      });
    }
  };

  /* ---- 锥形持续（火焰喷射） ---- */
  Combat.fireCone = function (w, p, atk, areaMul, aim) {
    const range = atk.range * areaMul;
    const halfArc = (atk.arc * Math.PI) / 360;
    w.grid.query(p.x, p.y, range, _buf);

    for (let i = 0; i < _buf.length; i++) {
      const e = _buf[i];
      if (e.dead) continue;
      if (!U.inCone(e.x, e.y, p.x, p.y, aim, halfArc, range + e.r)) continue;
      const crit = w.rng.chance(p.stats.crit);
      let d = atk.dmg * Combat.damageMult(p) * (crit ? p.stats.critMult : 1);
      Combat.damageEnemy(w, e, d, {
        crit, color: atk.color, baseDmg: atk.dmg * 2.4, knock: 8, noText: false,
      });
    }

    // 火焰粒子
    for (let i = 0; i < 5; i++) {
      const a = aim + w.rng.float(-halfArc, halfArc);
      const sp = w.rng.float(240, 420);
      w.addParticle(
        p.x + Math.cos(aim) * 16, p.y + Math.sin(aim) * 16,
        Math.cos(a) * sp, Math.sin(a) * sp,
        w.rng.float(7, 14), w.rng.chance(0.4) ? '#ffe08a' : atk.color,
        w.rng.float(0.18, 0.34), 3.2, true
      );
    }
  };

  /* ---- 链式闪电 ---- */
  Combat.fireChain = function (w, p, atk, areaMul, aim) {
    const range = atk.range * areaMul;
    // 优先打瞄准方向前方锥形内的最近敌人
    const target = w.grid.nearest(
      p.x + Math.cos(aim) * 40, p.y + Math.sin(aim) * 40, range
    ) || w.grid.nearest(p.x, p.y, range);
    if (!target) return;

    RG.Audio.magic();
    w.addEffect({
      type: 'bolt', x: p.x, y: p.y, x2: target.x, y2: target.y,
      life: 0.18, color: atk.color, width: 3.5, jitter: 9,
    });
    const crit = w.rng.chance(p.stats.crit);
    let d = atk.dmg * Combat.damageMult(p) * (crit ? p.stats.critMult : 1);
    Combat.damageEnemy(w, target, d, {
      crit, color: atk.color, baseDmg: atk.dmg, knock: 40, noChain: true,
    });

    // 跳跃
    let cur = target;
    let dd = atk.dmg * Combat.damageMult(p) * (atk.falloff || 0.8);
    const jumps = (atk.jumps || 0) + (p.mods.chainBonus || 0);
    const visited = new Set([target.id]);
    for (let j = 0; j < jumps; j++) {
      const nx = w.grid.nearest(cur.x, cur.y, atk.jumpRange, (q) => !visited.has(q.id));
      if (!nx) break;
      visited.add(nx.id);
      w.addEffect({
        type: 'bolt', x: cur.x, y: cur.y, x2: nx.x, y2: nx.y,
        life: 0.15, color: atk.color, width: 2.5, jitter: 7,
      });
      const c2 = w.rng.chance(p.stats.crit);
      Combat.damageEnemy(w, nx, dd * (c2 ? p.stats.critMult : 1), {
        crit: c2, color: atk.color, baseDmg: dd, knock: 20, noChain: true,
      });
      dd *= atk.falloff || 0.8;
      cur = nx;
    }
  };

  /* ---- 环绕刀刃 ---- */
  Combat.updateOrbitWeapon = function (w, dt, atk, areaMul) {
    const p = w.player;
    const n = atk.count + (p.mods.multiShot || 0);
    const radius = atk.radius * areaMul;
    p.orbitAng = (p.orbitAng || 0) + atk.spin * dt * Combat.speedMult(p) * 0.5;

    // 每个敌人有自己的受击冷却，避免每帧狂扣血
    const cdMap = w.orbitHitCd || (w.orbitHitCd = new Map());
    const now = w.time;

    for (let i = 0; i < n; i++) {
      const a = p.orbitAng + (i / n) * U.TAU;
      const bx = p.x + Math.cos(a) * radius;
      const by = p.y + Math.sin(a) * radius;

      w.grid.query(bx, by, atk.size + 8, _buf);
      for (let k = 0; k < _buf.length; k++) {
        const e = _buf[k];
        if (e.dead) continue;
        if (!U.circleHit(bx, by, atk.size, e.x, e.y, e.r)) continue;
        const key = e.id;
        const last = cdMap.get(key) || 0;
        if (now - last < atk.tick) continue;
        cdMap.set(key, now);
        const crit = w.rng.chance(p.stats.crit);
        Combat.damageEnemy(w, e, atk.dmg * Combat.damageMult(p) * (crit ? p.stats.critMult : 1), {
          crit, color: atk.color, baseDmg: atk.dmg, knock: 30,
        });
      }
    }
    p.orbitBlades = n;
    p.orbitRadius = radius;
  };

  /* ---------------------------------------------------------
     敌方子弹
     --------------------------------------------------------- */
  Combat.updateEnemyBullets = function (w, dt) {
    const p = w.player;
    const list = w.enemyBullets;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (w.rng.chance(0.3)) w.addParticle(b.x, b.y, 0, 0, 3, b.color, 0.2, 0);
      if (U.circleHit(b.x, b.y, b.r, p.x, p.y, p.r)) {
        w.damagePlayer(b.dmg, 'bullet');
        b.dead = true;
      }
      if (b.life <= 0) b.dead = true;
      if (b.dead) U.swapRemove(list, i);
    }
  };

  /* ---------------------------------------------------------
     羁绊定时技 / 持续伤害结算
     --------------------------------------------------------- */
  Combat.updateTimers = function (w, dt) {
    const p = w.player;
    const mods = p.mods || {};

    // 冰霜新星
    if (mods.frostNova) {
      p.frostNovaT = (p.frostNovaT || 0) - dt;
      if (p.frostNovaT <= 0) {
        p.frostNovaT = mods.frostNova;
        const R = 190 * p.stats.area;
        w.addEffect({ type: 'ring', x: p.x, y: p.y, r0: 10, r1: R, life: 0.45, color: '#8fe6ff' });
        Combat.explode(w, p.x, p.y, R, 12 * Combat.damageMult(p), {
          color: '#8fe6ff', slow: 0.6, noChain: true,
        });
        RG.Audio.magic();
      }
    }

    // 天雷
    if (mods.thunder) {
      p.thunderT = (p.thunderT || 0) - dt;
      if (p.thunderT <= 0) {
        p.thunderT = mods.thunder;
        const t = w.grid.nearest(p.x, p.y, 420);
        if (t) {
          w.addEffect({ type: 'bolt', x: t.x + 40, y: t.y - 340, x2: t.x, y2: t.y, life: 0.28, color: '#bff2ff', width: 5, jitter: 12 });
          Combat.explode(w, t.x, t.y, 90, 40 * Combat.damageMult(p), { color: '#bff2ff' });
          w.shake(4);
          RG.Audio.explode();
        }
      }
    }

    // 龙息新星
    if (mods.dragonNova) {
      p.dragonT = (p.dragonT || 0) - dt;
      if (p.dragonT <= 0) {
        p.dragonT = mods.dragonNova;
        const R = 210 * p.stats.area;
        const mul = mods.dragonNovaMul || 1;
        w.addEffect({ type: 'ring', x: p.x, y: p.y, r0: 12, r1: R, life: 0.5, color: '#ffc861' });
        w.addEffect({ type: 'flare', x: p.x, y: p.y, r1: R * 0.7, life: 0.45, color: '#ff8a3d' });
        Combat.explode(w, p.x, p.y, R, 34 * mul * Combat.damageMult(p), {
          color: '#ffc861', knock: 260, noChain: true,
        });
        w.shake(6);
        RG.Audio.explode();
      }
    }

    // 圣徒被动
    if (p.passive && p.passive.id === 'blessing') {
      p.blessT = (p.blessT || 0) - dt;
      if (p.blessT <= 0) {
        p.blessT = p.passive.interval;
        const heal = p.stats.maxHp * p.passive.healPct;
        if (p.hp < p.stats.maxHp) {
          p.hp = Math.min(p.stats.maxHp, p.hp + heal);
          w.addText(p.x, p.y - 30, '+' + Math.round(heal), '#3ddc84', 13);
          w.addEffect({ type: 'ring', x: p.x, y: p.y, r0: 8, r1: 60, life: 0.4, color: '#3ddc84' });
        }
      }
    }

    // 持续伤害（灼烧）
    const enemies = w.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || !e.burn || !e.burn.length) continue;
      let total = 0;
      for (let b = e.burn.length - 1; b >= 0; b--) {
        if (w.time > e.burn[b].until) { e.burn.splice(b, 1); continue; }
        total += e.burn[b].dps;
      }
      if (total > 0) {
        e.hp -= total * dt;
        if (w.rng.chance(0.12)) w.addParticle(e.x, e.y, w.rng.float(-20, 20), -w.rng.float(20, 50), w.rng.float(3, 6), '#ff8a3d', 0.3, 1);
        if (e.hp <= 0) w.onEnemyKilled(e, { element: 'fire' });
      }
    }
  };

  /* ---------------------------------------------------------
     反伤 / 受击触发
     --------------------------------------------------------- */
  Combat.onPlayerHit = function (w, attacker, dmgTaken) {
    const p = w.player;
    const mods = p.mods || {};

    if (p.stats.thorns > 0 && attacker && !attacker.dead) {
      Combat.damageEnemy(w, attacker, p.stats.thorns, {
        noText: false, color: '#7ddc9a', noChain: true, noExecute: true, knock: 40,
      });
    }

    if (mods.thornBurst && attacker) {
      const R = 110 * (mods.thornBurst > 1 ? 2 : 1);
      w.addEffect({ type: 'ring', x: p.x, y: p.y, r0: 10, r1: R, life: 0.3, color: '#7ddc9a' });
      Combat.explode(w, p.x, p.y, R, p.stats.thorns * 0.8, { color: '#7ddc9a', noChain: true });
    }

    if (mods.retaliate) {
      const R = 150;
      w.addEffect({ type: 'ring', x: p.x, y: p.y, r0: 10, r1: R, life: 0.3, color: '#ff5c78' });
      Combat.explode(w, p.x, p.y, R, 30 * Combat.damageMult(p), { color: '#ff5c78', noChain: true });
    }
  };
})(window);
