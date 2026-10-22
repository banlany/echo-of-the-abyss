/* ==========================================================
   ui.js — DOM 界面层
   ----------------------------------------------------------
   只读 world 状态，不修改模拟；所有操作通过 world 的方法
   （choosePerk / buyShopItem / equipFromBag ...）触发。

   背包规则（本层只负责展示与交互）：
     · 武器 / 防具 → 必须放在佩戴位才生效
     · 饰品 → 放在背包里即生效
     · 背包满时不再拾取，掉落物留在地上
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});
  const U = RG.U;
  const $ = (id) => document.getElementById(id);

  /* ---------------- 属性格式化 ---------------- */
  const STAT_FMT = {
    maxHp: { name: '生命', pct: false },
    armor: { name: '护甲', pct: false },
    damage: { name: '伤害', pct: true },
    attackSpeed: { name: '攻速', pct: true },
    moveSpeed: { name: '移速', pct: true },
    crit: { name: '暴击率', pct: true },
    critMult: { name: '暴击伤害', pct: true },
    cdr: { name: '冷却缩减', pct: true },
    area: { name: '技能范围', pct: true },
    pickup: { name: '拾取范围', pct: true },
    luck: { name: '幸运', pct: false },
    regen: { name: '生命回复', pct: false, dec: 1 },
    thorns: { name: '反伤', pct: false },
    xpGain: { name: '经验获取', pct: true },
    goldGain: { name: '金币获取', pct: true },
    lifesteal: { name: '生命偷取', pct: true, dec: 2 },
  };

  function fmtStat(k, v) {
    const f = STAT_FMT[k];
    if (!f) return null;
    const sign = v >= 0 ? '+' : '−';
    const av = Math.abs(v);
    let val;
    if (f.pct) {
      const pv = av * 100;
      val = (pv >= 10 ? Math.round(pv) : pv.toFixed(1).replace(/\.0$/, '')) + '%';
    } else if (f.dec) {
      val = av.toFixed(f.dec);
    } else {
      val = Math.round(av);
    }
    return sign + val + ' ' + f.name;
  }

  const SLOT_NAME = { weapon: '武器', armor: '防具', trinket: '饰品' };

  /* ========================================================== */
  class UI {
    constructor(game) {
      this.g = game;
      this.selectedChar = 'rayn';
      this.perkRerollCost = 25;
      this._hudAcc = 0;
      this._wornKey = '';
      this._bondKey = '';
      this._toastT = 0;
      this.bagReturn = 'combat';

      this.el = {
        hud: $('hud'),
        screenTitle: $('screen-title'),
        screenLevel: $('screen-levelup'),
        screenShop: $('screen-shop'),
        screenBag: $('screen-bag'),
        screenPause: $('screen-pause'),
        screenDeath: $('screen-death'),

        hpFill: $('hpFill'), hpText: $('hpText'),
        xpFill: $('xpFill'), xpText: $('xpText'),
        waveNum: $('waveNum'), waveTimer: $('waveTimer'), killNum: $('killNum'),
        goldNum: $('goldNum'),
        wornBar: $('wornBar'), bondBar: $('bondBar'),
        statList: $('statList'), dashFill: $('dashFill'),
        avatarGlyph: $('avatarGlyph'),
        bagToggle: $('bagToggle'), bagCount: $('bagCount'),

        charSelect: $('charSelect'),
        perkCards: $('perkCards'), lvlBadge: $('lvlBadge'),
        perkRerollCost: $('perkRerollCost'),

        shopGrid: $('shopGrid'),
        shopWave: $('shopWave'), nextWaveNum: $('nextWaveNum'),
        shopRerollCost: $('shopRerollCost'), healCost: $('healCost'),
        shopWornBar: $('shopWornBar'), shopBagGrid: $('shopBagGrid'),
        shopBagCount: $('shopBagCount'), shopBondBar: $('shopBondBar'),

        bagWornBar: $('bagWornBar'), bagGrid: $('bagGrid'),
        bagBondBar: $('bagBondBar'), bagCount2: $('bagCount2'),
        wornTip: $('wornTip'),

        deathSub: $('deathSub'), deathStats: $('deathStats'),
        pauseStats: $('pauseStats'),
        toast: $('tipToast'),
      };

      this.initTooltip();
      this.buildCharSelect();
      this.bindStatic();
    }

    /* ---------------- 角色选择 ---------------- */
    buildCharSelect() {
      const box = this.el.charSelect;
      box.innerHTML = '';
      RG.CHARACTERS.forEach((c) => {
        const d = document.createElement('div');
        d.className = 'char-card' + (c.id === this.selectedChar ? ' selected' : '');
        d.dataset.id = c.id;

        const stats = c.radar
          .map((v, i) => `<div class="cc-stat"><span class="k">${RG.RADAR_LABELS[i]}</span>
              <span class="track"><i style="width:${v * 10}%"></i></span></div>`)
          .join('');

        d.innerHTML = `
          <div class="cc-glyph" style="background:linear-gradient(150deg,${c.color},${this.shade(c.color, -0.5)})">${c.glyph}</div>
          <div class="cc-name">${c.name}</div>
          <div class="cc-title">${c.title}</div>
          <div class="cc-perk"><b style="color:${this.shade(c.color, -0.28)}">${c.passive.name}</b><br>${c.passive.text.replace(/<\/?em>/g, '')}</div>
          <div class="cc-stats">${stats}</div>
        `;
        d.addEventListener('click', () => {
          this.selectedChar = c.id;
          box.querySelectorAll('.char-card').forEach((n) => n.classList.remove('selected'));
          d.classList.add('selected');
          RG.Audio.init();
          RG.Audio.resume();
          RG.Audio.pickup();
        });
        box.appendChild(d);
      });
    }

    shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const f = amt < 0 ? 1 + amt : 1;
      r = Math.round(Math.min(255, Math.max(0, r * f)));
      g = Math.round(Math.min(255, Math.max(0, g * f)));
      b = Math.round(Math.min(255, Math.max(0, b * f)));
      return `rgb(${r},${g},${b})`;
    }

    /* ---------------- 静态事件 ---------------- */
    bindStatic() {
      $('btnStart').addEventListener('click', () => {
        RG.Audio.init();
        RG.Audio.resume();
        this.g.start(this.selectedChar);
      });

      $('btnRerollPerk').addEventListener('click', () => {
        const w = this.g.world;
        if (!w) return;
        if (w.player.gold >= this.perkRerollCost) {
          w.rerollPerks(this.perkRerollCost);
          RG.Audio.buy();
        } else {
          RG.Audio.deny();
          this.toast('金币不足', 'bad');
        }
      });

      $('btnRerollShop').addEventListener('click', () => {
        const w = this.g.world;
        if (!w) return;
        if (w.rerollShop()) { this.renderShop(); this.toast('货架已刷新', 'good'); }
        else this.toast('金币不足', 'bad');
      });

      $('btnHeal').addEventListener('click', () => {
        const w = this.g.world;
        if (!w) return;
        if (w.buyHeal()) { this.renderShop(); this.toast('生命已恢复', 'good'); }
        else this.toast('金币不足', 'bad');
      });

      $('btnNextWave').addEventListener('click', () => {
        const w = this.g.world;
        if (!w) return;
        w.nextWave();
        this.hideAll();
        this.el.hud.classList.remove('hidden');
        RG.Audio.wave();
      });

      $('btnResume').addEventListener('click', () => this.g.resume());
      $('btnQuit').addEventListener('click', () => this.g.quit());
      $('btnRestart').addEventListener('click', () => this.g.backToTitle());

      // 背包
      this.el.bagToggle.addEventListener('click', () => this.openBag('combat'));
      $('btnShopBag').addEventListener('click', () => this.openBag('shop'));
      $('btnOpenBag2').addEventListener('click', () => this.openBag('pause'));
      $('btnCloseBag').addEventListener('click', () => this.closeBag());

      this.el.bagGrid.addEventListener('click', (e) => this.onBagClick(e, 'bag'));
      this.el.shopBagGrid.addEventListener('click', (e) => this.onBagClick(e, 'shop'));
    }

    /* ---------------- 背包开合 ---------------- */
    openBag(from) {
      const w = this.g.world;
      if (!w || w.phase === 'dead') return;
      this.bagReturn = from || 'combat';
      if (w.phase === 'combat') w.paused = true;
      this.renderBag();
      this.showScreen('screenBag');
    }

    closeBag() {
      const w = this.g.world;
      if (!w) return;
      if (this.bagReturn === 'shop' && w.phase === 'shop') {
        this.renderShop();
        this.showScreen('screenShop');
        return;
      }
      if (this.bagReturn === 'pause' && w.phase === 'combat') {
        this.g.pause();
        return;
      }
      if (w.phase === 'combat') {
        w.paused = false;
        this.hideAll();
        this.el.hud.classList.remove('hidden');
        this.updateHUD(w);
      } else {
        this.hideAll();
        this.el.hud.classList.remove('hidden');
      }
    }

    onBagClick(e, where) {
      const w = this.g.world;
      if (!w) return;
      const cell = e.target.closest('.bag-cell');
      if (!cell) return;
      const idx = Number(cell.dataset.idx);
      if (Number.isNaN(idx)) return;
      const item = w.player.bag[idx];
      if (!item) return;

      if (e.target.closest('.cell-drop')) {
        e.stopPropagation();
        w.dropFromBag(idx);
        this.afterBagChange(where);
        return;
      }

      if (item.slot === 'weapon' || item.slot === 'armor') {
        w.equipFromBag(idx);
        this.afterBagChange(where);
        this.toast(`已换上 ${item.name}`, 'good');
      } else {
        this.toast('饰品在行囊中已生效', 'gold');
      }
    }

    afterBagChange(where) {
      const w = this.g.world;
      if (!w) return;
      this._hudAcc = 1;
      this._wornKey = '';
      this._bondKey = '';
      if (where === 'shop') this.renderShop();
      else this.renderBag();
    }

    /* ---------------- Tooltip ---------------- */
    initTooltip() {
      this.tip = document.createElement('div');
      this.tip.className = 'rg-tip hidden';
      document.body.appendChild(this.tip);
    }

    showTip(html, ev) {
      this.tip.innerHTML = html;
      this.tip.classList.remove('hidden');
      this.moveTip(ev);
    }

    moveTip(ev) {
      if (!ev) return;
      const pad = 14;
      const r = this.tip.getBoundingClientRect();
      let x = ev.clientX + pad;
      let y = ev.clientY + pad;
      if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
      if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
      this.tip.style.left = Math.max(8, x) + 'px';
      this.tip.style.top = Math.max(8, y) + 'px';
    }

    hideTip() { this.tip.classList.add('hidden'); }

    itemTipHTML(item, compareWith) {
      if (!item) return '';
      const rar = RG.RARITY[item.rarity];
      const bond = RG.BOND_MAP[item.tag];
      const lines = [];

      for (const k in item.inherent) {
        const s = fmtStat(k, item.inherent[k]);
        if (s) lines.push(`<div class="tt-line">${s}</div>`);
      }
      item.affixes.forEach((a) => lines.push(`<div class="tt-line affix">${a.text}</div>`));

      let cmp = '';
      if (compareWith) {
        const d = RG.itemScore(item) - RG.itemScore(compareWith);
        const pct = Math.round((RG.itemScore(item) / Math.max(1, RG.itemScore(compareWith)) - 1) * 100);
        cmp = `<div class="tt-cmp ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ 更强' : d < 0 ? '▼ 更弱' : '＝ 持平'}  ${pct > 0 ? '+' : ''}${pct}%</div>`;
      }

      const slotText = item.slot === 'trinket'
        ? '饰品 · 置于行囊即生效'
        : SLOT_NAME[item.slot] + ' · 需佩戴';

      return `
        <div class="tt-head" style="color:${rar.color}">${item.name}</div>
        <div class="tt-sub">${rar.name} · ${slotText}${bond ? ' · ' + bond.name : ''}</div>
        <div class="tt-stats">${lines.join('')}</div>
        ${item.desc ? `<div class="tt-desc">${item.desc}</div>` : ''}
        ${cmp}
      `;
    }

    bindTooltip(el, getItem, getCompare) {
      el.addEventListener('mouseenter', (ev) => {
        const it = getItem();
        if (!it) return;
        this.showTip(this.itemTipHTML(it, getCompare ? getCompare() : null), ev);
      });
      el.addEventListener('mousemove', (ev) => this.moveTip(ev));
      el.addEventListener('mouseleave', () => this.hideTip());
    }

    /* ---------------- 屏幕切换 ---------------- */
    setAvatar(ch) {
      if (!ch) return;
      const box = this.el.avatarGlyph.parentElement;
      this.el.avatarGlyph.textContent = ch.glyph;
      box.style.background = `linear-gradient(150deg, ${this.shade(ch.color, -0.3)}, ${this.shade(ch.color, -0.7)})`;
    }

    hideAll() {
      ['screenTitle', 'screenLevel', 'screenShop', 'screenBag', 'screenPause', 'screenDeath']
        .forEach((k) => this.el[k].classList.remove('show'));
      this.hideTip();
    }

    showScreen(key) {
      this.hideAll();
      this.el[key].classList.add('show');
    }

    /* ---------------- HUD ---------------- */
    update(dt) {
      const w = this.g.world;
      if (!w) return;
      this.pollEvents(w);

      if (w.phase === 'combat' && !w.paused) {
        this._hudAcc += dt;
        if (this._hudAcc > 0.05) {
          this._hudAcc = 0;
          this.updateHUD(w);
        }
      }
    }

    updateHUD(w) {
      const p = w.player;
      const hpR = U.clamp(p.hp / p.stats.maxHp, 0, 1);
      this.el.hpFill.style.width = (hpR * 100).toFixed(1) + '%';
      this.el.hpText.textContent = `${Math.ceil(Math.min(p.hp, p.stats.maxHp))} / ${p.stats.maxHp}`;

      const xpR = U.clamp(p.xp / p.xpNext, 0, 1);
      this.el.xpFill.style.width = (xpR * 100).toFixed(1) + '%';
      this.el.xpText.textContent = `Lv.${p.level}`;

      this.el.waveNum.textContent = w.wave;
      const t = Math.max(0, w.waveTime);
      this.el.waveTimer.textContent = t.toFixed(1);
      this.el.waveTimer.classList.toggle('urgent', t < 10);
      this.el.killNum.textContent = U.nf(w.kills);
      this.el.goldNum.textContent = U.nf(p.gold);

      const dashMax = 1.35;
      this.el.dashFill.style.height = (U.clamp(1 - p.dashCd / dashMax, 0, 1) * 100) + '%';

      const st = p.stats;
      this.el.statList.innerHTML =
        `<div>伤害 <i>+${Math.round((RG.Combat.damageMult(p) - 1) * 100)}%</i></div>` +
        `<div>攻速 <i>+${Math.round(st.attackSpeed * 100)}%</i></div>` +
        `<div>暴击 <i>${Math.round(st.crit * 100)}%</i></div>` +
        `<div>护甲 <i>${Math.round(st.armor)}</i></div>` +
        `<div>移速 <i>${Math.round(st.moveSpeed)}</i></div>`;

      const used = w.bagUsed();
      this.el.bagCount.textContent = `${used}/12`;
      this.el.bagToggle.classList.toggle('full', used >= 12);

      this.updateWorn(w);
      this.updateBondBar(w);
    }

    wornKey(w) {
      const e = w.player.equip;
      return (e.weapon ? e.weapon.uid : 0) + ',' + (e.armor ? e.armor.uid : 0);
    }

    updateWorn(w) {
      const key = this.wornKey(w);
      if (key === this._wornKey) return;
      this._wornKey = key;
      this.renderWornBar(this.el.wornBar, w, 'hud');
    }

    /** 佩戴位：hud（小格） / mini（商店） / big（背包详情卡） */
    renderWornBar(container, w, mode) {
      if (!container) return;
      const e = w.player.equip;
      const slots = ['weapon', 'armor'];
      container.innerHTML = '';

      slots.forEach((s) => {
        const it = e[s];
        const d = document.createElement('div');
        d.className = 'worn-slot' + (it ? ' r-' + it.rarity : ' empty');

        if (mode === 'big') {
          d.innerHTML = it
            ? `${RG.pixel.img(it.icon)}
               <div class="ws-body">
                 <div class="ws-name" style="color:${it.color}">${it.name}</div>
                 <div class="ws-tag">${RG.RARITY[it.rarity].name} · ${SLOT_NAME[s]}位 · ${(RG.BOND_MAP[it.tag] || {}).name || ''}</div>
               </div>`
            : `${RG.pixel.img(s === 'weapon' ? 'sword' : 'armor')}
               <div class="ws-body"><div class="ws-empty">空置 · ${SLOT_NAME[s]}位</div></div>`;
        } else {
          d.innerHTML = it
            ? `${RG.pixel.img(it.icon)}`
            : `${RG.pixel.img(s === 'weapon' ? 'sword' : 'armor')}`;
          if (mode === 'hud') d.insertAdjacentHTML('beforeend', `<span class="slot-tag">${SLOT_NAME[s]}</span>`);
        }

        if (it) this.bindTooltip(d, () => it, null);
        container.appendChild(d);
      });
    }

    updateBondBar(w) {
      const bonds = w.player.bonds || [];
      const key = bonds.map((b) => b.bond.id + b.tier + b.count).join('|');
      if (key === this._bondKey) return;
      this._bondKey = key;
      this.renderBondBar(this.el.bondBar, w);
    }

    renderBondBar(container, w) {
      if (!container) return;
      const bonds = (w.player.bonds || []).slice();
      container.innerHTML = '';
      if (!bonds.length) return;

      bonds.forEach((b) => {
        const active = b.tier > 0;
        const need = b.nextNeed || (b.bond.tiers[0] && b.bond.tiers[0].need) || 2;
        const d = document.createElement('div');
        d.className = 'bond-chip' + (active ? ' active' : '');
        if (active) d.style.color = b.bond.color;
        d.innerHTML = `<span class="bdot" style="color:${b.bond.color}"></span>${b.bond.name} <b>${b.count}/${active ? (b.tier < 3 ? need : b.bond.tiers[2].need) : need}</b>`;

        const tierText = b.tier > 0
          ? b.bond.tiers.slice(0, b.tier).map((tt) => `· ${tt.text}`).join('<br>')
          : `未激活（还需 ${need - b.count} 件）`;

        d.addEventListener('mouseenter', (ev) => {
          this.showTip(
            `<div class="tt-head" style="color:${b.bond.color}">${b.bond.name} · ${b.count} 件</div>
             <div class="tt-desc">${b.bond.blurb}</div>
             <div class="tt-stats">${tierText}</div>`, ev);
        });
        d.addEventListener('mousemove', (ev) => this.moveTip(ev));
        d.addEventListener('mouseleave', () => this.hideTip());
        container.appendChild(d);
      });
    }

    /* ---------------- 背包渲染 ---------------- */
    renderBag() {
      const w = this.g.world;
      if (!w) return;
      this.renderWornBar(this.el.bagWornBar, w, 'big');
      this.renderBagGrid(this.el.bagGrid, w, 'full');
      this.renderBondBar(this.el.bagBondBar, w);
      this.el.bagCount2.textContent = `${w.bagUsed()} / 12`;
      this.el.wornTip.textContent = w.bagHasSpace()
        ? '点击行囊中的武器 / 护甲可换到佩戴位'
        : '行囊已满 —— 丢弃物品后才能拾取新的';
    }

    renderBagGrid(container, w, mode) {
      if (!container) return;
      const bag = w.player.bag;
      container.innerHTML = '';

      for (let i = 0; i < bag.length; i++) {
        const it = bag[i];
        const d = document.createElement('div');
        d.dataset.idx = i;

        if (!it) {
          d.className = 'bag-cell empty';
          d.innerHTML = `<span style="color:rgba(122,101,71,.4);font-size:14px">·</span>`;
        } else {
          const active = it.slot === 'trinket';
          d.className = 'bag-cell has r-' + it.rarity + (active ? ' on' : ' off');
          d.innerHTML =
            `${RG.pixel.img(it.icon)}` +
            (mode === 'full' ? `<span class="cell-drop" title="丢弃">✕</span>` : '');
          if (mode === 'full') {
            this.bindTooltip(d, () => it, () => {
              if (it.slot === 'weapon') return w.player.equip.weapon;
              if (it.slot === 'armor') return w.player.equip.armor;
              return null;
            });
          }
        }
        container.appendChild(d);
      }
    }

    /* ---------------- 事件轮询 ---------------- */
    pollEvents(w) {
      if (!w.events.length) return;
      const evs = w.events.splice(0, w.events.length);
      for (const ev of evs) {
        switch (ev.type) {
          case 'levelup':
            this.flash('rgba(140,47,28,.16)');
            this.showLevelUp(ev);
            break;
          case 'openShop':
            this.renderShop();
            this.showScreen('screenShop');
            break;
          case 'pickup':
            if (ev.newlyActive && ev.newlyActive.length) {
              const names = ev.newlyActive.map((b) => `${b.bond.name} ${b.tier}`).join('、');
              this.toast(`羁绊激活：${names}`, 'gold');
            } else if (ev.autoWorn) {
              this.toast(`自动佩戴 ${ev.item.name}`, 'good');
            }
            break;
          case 'equipSwap':
            if (ev.newlyActive && ev.newlyActive.length) {
              const names = ev.newlyActive.map((b) => `${b.bond.name} ${b.tier}`).join('、');
              this.toast(`羁绊激活：${names}`, 'gold');
            }
            break;
          case 'bagFull':
            this.toast('行囊已满 · 无法拾取', 'bad');
            break;
          case 'bagOverflow':
            this.toast(`行囊已满，${ev.count} 件装备折算 ◈${ev.gold}`, 'bad');
            break;
          case 'drop':
            this.toast(`丢弃 ${ev.item.name} · 回收 ◈${ev.refund}`, 'bad');
            break;
          case 'waveStart':
            this.showWaveBanner(ev.wave);
            break;
          case 'dead':
            this.showDeath(w);
            break;
          default:
            break;
        }
      }
    }

    /* ---------------- 升级 ---------------- */
    showLevelUp(ev) {
      const p = this.g.world.player;
      this.el.lvlBadge.textContent = ev.level;
      this.el.perkRerollCost.textContent = this.perkRerollCost;

      const box = this.el.perkCards;
      box.innerHTML = '';

      ev.choices.forEach((perk) => {
        const tier = RG.PERK_TIERS[perk.tier];
        const lv = p.perkCounts[perk.id] || 0;
        const card = document.createElement('div');
        card.className = 'perk-card';
        card.style.setProperty('--rc', tier.color);
        card.innerHTML = `
          <div class="perk-stack">${lv > 0 ? lv + ' / ' + perk.max : '新'}</div>
          <div class="perk-icon">${perk.icon}</div>
          <div class="perk-name">${perk.name}</div>
          <div class="perk-tier">${tier.name}</div>
          <div class="perk-desc">${perk.desc}</div>
        `;
        card.addEventListener('click', () => {
          RG.Audio.buy();
          this.hideAll();
          this.g.world.choosePerk(perk.id);
          if (this.g.world.phase === 'combat') {
            this.el.hud.classList.remove('hidden');
            this._wornKey = '';
            this._bondKey = '';
            this.updateHUD(this.g.world);
          }
        });
        box.appendChild(card);
      });

      this.showScreen('screenLevel');
    }

    /* ---------------- 商店 ---------------- */
    renderShop() {
      const w = this.g.world;
      const p = w.player;
      this.el.shopWave.textContent = w.wave;
      this.el.nextWaveNum.textContent = w.wave + 1;
      this.el.shopRerollCost.textContent = w.shop.rerollCost;
      this.el.healCost.textContent = w.shop.healCost;
      this.el.shopBagCount.textContent = `${w.bagUsed()}/12`;

      const grid = this.el.shopGrid;
      grid.innerHTML = '';

      w.shop.stock.forEach((entry, i) => {
        const it = entry.item;
        const rar = RG.RARITY[it.rarity];
        const bond = RG.BOND_MAP[it.tag];
        const afford = p.gold >= entry.price;
        const hasSpace = w.bagHasSpace();

        let cur = null;
        if (it.slot === 'weapon') cur = p.equip.weapon;
        else if (it.slot === 'armor') cur = p.equip.armor;
        else {
          let best = null;
          for (const b of p.bag) {
            if (b && b.slot === 'trinket' && (!best || RG.itemScore(b) > RG.itemScore(best))) best = b;
          }
          cur = best;
        }

        const lines = [];
        for (const k in it.inherent) {
          const s = fmtStat(k, it.inherent[k]);
          if (s) lines.push(`<div class="si-stat">${s}</div>`);
        }
        it.affixes.forEach((a) => lines.push(`<div class="si-stat affix">${a.text}</div>`));

        const d = document.createElement('div');
        d.className = 'shop-item' + (entry.sold ? ' sold' : (afford && hasSpace) ? '' : ' cant');
        d.style.setProperty('--rc', rar.color);
        d.innerHTML = `
          <div class="si-icon">${RG.pixel.img(it.icon)}</div>
          <div class="si-body">
            <div class="si-name" style="color:${rar.color}">${it.name}</div>
            <div class="si-meta">${rar.name} · ${SLOT_NAME[it.slot]}${bond ? ' · ' + bond.name : ''}</div>
            <div class="si-stats">${lines.join('')}</div>
          </div>
          <div class="si-price ${afford ? '' : 'no'}"><span class="coin">◈</span>${entry.price}</div>
          <div class="si-buy-hint">${entry.sold ? '已售出' : hasSpace ? '点击购买' : '行囊已满'}</div>
        `;

        if (!entry.sold) {
          this.bindTooltip(d, () => it, () => cur);
          d.addEventListener('click', () => {
            const r = w.buyShopItem(i);
            if (r === true) {
              this.renderShop();
              this._wornKey = '';
              this._bondKey = '';
              this.toast('已收入行囊 · ' + it.name, 'good');
            } else if (r === 'bag') {
              RG.Audio.deny();
              this.toast('行囊已满', 'bad');
            } else {
              RG.Audio.deny();
              this.toast('金币不足', 'bad');
            }
          });
        }
        grid.appendChild(d);
      });

      this.renderWornBar(this.el.shopWornBar, w, 'mini');
      this.renderBagGrid(this.el.shopBagGrid, w, 'mini');
      this.renderBondBar(this.el.shopBondBar, w);
    }

    /* ---------------- 死亡 / 暂停 ---------------- */
    showDeath(w) {
      const p = w.player;
      this.el.deathSub.textContent = `你坚持到了第 ${w.wave} 波 · 存活 ${U.clock(w.runTime)}`;
      this.el.deathStats.innerHTML = `
        <div class="stat-cell"><div class="sk">到达波次</div><div class="sv">${w.wave}</div></div>
        <div class="stat-cell"><div class="sk">总击杀</div><div class="sv">${U.nf(w.kills)}</div></div>
        <div class="stat-cell"><div class="sk">角色等级</div><div class="sv">${p.level}</div></div>
        <div class="stat-cell"><div class="sk">拾取金币</div><div class="sv">${U.nf(w.totalGold)}</div></div>
      `;
      this.showScreen('screenDeath');
    }

    showPause(w) {
      const p = w.player;
      const st = p.stats;
      this.el.pauseStats.innerHTML = `
        <div class="stat-cell"><div class="sk">波次</div><div class="sv">${w.wave}</div></div>
        <div class="stat-cell"><div class="sk">击杀</div><div class="sv">${U.nf(w.kills)}</div></div>
        <div class="stat-cell"><div class="sk">等级</div><div class="sv">${p.level}</div></div>
        <div class="stat-cell"><div class="sk">金币</div><div class="sv">${U.nf(p.gold)}</div></div>
        <div class="stat-cell"><div class="sk">最大生命</div><div class="sv">${st.maxHp}</div></div>
        <div class="stat-cell"><div class="sk">护甲</div><div class="sv">${Math.round(st.armor)}</div></div>
      `;
      this.showScreen('screenPause');
    }

    /* ---------------- 波次横幅 / 闪印 ---------------- */
    showWaveBanner(wave) {
      const app = $('app');
      const old = app.querySelector('.wave-banner');
      if (old) old.remove();
      const d = document.createElement('div');
      d.className = 'wave-banner';
      d.innerHTML = `<div class="wb-num">WAVE ${wave}</div><div class="wb-sub">深渊涌来</div>`;
      app.appendChild(d);
      setTimeout(() => d.remove(), 2300);
    }

    flash(color) {
      const app = $('app');
      const d = document.createElement('div');
      d.className = 'flash-layer';
      d.style.background = `radial-gradient(circle at 50% 50%, ${color}, transparent 70%)`;
      app.appendChild(d);
      setTimeout(() => d.remove(), 500);
    }

    /* ---------------- Toast ---------------- */
    toast(text, kind) {
      const t = this.el.toast;
      t.textContent = text;
      t.className = 'toast show ' + (kind || '');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => {
        t.className = 'toast ' + (kind || '');
      }, 1900);
    }
  }

  RG.UI = UI;
})(window);
