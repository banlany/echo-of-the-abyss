/* ==========================================================
   net.js — 联机架构骨架（本期不启用，仅为未来预留）
   ----------------------------------------------------------
   ## 为什么这样切分
   rg/sim 下的 World 是"纯模拟"：不读 DOM、不读鼠标、不碰
   Canvas，全部随机都来自 world.rng。因此同一份 sim 代码
   可以原样跑在浏览器、Node 服务端或 Web Worker 里。

   ## 联机模型选择：服务器权威 + 客户端预测
   割草游戏实体多、节奏快，如果做 lockstep（帧同步），
   任何一次丢包都会让全场卡住；而回滚（rollback）对几百个
   浮点实体的状态保存成本太高。因此推荐：

     客户端                         服务端
     ──────                        ────────
     采集输入(方向/冲刺/选卡) ──►   权威 World.step(1/60)
     本地立即预测移动               生成快照(20Hz)
     ◄── 快照(位置/血量/敌人状态)   广播给房间内所有玩家
     误差 > 阈值 → 平滑纠正

   掉落、词条 roll、商店货架这类随机全部由服务端用
   `world.rng` 生成，客户端只负责展示，天然防作弊。

   ## 关键约束（写代码时就要守住）
   1. sim 层禁止出现 Math.random()、Date.now()、DOM 访问
   2. 任何"随机"都从 world.rng 派生，种子由服务端下发
   3. 输入必须离散化（方向 → 8 向或 -1/0/1 三值），
      否则浮点误差会让两端结果漂移
   4. 实体一律用递增 id 而不是对象引用跨网络传输
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});
  const U = RG.U;

  const MSG = {
    HELLO: 'hello',
    WELCOME: 'welcome',       // { playerId, seed, tick, roomState }
    INPUT: 'input',           // { tick, dx, dy, dash, aim }
    SNAPSHOT: 'snapshot',     // World.snapshot()
    EVENT: 'event',           // 选卡 / 购买 / 升级 等离散事件
    PING: 'ping',
    PONG: 'pong',
  };

  /* ---------- 传输层抽象 ---------- */
  class Transport {
    send(msg) { throw new Error('not implemented'); }
    onMessage(fn) { this._h = fn; }
    close() {}
  }

  /** 单机模式下的零延迟传输：消息同步回环 */
  class LocalTransport extends Transport {
    constructor() { super(); this.peer = null; }
    send(msg) { if (this.peer && this.peer._h) this.peer._h(msg); }
    close() {}
  }

  /** WebSocket 传输（服务端预留） */
  class WSTransport extends Transport {
    constructor(url) {
      super();
      this.ws = new WebSocket(url);
      this.queue = [];
      this.ws.onopen = () => {
        for (const m of this.queue) this.ws.send(JSON.stringify(m));
        this.queue.length = 0;
      };
      this.ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (this._h) this._h(msg);
      };
      this.ws.onclose = () => { this.closed = true; };
    }
    send(msg) {
      if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
      else this.queue.push(msg);
    }
    close() { this.ws.close(); }
  }

  /* ---------- 客户端会话（占位实现） ---------- */
  class ClientSession {
    constructor(world, transport) {
      this.world = world;
      this.transport = transport;
      this.playerId = -1;
      this.tick = 0;
      this.inputBuffer = [];
      this.lastSnapshot = null;
      this.rtt = 0;

      transport.onMessage((m) => this.onMessage(m));
    }

    /** 每帧采集输入并上行（离散化，保证两端一致） */
    pumpInput(dt) {
      this.tick++;
      const inp = this.world.input;
      const dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
      this.transport.send({
        t: MSG.INPUT,
        tick: this.tick,
        dx, dy,
        dash: !!inp.dash,
        // 瞄准角度量化到 1/256 圈，避免浮点差异
        aim: Math.round((this.world.player.aim / (Math.PI * 2)) * 256) & 255,
      });
    }

    onMessage(m) {
      switch (m.t) {
        case MSG.WELCOME:
          this.playerId = m.playerId;
          this.serverTick = m.tick;
          break;
        case MSG.SNAPSHOT:
          this.lastSnapshot = m;
          this.reconcile(m);
          break;
        case MSG.PONG:
          this.rtt = performance.now() - m.clientTime;
          break;
        default:
          break;
      }
    }

    /** 位置校正：误差大就瞬移，误差小就插值，避免抖动 */
    reconcile(snap) {
      const p = this.world.player;
      const sp = snap.player;
      const err = Math.hypot(sp.x - p.x, sp.y - p.y);
      if (err > 140) {
        p.x = sp.x; p.y = sp.y;
      } else if (err > 8) {
        p.x = U.lerp(p.x, sp.x, 0.22);
        p.y = U.lerp(p.y, sp.y, 0.22);
      }
      p.hp = sp.hp;
      p.gold = sp.gold;
      p.level = sp.level;
    }
  }

  /* ---------- 服务端房间（伪代码级占位） ---------- */
  class ServerRoom {
    /**
     * @param {object} cfg { seed, tickRate, snapshotRate, maxPlayers }
     */
    constructor(cfg) {
      this.cfg = Object.assign({ seed: 1, tickRate: 60, snapshotRate: 20, maxPlayers: 4 }, cfg);
      this.world = new RG.World({ seed: this.cfg.seed });
      this.players = new Map();  // id -> { transport, input, world? }
      this.tick = 0;
      this.acc = 0;
    }

    join(id, transport) {
      this.players.set(id, { transport, input: { dx: 0, dy: 0, dash: false, aim: 0 } });
      transport.send({
        t: MSG.WELCOME,
        playerId: id,
        seed: this.cfg.seed,
        tick: this.tick,
      });
    }

    /**
     * 权威步进。多玩家版本需要把 world 扩展为"玩家数组"，
     * 目前单机版只有一个 world.player，扩展点就在 createPlayer。
     */
    update(dt) {
      this.acc += dt;
      const step = 1 / this.cfg.tickRate;
      let guard = 0;
      while (this.acc >= step && guard++ < 5) {
        this.acc -= step;
        this.tick++;
        this.world.step(step);
      }

      // 按快照频率广播
      if (this.tick % Math.round(this.cfg.tickRate / this.cfg.snapshotRate) === 0) {
        const snap = this.world.snapshot();
        snap.t = MSG.SNAPSHOT;
        for (const [, p] of this.players) p.transport.send(snap);
      }
    }
  }

  RG.Net = { MSG, Transport, LocalTransport, WSTransport, ClientSession, ServerRoom };
})(window);
