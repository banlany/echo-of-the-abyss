/* ==========================================================
   icons.js — 程序化 SVG 图标（不依赖任何图片资源）
   ========================================================== */
(function (global) {
  'use strict';
  const RG = (global.RG = global.RG || {});

  const S = (inner) =>
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" ' +
    'stroke="currentColor" stroke-width="0" stroke-linecap="round" stroke-linejoin="round">' +
    inner + '</svg>';

  const ICONS = {
    // ---------- 武器 ----------
    sword: S('<path d="M12 1.5 L15 7 V14.5 H9 V7 Z"/><rect x="6" y="14.6" width="12" height="2" rx="1"/><rect x="11" y="16.8" width="2" height="5.7" rx="1"/>'),
    hammer: S('<rect x="3.5" y="3.5" width="17" height="7.5" rx="2"/><rect x="10.6" y="10.5" width="2.8" height="10" rx="1"/><rect x="7" y="20" width="10" height="2" rx="1"/>'),
    bow: S('<path d="M6.5 2.5 Q19 12 6.5 21.5" fill="none" stroke-width="2.4"/><line x1="6.5" y1="2.5" x2="6.5" y2="21.5" stroke-width="1.1" fill="none"/><line x1="4" y1="12" x2="20.5" y2="12" stroke-width="1.6" fill="none"/><path d="M20.5 12 l-3.4-2 v4 z"/>'),
    staff: S('<line x1="9.5" y1="22" x2="14.6" y2="6.5" stroke-width="2.3" fill="none"/><circle cx="16" cy="4.2" r="3.4"/><circle cx="16" cy="4.2" r="1.3" fill="none" stroke-width="1" opacity=".45"/>'),
    dagger: S('<path d="M12 2 L14 8 V13 H10 V8 Z"/><rect x="7.5" y="13" width="9" height="1.9" rx="1"/><rect x="11" y="15" width="2" height="5" rx="1"/>'),
    blade: S('<path d="M8.5 3 A 10 10 0 0 0 8.5 21" fill="none" stroke-width="2.8"/><path d="M15.5 3 A 10 10 0 0 1 15.5 21" fill="none" stroke-width="2.8"/><circle cx="12" cy="12" r="1.6"/>'),
    flame: S('<path d="M12 1.5 C16 7.5 19.5 10 19.5 15 A7.5 7.5 0 0 1 4.5 15 C4.5 11 7.5 8.5 12 1.5 Z"/><path d="M12 11 C14 14 15 15.5 15 17.5 A3 3 0 0 1 9 17.5 C9 15.5 10.5 14 12 11 Z" fill="#000" opacity=".28" stroke="none"/>'),
    bolt: S('<path d="M13.5 1.5 L5 13.5 h5.6 L9 22.5 L19.5 9.6 h-6.2 z"/>'),
    frost: S('<g fill="none" stroke-width="2">' +
      '<line x1="12" y1="2" x2="12" y2="22"/><line x1="3.5" y1="7" x2="20.5" y2="17"/><line x1="3.5" y1="17" x2="20.5" y2="7"/></g>' +
      '<circle cx="12" cy="12" r="2.6"/>'),
    boomerang: S('<path d="M3.5 21 V11.5 A 8.5 8.5 0 0 1 20.5 11.5 V21" fill="none" stroke-width="3"/>'),

    // ---------- 防具 ----------
    armor: S('<path d="M12 1.8 L20 4.8 V11 C20 17 16.2 20.6 12 22.2 C7.8 20.6 4 17 4 11 V4.8 Z"/><path d="M12 6 V18" stroke="#000" opacity=".22" stroke-width="1.6" fill="none"/>'),
    leather: S('<path d="M8 2 L12 5.5 L16 2 L20.5 5.5 V22 H3.5 V5.5 Z"/><path d="M12 5.5 V14" stroke="#000" opacity=".25" stroke-width="1.4" fill="none"/>'),
    robe: S('<path d="M12 2.5 L18 6.5 L21.5 22 H2.5 L6 6.5 Z"/><path d="M12 6.5 V20" stroke="#000" opacity=".22" stroke-width="1.4" fill="none"/>'),
    vest: S('<path d="M8 2 L12 5 L16 2 L20.5 6 V22 H3.5 V6 Z" fill="none" stroke-width="2.2"/><path d="M12 8 V18" fill="none" stroke-width="1.8"/><path d="M8 2 L8 8 M16 2 L16 8" fill="none" stroke-width="1.4" opacity=".6"/>'),
    scale: S('<path d="M5.5 3.5 h13 l-2.2 6.5 h-8.6 z"/><path d="M3.5 12 h17 l-2.2 6.5 h-12.6 z"/><path d="M6.5 20.5 h11 l-1.6 1.5 h-7.8 z" opacity=".6"/>'),

    // ---------- 饰品 ----------
    amulet: S('<path d="M6.5 2.5 L12 9.5 L17.5 2.5" fill="none" stroke-width="1.6"/><circle cx="12" cy="15.5" r="6"/><circle cx="12" cy="15.5" r="2.6" fill="#000" opacity=".3"/>'),
    boot: S('<path d="M7.5 2 h5 v9.5 h4.2 a4 4 0 0 1 4 4 V22 H7.5 Z"/><path d="M7.5 17.5 h13.2" fill="none" stroke="#000" opacity=".22" stroke-width="1.4"/>'),
    eye: S('<path d="M1.8 12 C5.8 5.8 18.2 5.8 22.2 12 C18.2 18.2 5.8 18.2 1.8 12 Z" fill="none" stroke-width="2.2"/><circle cx="12" cy="12" r="3.4"/>'),
    ring: S('<circle cx="12" cy="14.5" r="6.5" fill="none" stroke-width="2.6"/><path d="M12 1.8 L15.2 6.6 H8.8 Z"/>'),
    magnet: S('<path d="M6 3 v9 a6 6 0 0 0 12 0 V3" fill="none" stroke-width="3.6"/><line x1="2.8" y1="3" x2="9.2" y2="3" stroke-width="4.2"/><line x1="14.8" y1="3" x2="21.2" y2="3" stroke-width="4.2"/>'),
    dice: S('<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="4.2" fill="none" stroke-width="2.2"/><circle cx="8.4" cy="8.4" r="1.7"/><circle cx="15.6" cy="15.6" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="15.6" cy="8.4" r="1.7"/><circle cx="8.4" cy="15.6" r="1.7"/>'),
    hourglass: S('<path d="M5.5 2.5 h13 L12 12 L18.5 21.5 h-13 L12 12 Z"/><path d="M4.5 2.5 h15 M4.5 21.5 h15" fill="none" stroke-width="2"/>'),
    mask: S('<path d="M2.8 7.5 C7 4.5 17 4.5 21.2 7.5 C21.2 15 17 20.5 12 20.5 C7 20.5 2.8 15 2.8 7.5 Z"/><circle cx="8.4" cy="11" r="1.9" fill="#000" opacity=".55" stroke="none"/><circle cx="15.6" cy="11" r="1.9" fill="#000" opacity=".55" stroke="none"/>'),
    turtle: S('<path d="M12 1.8 L20.2 6.9 V17.1 L12 22.2 L3.8 17.1 V6.9 Z"/><path d="M12 6 L16.6 9 V15 L12 18 L7.4 15 V9 Z" fill="#000" opacity=".26" stroke="none"/>'),
    badge: S('<path d="M12 1.6 l2.95 6.25 6.85.85 -5.05 4.7 1.35 6.75 L12 16.9 5.9 20.15 7.25 13.4 2.2 8.7 l6.85-.85 Z"/>'),

    // ---------- 杂项 ----------
    rune: S('<circle cx="12" cy="12" r="9" fill="none" stroke-width="1.6"/><circle cx="12" cy="12" r="4.2" fill="none" stroke-width="1.4"/><path d="M12 1 v5 M12 18 v5 M1 12 h5 M18 12 h5" fill="none" stroke-width="1.4"/>'),
  };

  RG.icon = function (name) {
    return ICONS[name] || ICONS.rune;
  };
  RG.ICONS = ICONS;
})(window);
