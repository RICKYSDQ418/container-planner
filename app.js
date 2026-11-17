(function(){
'use strict';
const E = window.CPEngine;
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const KEY = 'nsr_container_planner_v1';
const COLORS = ['#34c759','#ff9500','#007aff','#ff3b30','#af52de','#ffcc00','#5ac8fa','#a2845e','#30b0c7','#ff2d55','#5856d6','#8e8e93'];
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n, d = 0) => (isFinite(n) ? n : 0).toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = n => '$' + fmt(n, 2);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* 页内弹窗：微信和网页预览都会屏蔽 alert/confirm/prompt */
const UI = (function(){
  let done = null;
  function open(title, bodyHtml, buttons, onShow){
    return new Promise(res => {
      if (done) done(null);
      $('#mTitle').textContent = title; $('#mBody').innerHTML = bodyHtml;
      $('#mBtns').innerHTML = buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.t)}</button>`).join('');
      done = v => { done = null; $('#modal').hidden = true; res(v); };
      $('#mBtns').onclick = e => { const b = e.target.closest('button'); if (!b) return; const def = buttons[+b.dataset.i]; if (def.keep) { def.fn && def.fn(b); return; } done(def.v === undefined ? null : (typeof def.v === 'function' ? def.v() : def.v)); };
      $('#modal').hidden = false; onShow && onShow();
    });
  }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && done) done(null); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && done) done(null); });
  function copy(text, btn){
    const ta = $('#mBody textarea');
    const ok = () => { btn.textContent = '已复制 ✓'; setTimeout(() => btn.textContent = '复制', 1500); };
    const fallback = () => { if (ta) { ta.removeAttribute('readonly'); ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); try { document.execCommand('copy') ? ok() : (btn.textContent = '已选中，请长按复制'); } catch (e) { btn.textContent = '已选中，请长按复制'; } } };
    try { navigator.clipboard.writeText(text).then(ok, fallback); } catch (e) { fallback(); }
  }
  return {
    alert: (msg, title) => open(title || '提示', esc(msg), [{ t: '好', cls: 'pri', v: true }]),
    confirm: (msg, okText) => open('请确认', esc(msg), [{ t: '取消', v: false }, { t: okText || '确定', cls: 'pri', v: true }]).then(v => !!v),
    prompt: (title, def, multi) => open(title, multi ? `<textarea id="mInput" placeholder="在这里粘贴"></textarea>` : `<input id="mInput" value="${esc(def || '')}">`,
      [{ t: '取消', v: null }, { t: '确定', cls: 'pri', v: () => $('#mInput').value }], () => { const el = $('#mInput'); el.focus(); if (el.select) el.select(); }),
    pick: (title, items, danger) => open(title, `<div class="mlist">${items.map((t, i) => `<button class="btn ${danger ? 'del' : ''}" data-pick="${i}">${esc(t)}</button>`).join('')}</div>`, [{ t: '取消', v: null }],
      () => { $('#mBody').onclick = e => { const b = e.target.closest('[data-pick]'); if (b && done) done(+b.dataset.pick); }; }),
    text: (title, note, text) => open(title, `<div class="note" style="margin:0 0 8px">${esc(note)}</div><textarea readonly>${esc(text)}</textarea>`,
      [{ t: '复制', cls: 'pri', keep: true, fn: b => copy(text, b) }, { t: '关闭', v: true }]),
  };
})();

/* ---------- 内置 HS 参考（常见建材，税率需核实） ---------- */
const HS_REF = [
  ['6807.10','沥青瓦 / 沥青防水卷材（成卷）','Asphalt shingles, roofing felt, bituminous membranes in rolls',null,0,''],
  ['6807.90','其他沥青制品','Other articles of asphalt',null,0,''],
  ['6806.10','岩棉 / 矿棉 / 渣棉（散装、卷、板）','Slag wool, rock wool, mineral wools',null,0,''],
  ['6806.90','其他矿物隔热材料','Other heat/sound-insulating mineral materials',null,0,''],
  ['7019.39','玻璃纤维毡 / 玻纤保温','Glass fibre mats, webs (insulation)',null,0,''],
  ['3921.13','聚氨酯泡沫板 / 泡沫条','Polyurethane cellular plates/sheets/strip',0,0,'CBSA 2026：免税'],
  ['3921.19','PE 等其他塑料泡沫板 / 泡沫条（卷）','Other cellular plastics plates/sheets/strip',0,0,'CBSA 2026：免税'],
  ['3921.11','聚苯乙烯泡沫板（EPS/XPS）','Polystyrene cellular plates/sheets',0,0,'CBSA 2026：免税'],
  ['3920.10','PE 薄膜 / 防潮膜','Polyethylene film/sheet, non-cellular',null,0,''],
  ['3925.90','塑料建筑配件（檐沟、落水管、通风口等）','Builders\' ware of plastics, n.e.s.',null,0,''],
  ['3925.20','塑料门窗及框','Plastic doors, windows and frames',null,0,''],
  ['3918.10','PVC 地板 / 墙板（SPC/LVP）','PVC floor and wall coverings',null,0,''],
  ['3916.20','PVC 型材','PVC profile shapes',null,0,''],
  ['4418.20','木门及门框','Wooden doors and frames',null,0,''],
  ['4412.31','胶合板','Plywood (tropical face ply)',null,0,''],
  ['6907.21','瓷砖（吸水率≤0.5%）','Ceramic tiles, water absorption ≤0.5%',null,0,''],
  ['6907.22','瓷砖（吸水率0.5–10%）','Ceramic tiles, water absorption 0.5–10%',null,0,''],
  ['6810.19','人造石 / 水泥砖瓦','Tiles/flagstones of cement or artificial stone',null,0,''],
  ['6809.11','石膏板','Gypsum plasterboard, faced with paper',null,0,''],
  ['6811.40','纤维水泥板（含石棉除外请核对）','Fibre-cement sheets',null,0,''],
  ['2523.29','普通硅酸盐水泥','Portland cement',null,0,''],
  ['3214.10','密封胶 / 玻璃胶','Mastics, sealants, caulking',null,0,''],
  ['3506.91','建筑胶粘剂','Adhesives based on polymers',null,0,''],
  ['7210.49','镀锌钢板','Flat-rolled steel, zinc-coated',null,25,'钢：可能有 25% 附加税 / 配额附加税'],
  ['7210.70','彩涂钢板（彩钢瓦卷）','Flat-rolled steel, painted/plastic coated',null,25,'钢：可能有 25% 附加税 / 配额附加税'],
  ['7308.90','钢结构件 / 金属屋面板件','Structures and parts of iron/steel',null,0,'钢衍生品：核实是否有附加税'],
  ['7317.00','钉子（屋面钉等）','Nails, tacks, staples of iron/steel',null,0,'钢衍生品：核实是否有附加税/反倾销'],
  ['7318.15','螺丝 / 螺栓','Screws and bolts of iron/steel',null,0,'钢衍生品：核实是否有附加税'],
  ['7606.12','铝板 / 铝卷','Aluminium plates/sheets, alloyed',null,25,'铝：可能有 25% 附加税'],
  ['7610.90','铝结构件（檐沟、门窗框）','Aluminium structures and parts',null,0,'铝衍生品：核实是否有附加税'],
  ['8481.80','阀门 / 水龙头','Taps, cocks, valves',null,0,''],
  ['9403.20','金属家具 / 货架','Metal furniture',null,0,''],
  ['9405.11','LED 灯具','Luminaires (LED), ceiling/wall',null,0,''],
  ['2508.10','膨润土 / 猫砂原料','Bentonite',null,0,''],
  ['2309.90','宠物用品（饲料类）','Animal feed preparations',null,0,''],
];

/* ---------- 默认数据 ---------- */
function defaults(){
  return {
    v: 1,
    settings: {
      rates: { CAD: 1, USD: 1.38, CNY: 0.19 }, ratesDate: '示例汇率，请更新',
      wmRatio: 1000, gst: 5, gstInCost: false, eff: 90,
      minMode: 'ratio', minRatio: 15, minFixed: 40000,
      ins: { on: true, rate: 0.3, markup: 110 }, margin: 30,
    },
    containers: [
      { id: '20gp', name: '20GP 普柜', L: 589.8, W: 235.2, H: 239.3, payload: 25000, freight: 1400, freightCur: 'USD', on: true },
      { id: '40gp', name: '40GP 普柜', L: 1203.2, W: 235.2, H: 239.3, payload: 26500, freight: 2200, freightCur: 'USD', on: true },
      { id: '40hq', name: '40HQ 高柜', L: 1203.2, W: 235.2, H: 269.8, payload: 26500, freight: 2300, freightCur: 'USD', on: true },
    ],
    products: [
      { id: uid(), name: '沥青瓦（捆）', hs: '6807.10', dutyRate: 0, surtaxRate: 0, hsChecked: false, L: 102, W: 33, H: 10, dimUnit: 'cm', weight: 32, wtUnit: 'kg', price: 48, currency: 'CNY', color: COLORS[0] },
      { id: uid(), name: 'SBS 防水卷材', hs: '6807.10', dutyRate: 0, surtaxRate: 0, hsChecked: false, L: 105, W: 25, H: 25, dimUnit: 'cm', weight: 40, wtUnit: 'kg', price: 120, currency: 'CNY', color: COLORS[1] },
      { id: uid(), name: 'PVC 檐沟 3m（箱）', hs: '3925.90', dutyRate: 0, surtaxRate: 0, hsChecked: false, L: 305, W: 25, H: 20, dimUnit: 'cm', weight: 12, wtUnit: 'kg', price: 150, currency: 'CNY', color: COLORS[2] },
      { id: uid(), name: '岩棉板（包）', hs: '6806.10', dutyRate: 0, surtaxRate: 0, hsChecked: false, L: 120, W: 60, H: 50, dimUnit: 'cm', weight: 18, wtUnit: 'kg', price: 85, currency: 'CNY', color: COLORS[3] },
    ],
    plan: { ctId: '40hq', mode: 'auto', objective: 'balanced', minShare: 0, rows: {} },
    costs: [
      { id: 'freight', name: '海运费（跟柜型）', isFreight: true, amount: null, currency: 'USD', basis: 'wm' },
      { id: uid(), name: '起运港杂费 / 报关', amount: 2500, currency: 'CNY', basis: 'wm' },
      { id: uid(), name: '工厂→起运港 拖车', amount: 2000, currency: 'CNY', basis: 'wm' },
      { id: uid(), name: '目的港费用（Halifax THC/文件）', amount: 900, currency: 'CAD', basis: 'wm' },
      { id: uid(), name: '清关报关行', amount: 250, currency: 'CAD', basis: 'value' },
      { id: uid(), name: '港口→仓库 拖车', amount: 600, currency: 'CAD', basis: 'wm' },
    ],
    hsLib: {},
    saved: [],
    last: null,
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch (e) { S = defaults(); }
/* 新增货物（按 id 合并，不覆盖已有数据；删掉后不会再加回来） */
const SEED = [
  { id: 'seed-roll-50x25', added: '2026-10-28', name: '泡沫条 6000×50×25mm（10卷/箱）', hs: '3921.19', dutyRate: 0, surtaxRate: 0, hsChecked: true, L: 42, W: 42, H: 52, dimUnit: 'cm', weight: 0, wtUnit: 'kg', price: 40.5, currency: 'USD', color: '#7a5ab8' },
  { id: 'seed-roll-25x25', added: '2026-10-28', name: '泡沫条 6000×25×25mm（20卷/箱）', hs: '3921.19', dutyRate: 0, surtaxRate: 0, hsChecked: true, L: 42, W: 42, H: 52, dimUnit: 'cm', weight: 0, wtUnit: 'kg', price: 44, currency: 'USD', color: '#c9a227' },
  /* 2026-11-09：48″×250′ 卷材，按 40HQ FOB 单价（USD/卷）；卷径按供应商装柜数反推（约值），单卷 1219.2×76.2m */
  { id: 'seed-uw-90', added: '2026-11-09', name: '卷材 90GSM 48″×250′（卷）', hs: '', dutyRate: 0, surtaxRate: 0, hsChecked: false, L: 121.92, W: 14.9, H: 14.9, dimUnit: 'cm', weight: 8.36676, wtUnit: 'kg', price: 19.73, currency: 'USD', color: '#2f7fb8' },
  { id: 'seed-uw-100', added: '2026-11-09', name: '卷材 100GSM 48″×250′（卷）', hs: '', dutyRate: 0, surtaxRate: 0, hsChecked: false, L: 121.92, W: 15.3, H: 15.3, dimUnit: 'cm', weight: 9.2964, wtUnit: 'kg', price: 21.90, currency: 'USD', color: '#d0603a' },
  { id: 'seed-uw-110', added: '2026-11-09', name: '卷材 110GSM 48″×250′（卷）', hs: '', dutyRate: 0, surtaxRate: 0, hsChecked: false, L: 121.92, W: 16.3, H: 16.3, dimUnit: 'cm', weight: 10.22604, wtUnit: 'kg', price: 24.11, currency: 'USD', color: '#4a9a5e' },
  /* 2026-11-09 第二份报价：110g/㎡(±5%) 灰/黑 1.22m×76.2m=93㎡/卷；20GP 49卷/托×18托=882卷；EXW 含税 CNY 225/卷；FOB 上海 USD 30.58/卷。单卷重按 93㎡×110g 计 */
  { id: 'seed-uw-110-gb', added: '2026-11-09', name: '卷材 110GSM 灰/黑 1.22×76.2m（49卷/托，FOB 上海）', hs: '', dutyRate: 0, surtaxRate: 0, hsChecked: false, L: 122, W: 16.3, H: 16.3, dimUnit: 'cm', weight: 10.23, wtUnit: 'kg', price: 30.58, currency: 'USD', color: '#5b6770' },
];
const D0 = defaults();
function normalize(){
const before = JSON.stringify(S.seeded || {});
S.settings = Object.assign({}, D0.settings, S.settings); S.settings.ins = Object.assign({}, D0.settings.ins, S.settings.ins);
['containers','products','costs','saved'].forEach(k => { if (!Array.isArray(S[k])) S[k] = D0[k]; });
S.plan = Object.assign({}, D0.plan, S.plan); S.hsLib = S.hsLib || {};
S.seeded = S.seeded || {};
SEED.forEach(p => { if (!S.seeded[p.id]) { S.seeded[p.id] = 1; if (!S.products.some(x => x.id === p.id)) S.products.push(Object.assign({}, p)); } });
/* 2026-10-28：泡沫条确认为塑料泡沫，HS 3921.19，MFN 免税（CBSA 2026 税则） */
if (!S.seeded['foam-hs-v2']) {
  S.seeded['foam-hs-v2'] = 1;
  SEED.filter(sd => sd.id.startsWith('seed-roll-')).forEach(sd => { const p = S.products.find(x => x.id === sd.id); if (p) { p.name = sd.name; p.hs = '3921.19'; p.dutyRate = 0; p.surtaxRate = 0; p.hsChecked = true; } });
  if (!S.hsLib['3921.19']) S.hsLib['3921.19'] = { duty: 0, surtax: 0, desc: '塑料泡沫条/片（PE 等，非聚氨酯）', date: '2026-10-28' };
}
S.saved.forEach(x => { if (!x.id) x.id = uid(); });
return JSON.stringify(S.seeded) !== before;
}
normalize();
let saveT;
let RO = false;          // 只读（查看者）
let CLOUD = null;        // 云同步状态，见文件末尾
function save(){
  clearTimeout(saveT);
  if (CLOUD) { if (!CLOUD.ready || RO) return; CLOUD.dirty = true; setSync('saving'); saveT = setTimeout(cloudPush, 500); return; }
  saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 200);
}
const currencies = () => Object.keys(S.settings.rates);
const ct = () => S.containers.find(c => c.id === S.plan.ctId) || S.containers[0];
const prodById = id => S.products.find(p => p.id === id);
const nprod = p => E.norm(p, S.settings.rates);
const prow = id => S.plan.rows[id] || (S.plan.rows[id] = { on: true, min: '', max: '', ratio: 1, qty: 0 });

/* ---------- 标签页 ---------- */
$('#nav').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#nav button').forEach(x => x.classList.toggle('on', x === b));
  $$('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.t));
  if (b.dataset.t === 'plan') { renderPlan(); V3.resize(); }
  if (b.dataset.t === 'cost') renderCost();
  if (b.dataset.t === 'settings') renderSettings();
});

/* ---------- ① 货物库 ---------- */
const sel = (opts, v) => opts.map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('');
function renderProducts(){
  const t = $('#prodTable');
  let h = `<tr><th></th><th>品名</th><th>HS 编码</th><th class="n">关税%</th><th class="n">附加税%</th><th>长 × 宽 × 高</th><th></th><th class="n">单箱毛重</th><th></th><th class="n">单箱价格</th><th></th><th class="n">m³/箱</th><th class="n">密度 kg/m³</th><th>可侧放</th><th></th></tr>`;
  S.products.forEach(p => {
    const n = nprod(p), dens = n.cbm > 0 ? n.kg / n.cbm : 0;
    const heavy = dens > S.settings.wmRatio;
    h += `<tr data-id="${p.id}">
      <td><input type="color" data-k="color" value="${p.color}" style="width:28px;height:24px;padding:0;border:0"></td>
      <td><input data-k="name" class="w160" value="${esc(p.name)}"></td>
      <td><input data-k="hs" class="w120 mono" value="${esc(p.hs)}" placeholder="0000.00"> ${p.hsChecked ? '<span class="badge ok">已核实</span>' : '<span class="badge warn">待核实</span>'}</td>
      <td class="n"><input type="number" data-k="dutyRate" class="w50" step="0.5" value="${p.dutyRate}"></td>
      <td class="n"><input type="number" data-k="surtaxRate" class="w50" step="0.5" value="${p.surtaxRate}"></td>
      <td><input type="number" data-k="L" class="w50" value="${p.L}"> × <input type="number" data-k="W" class="w50" value="${p.W}"> × <input type="number" data-k="H" class="w50" value="${p.H}"></td>
      <td><select data-k="dimUnit">${sel(Object.keys(E.DIM), p.dimUnit)}</select></td>
      <td class="n"><input type="number" data-k="weight" value="${p.weight}"></td>
      <td><select data-k="wtUnit">${sel(Object.keys(E.WT), p.wtUnit)}</select></td>
      <td class="n"><input type="number" data-k="price" step="0.01" value="${p.price}"></td>
      <td><select data-k="currency">${sel(currencies(), p.currency)}</select></td>
      <td class="n">${fmt(n.cbm, 4)}</td>
      <td class="n">${fmt(dens)} <span class="badge ${heavy ? 'warn' : ''}">${heavy ? '重货' : '轻货'}</span></td>
      <td style="text-align:center"><input type="checkbox" data-k="rot" ${p.noRotate ? '' : 'checked'}></td>
      <td><button class="btn sm" data-a="dup">复制</button> <button class="btn sm del" data-a="del">删除</button></td></tr>`;
  });
  t.innerHTML = h;
}
$('#prodTable').addEventListener('change', e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const p = prodById(tr.dataset.id), k = e.target.dataset.k; if (!p || !k) return;
  if (k === 'rot') p.noRotate = !e.target.checked;
  else if (['dutyRate','surtaxRate','L','W','H','weight','price'].includes(k)) p[k] = +e.target.value || 0;
  else p[k] = e.target.value;
  if (k === 'hs') applyHsLib(p);
  if (k === 'dutyRate' || k === 'surtaxRate') { p.hsChecked = true; if (p.hs) S.hsLib[p.hs] = { duty: p.dutyRate, surtax: p.surtaxRate, desc: p.name, date: new Date().toISOString().slice(0, 10) }; }
  save(); renderProducts();
});
$('#prodTable').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.closest('tr').dataset.id, i = S.products.findIndex(p => p.id === id);
  if (b.dataset.a === 'del') { UI.confirm('删除「' + S.products[i].name + '」？', '删除').then(ok => { if (!ok) return; const k = S.products.findIndex(p => p.id === id); if (k >= 0) S.products.splice(k, 1); delete S.plan.rows[id]; save(); renderProducts(); }); return; }
  if (b.dataset.a === 'dup') { const c = Object.assign({}, S.products[i], { id: uid(), name: S.products[i].name + ' 副本', color: COLORS[S.products.length % COLORS.length] }); S.products.splice(i + 1, 0, c); }
  save(); renderProducts();
});
$('#addProd').onclick = () => {
  S.products.push({ id: uid(), name: '新货物', hs: '', dutyRate: 0, surtaxRate: 0, hsChecked: false, L: 50, W: 40, H: 30, dimUnit: 'cm', weight: 10, wtUnit: 'kg', price: 100, currency: 'CNY', color: COLORS[S.products.length % COLORS.length] });
  save(); renderProducts();
};
function applyHsLib(p){
  const lib = S.hsLib[p.hs];
  if (lib) { p.dutyRate = lib.duty; p.surtaxRate = lib.surtax; p.hsChecked = true; }
  else p.hsChecked = false;
}
/* HS 查询 */
let hsTarget = null;
function hsSearch(){
  const q = $('#hsQuery').value.trim().toLowerCase();
  const res = $('#hsResults');
  if (!q) { res.innerHTML = ''; return; }
  const qd = q.replace(/[^0-9]/g, '');
  const mine = Object.entries(S.hsLib).map(([code, v]) => [code, (v.desc || '') + '（我的库）', '', v.duty, v.surtax, '已核实 ' + (v.date || '')]);
  const all = mine.concat(HS_REF);
  const hits = all.filter(r => (qd && r[0].replace(/\./g, '').startsWith(qd)) || (!qd && (r[1].toLowerCase().includes(q) || r[2].toLowerCase().includes(q))) || (qd && q.length > qd.length && r[1].includes(q)));
  res.innerHTML = hits.length ? hits.map(r => `<div data-code="${r[0]}" data-duty="${r[3] == null ? '' : r[3]}" data-sur="${r[4] || 0}"><b class="mono">${r[0]}</b> ${esc(r[1])} <span class="muted">${esc(r[2])}</span> ${r[3] != null ? `<span class="badge ok">关税 ${r[3]}%</span>` : '<span class="badge warn">税率需查</span>'} ${r[4] ? `<span class="badge bad">附加税 ${r[4]}%</span>` : ''} ${r[5] ? `<span class="badge warn">${esc(r[5])}</span>` : ''}</div>`).join('')
    : '<div class="muted">内置库里没有，点上面的按钮去官方税则查</div>';
}
$('#hsQuery').addEventListener('input', hsSearch);
$('#hsResults').addEventListener('click', e => {
  const d = e.target.closest('div[data-code]'); if (!d || RO) return;
  UI.pick(`把 HS ${d.dataset.code} 套用到哪个货物？`, S.products.map(p => p.name)).then(k => {
    const p = S.products[k]; if (k == null || !p) return;
    p.hs = d.dataset.code;
    if (S.hsLib[p.hs]) applyHsLib(p);
    else { if (d.dataset.duty !== '') p.dutyRate = +d.dataset.duty; p.surtaxRate = +d.dataset.sur || 0; p.hsChecked = false; }
    save(); renderProducts();
  });
});

/* ---------- ② 装柜方案 ---------- */
function minValue(costTotalCAD){
  const s = S.settings;
  return s.minMode === 'fixed' ? (+s.minFixed || 0) : (s.minRatio > 0 ? costTotalCAD / (s.minRatio / 100) : 0);
}
function logisticsEstimate(){   // 不含保险的物流费（CAD），用于货值门槛
  const c = ct();
  return S.costs.reduce((a, x) => a + (x.isFreight ? E.toCAD(c.freight, c.freightCur, S.settings.rates) : E.toCAD(x.amount, x.currency, S.settings.rates)), 0);
}
function renderPlan(){
  $('#ctSel').innerHTML = S.containers.map(c => `<option value="${c.id}"${c.id === S.plan.ctId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === S.plan.mode));
  $('#objSel').value = S.plan.objective; $('#minShare').value = S.plan.minShare || 0;
  const auto = S.plan.mode === 'auto';
  $('#objWrap').style.display = auto ? '' : 'none';
  $('#shareWrap').style.display = auto && S.plan.objective !== 'ratio' ? '' : 'none';
  const ratio = auto && S.plan.objective === 'ratio';
  let h = `<tr><th>用</th><th>货物</th>${auto ? (ratio ? '<th class="n">比例</th>' : '<th class="n">最少</th><th class="n">最多</th>') : '<th class="n">数量（箱）</th>'}<th class="n">结果</th><th class="n">m³</th><th class="n">kg</th><th class="n">货值 CAD</th></tr>`;
  const last = S.last && S.last.ctId === S.plan.ctId ? S.last : null;
  S.products.forEach(p => {
    const r = prow(p.id), n = nprod(p);
    const got = last ? (last.qty[p.id] || 0) : 0, want = last && last.want ? (last.want[p.id] || 0) : got;
    h += `<tr data-id="${p.id}"><td><input type="checkbox" data-k="on" ${r.on ? 'checked' : ''}></td>
      <td><span class="swatch" style="background:${p.color}"></span>${esc(p.name)}</td>
      ${auto ? (ratio ? `<td class="n"><input type="number" data-k="ratio" class="w50" min="0" step="1" value="${r.ratio}"></td>`
        : `<td class="n"><input type="number" data-k="min" class="w50" min="0" placeholder="0" value="${r.min}"></td><td class="n"><input type="number" data-k="max" class="w50" min="0" placeholder="不限" value="${r.max}"></td>`)
        : `<td class="n"><input type="number" data-k="qty" min="0" value="${r.qty || 0}"></td>`}
      <td class="n ${got < want ? 'unplaced' : ''}">${last ? fmt(got) + (got < want ? ` / ${fmt(want)}` : '') : '–'}</td>
      <td class="n">${last ? fmt(got * n.cbm, 2) : ''}</td><td class="n">${last ? fmt(got * n.kg) : ''}</td><td class="n">${last ? fmt(got * n.val) : ''}</td></tr>`;
  });
  $('#pickTable').innerHTML = h;
  $('#pickNote').innerHTML = auto
    ? (ratio ? '按比例：例如 A=2、B=1，就是 A 的箱数是 B 的两倍，系统找出能装下的最大倍数。' : '想让某种货一定出现，就填“最少”；不想超过库存或订单量，就填“最多”。空着 = 由电脑决定。')
    : '填好每种货的箱数，点“计算装柜”。装不下的会标红，显示 已装 / 计划。';
  renderResult();
  renderCompare();
}
$('#ctSel').onchange = e => { S.plan.ctId = e.target.value; save(); renderPlan(); };
$('#modeSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.plan.mode = b.dataset.m; save(); renderPlan(); };
$('#objSel').onchange = e => { S.plan.objective = e.target.value; save(); renderPlan(); };
$('#minShare').onchange = e => { S.plan.minShare = +e.target.value || 0; save(); };
$('#pickTable').addEventListener('change', e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const r = prow(tr.dataset.id), k = e.target.dataset.k;
  r[k] = k === 'on' ? e.target.checked : e.target.value === '' ? '' : +e.target.value;
  save();
});
$('#runBtn').onclick = run;

function run(){
  const C = ct(), msg = $('#planMsg');
  const active = S.products.filter(p => prow(p.id).on);
  if (!active.length) { msg.innerHTML = '<div class="msg warn">先在左边勾选要装的货。</div>'; return; }
  const btn = $('#runBtn'); btn.disabled = true; btn.textContent = '计算中…';
  setTimeout(() => {
    try {
      const mv = minValue(logisticsEstimate());
      let qty = {}, want = {}, packing, info = [];
      if (S.plan.mode === 'manual') {
        const items = active.map(p => { const n = nprod(p); const q = Math.max(0, Math.floor(+prow(p.id).qty || 0)); want[p.id] = q; return { id: p.id, d: n.d, kg: n.kg, qty: q, noRotate: n.noRotate }; });
        packing = E.pack(C, items);
        active.forEach(p => qty[p.id] = packing.placed[p.id] || 0);
        if (!packing.allIn) info.push(['bad', `有 ${fmt(packing.left)} 箱装不下（标红的行）。可以减少数量、换大柜，或切到“电脑自动配货”。`]);
      } else {
        const prods = active.map(p => { const n = nprod(p), r = prow(p.id); return Object.assign(n, { min: +r.min || 0, max: r.max === '' || r.max == null ? Infinity : +r.max, ratio: +r.ratio || 0 }); });
        if (S.plan.objective === 'ratio' && !prods.some(p => p.ratio > 0)) throw new Error('按比例模式需要至少一种货的比例 > 0');
        const o = E.optimize(window.solver, C, prods, { objective: S.plan.objective, minValue: mv, eff: S.settings.eff / 100, minShare: S.plan.minShare });
        if (o.error) throw new Error(o.error);
        packing = o.packing;
        prods.forEach((p, i) => { qty[p.id] = o.qty[i]; want[p.id] = o.qty[i]; });
        if (!o.minOk) info.push(['bad', '有货物达不到你设的“最少数量”——柜子装不下，请调低或换大柜。']);
        if (mv > 0 && !o.valueOk) info.push(['warn', `这些货在这个柜里最多只能做到货值 ${money(o.value)}，低于门槛 ${money(mv)}。说明货太便宜或太泡：加入单价高的货、换小柜，或谈低运费。`]);
        else if (mv > 0) info.push(['ok', `货值 ${money(o.value)}，已达到门槛 ${money(mv)}。`]);
      }
      S.last = { ctId: C.id, qty, want, blocks: packing.blocks, mode: S.plan.mode, at: Date.now() };
      if (S.plan.mode === 'auto') active.forEach(p => prow(p.id).qty = qty[p.id]); // 方便切到手动微调
      save();
      msg.innerHTML = info.map(([c, t]) => `<div class="msg ${c}">${t}</div>`).join('');
      renderPlan();
    } catch (err) { msg.innerHTML = `<div class="msg bad">${esc(err.message)}</div>`; }
    btn.disabled = false; btn.textContent = '计算装柜';
  }, 30);
}

function planStats(){
  const C = ct(), last = S.last && S.last.ctId === C.id ? S.last : null;
  const st = { cbm: 0, kg: 0, val: 0, n: 0, Vc: C.L * C.W * C.H / 1e6, Wc: C.payload };
  if (last) Object.entries(last.qty).forEach(([id, q]) => { const p = prodById(id); if (!p) return; const n = nprod(p); st.cbm += q * n.cbm; st.kg += q * n.kg; st.val += q * n.val; st.n += q; });
  return st;
}
function renderResult(){
  const C = ct(), st = planStats(), mv = minValue(logisticsEstimate());
  const pv = st.cbm / st.Vc * 100, pw = st.kg / st.Wc * 100, pval = mv > 0 ? st.val / mv * 100 : 100;
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="l">体积利用</div><div class="v">${fmt(pv, 1)}%</div><div class="s">${fmt(st.cbm, 2)} / ${fmt(st.Vc, 1)} m³</div><div class="bar"><i style="width:${Math.min(100, pv)}%"></i></div></div>
    <div class="kpi"><div class="l">重量利用</div><div class="v">${fmt(pw, 1)}%</div><div class="s">${fmt(st.kg)} / ${fmt(st.Wc)} kg</div><div class="bar w"><i style="width:${Math.min(100, pw)}%"></i></div></div>
    <div class="kpi"><div class="l">货值 CAD</div><div class="v">${money(st.val)}</div><div class="s">门槛 ${money(mv)}</div><div class="bar v"><i style="width:${Math.min(100, pval)}%;${pval < 100 ? 'background:var(--warn)' : ''}"></i></div></div>
    <div class="kpi"><div class="l">总箱数</div><div class="v">${fmt(st.n)}</div><div class="s">${esc(C.name)}</div></div>`;
  $('#resHint').textContent = S.last && S.last.ctId === C.id ? '' : '还没计算，点上方“计算装柜”';
  $('#legend').innerHTML = S.products.filter(p => S.last && S.last.qty && S.last.qty[p.id]).map(p => `<span><span class="swatch" style="background:${p.color}"></span>${esc(p.name)} × ${fmt(S.last.qty[p.id])}</span>`).join('');
  V3.draw(C, S.last && S.last.ctId === C.id ? S.last.blocks : [], S.products);
}
function renderCompare(){
  const act = S.products.filter(p => prow(p.id).on);
  const cs = S.containers.filter(c => c.on !== false);
  let h = `<tr><th>货物</th>${cs.map(c => `<th class="n">${esc(c.name)}</th>`).join('')}</tr>`;
  act.forEach(p => {
    const n = nprod(p);
    h += `<tr><td><span class="swatch" style="background:${p.color}"></span>${esc(p.name)}</td>` + cs.map(c => {
      const r = E.maxSingle(c, { id: p.id, d: n.d, kg: n.kg, noRotate: n.noRotate });
      return `<td class="n">${fmt(r.qty)} 箱 <span class="badge ${r.limit === '重量' ? 'warn' : ''}">${r.limit === '重量' ? '限重' : '满体积'}</span><div class="muted" style="font-size:11px">${fmt(r.qty * n.cbm, 1)} m³ · ${fmt(r.qty * n.kg)} kg · ${money(r.qty * n.val)}</div></td>`;
    }).join('') + '</tr>';
  });
  const last = S.last;
  if (last) {
    h += `<tr class="sum"><td>当前组合（${S.last.mode === 'manual' ? '手动' : '自动'}结果）能否装下</td>` + cs.map(c => {
      const items = act.map(p => { const n = nprod(p); return { id: p.id, d: n.d, kg: n.kg, noRotate: n.noRotate, qty: (last.want && last.want[p.id]) || last.qty[p.id] || 0 }; });
      const r = E.pack(c, items), Vc = c.L * c.W * c.H / 1e6;
      return `<td class="n">${r.allIn ? '<span class="badge ok">装得下</span>' : `<span class="badge bad">差 ${fmt(r.left)} 箱</span>`}<div class="muted" style="font-size:11px">体积 ${fmt(r.vol / 1e6 / Vc * 100, 0)}% · 重量 ${fmt(r.kg / c.payload * 100, 0)}%</div></td>`;
    }).join('') + '</tr>';
  }
  $('#compareTable').innerHTML = h;
}

/* 方案保存 */
function renderSaved(){ $('#loadPlan').innerHTML = '<option value="">载入已存方案…</option>' + S.saved.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('') + (S.saved.length && !RO ? '<option value="del">删除一个方案…</option>' : ''); }
$('#savePlan').onclick = () => {
  UI.prompt('方案名称', `${ct().name} ${new Date().toLocaleDateString('zh-CN')}`).then(name => {
    if (!name) return;
    S.saved.push({ id: uid(), name, plan: JSON.parse(JSON.stringify(S.plan)), last: S.last, costs: JSON.parse(JSON.stringify(S.costs)) });
    save(); renderSaved(); UI.alert('已保存「' + name + '」');
  });
};
$('#loadPlan').onchange = e => {
  const v = e.target.value; e.target.value = '';
  if (v === 'del') { UI.pick('点一个方案删除', S.saved.map(s => s.name), true).then(i => { if (i == null || !S.saved[i]) return; S.saved.splice(i, 1); save(); renderSaved(); }); return; }
  const s = S.saved[+v]; if (!s) return;
  S.plan = JSON.parse(JSON.stringify(s.plan)); S.last = s.last; if (s.costs) S.costs = JSON.parse(JSON.stringify(s.costs));
  save(); renderPlan();
};

/* ---------- 3D ---------- */
const V3 = (function(){
  let renderer, scene, camera, controls, group, el, dims = { L: 1200, W: 235, H: 270 }, ready = false, shell;
  function init(){
    if (ready || !window.THREE) return; el = $('#view3d');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f88, 0.85));
    const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(8, 14, 10); scene.add(dl);
    group = new THREE.Group(); scene.add(group);
    ready = true; resize();
    (function loop(){ requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
    window.addEventListener('resize', resize);
  }
  function resize(){ if (!ready) return; const w = el.clientWidth || 600, h = el.clientHeight || 440; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function view(kind){
    if (!ready) return; const L = dims.L / 100, W = dims.W / 100, H = dims.H / 100, R = Math.max(L, 4);
    const pos = { iso: [-L * 0.55, H * 2.2, W * 3.2 + R * 0.35], top: [0, R * 1.35, 0.01], side: [0, H / 2, R * 1.15], back: [L * 0.95 + 3, H * 0.6, 0] }[kind] || [0, 0, 0];
    const f = Math.max(1, 1.5 / (camera.aspect || 1.5));  // 窄屏拉远镜头，整柜都能看到
    camera.position.set(pos[0] * f, H / 2 + (pos[1] - H / 2) * f, pos[2] * f); controls.target.set(0, H / 2, 0); controls.update();
  }
  function draw(C, blocks, products){
    init(); if (!ready) { $('#view3d').insertAdjacentHTML('beforeend', '<div class="msg warn">3D 组件加载失败</div>'); return; }
    const changed = C.L !== dims.L || C.W !== dims.W || C.H !== dims.H || !group.children.length;
    dims = { L: C.L, W: C.W, H: C.H };
    while (group.children.length) { const o = group.children.pop(); o.geometry && o.geometry.dispose(); }
    const L = C.L / 100, W = C.W / 100, H = C.H / 100;
    // 柜体
    const tk = n => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || '#888888';
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W));
    const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: new THREE.Color(tk('--stage-edge')) })); edges.position.y = H / 2; group.add(edges);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshLambertMaterial({ color: new THREE.Color(tk('--stage-floor')), side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; group.add(floor);
    shell = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), new THREE.MeshLambertMaterial({ color: 0x9fb0a8, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false }));
    shell.position.y = H / 2; shell.visible = $('#showShell').checked; group.add(shell);
    // 柜门标记
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0xff9500 }));
    door.scale.set(W * 50, H * 50, 1); door.rotation.y = Math.PI / 2; door.position.set(L / 2 + 0.01, H / 2, 0); door.material.transparent = true; door.material.opacity = 0.18; group.add(door);
    // 箱子：每种货一个 InstancedMesh
    const byP = {};
    (blocks || []).forEach(b => {
      for (let i = 0; i < b.bx; i++) for (let j = 0; j < b.by; j++) for (let k = 0; k < b.bz; k++) {
        (byP[b.pid] = byP[b.pid] || []).push([b.x + i * b.l, b.y + j * b.w, b.z + k * b.h, b.l, b.w, b.h]);
      }
    });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    Object.entries(byP).forEach(([pid, arr]) => {
      const p = products.find(x => x.id === pid); const col = new THREE.Color(p ? p.color : '#888');
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: col }), arr.length);
      arr.forEach((a, i) => {
        const gap = 0.006;
        v.set((a[0] + a[3] / 2) / 100 - L / 2, (a[2] + a[5] / 2) / 100, (a[1] + a[4] / 2) / 100 - W / 2);
        s.set(Math.max(0.001, a[3] / 100 - gap), Math.max(0.001, a[5] / 100 - gap), Math.max(0.001, a[4] / 100 - gap));
        mesh.setMatrixAt(i, m4.compose(v, q, s));
      });
      group.add(mesh);
    });
    if (changed) view('iso');
  }
  return { draw, view, resize, toggleShell: on => { if (shell) shell.visible = on; } };
})();
$$('[data-cam]').forEach(b => b.onclick = () => V3.view(b.dataset.cam));
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ($('#tab-plan').classList.contains('on')) renderResult(); }); } catch (e) {}
$('#showShell').onchange = e => V3.toggleShell(e.target.checked);

/* ---------- ③ 成本分摊 ---------- */
const BASIS = { wm: 'W/M 计费吨', value: '按货值', qty: '按件数', cbm: '按体积', kg: '按重量' };
function costAmountCAD(x){ const c = ct(); return x.isFreight ? E.toCAD(c.freight, c.freightCur, S.settings.rates) : E.toCAD(x.amount, x.currency, S.settings.rates); }
function renderCost(){
  const C = ct();
  let h = `<tr><th>费用项目</th><th class="n">金额</th><th>币种</th><th class="n">折合 CAD</th><th>分摊方式</th><th></th></tr>`;
  S.costs.forEach(x => {
    h += `<tr data-id="${x.id}"><td>${x.isFreight ? `${esc(x.name)} <span class="badge">${esc(C.name)}</span>` : `<input data-k="name" class="w200" value="${esc(x.name)}">`}</td>
      <td class="n">${x.isFreight ? `<input type="number" data-k="freight" value="${C.freight}">` : `<input type="number" data-k="amount" value="${x.amount}">`}</td>
      <td><select data-k="${x.isFreight ? 'freightCur' : 'currency'}">${sel(currencies(), x.isFreight ? C.freightCur : x.currency)}</select></td>
      <td class="n">${money(costAmountCAD(x))}</td>
      <td><select data-k="basis">${Object.entries(BASIS).map(([k, t]) => `<option value="${k}"${k === x.basis ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
      <td>${x.isFreight ? '' : '<button class="btn sm del" data-a="del">删除</button>'}</td></tr>`;
  });
  $('#costTable').innerHTML = h;
  const s = S.settings;
  $('#insOn').checked = s.ins.on; $('#insRate').value = s.ins.rate; $('#insMarkup').value = s.ins.markup; $('#margin').value = s.margin;
  computeCost();
}
$('#costTable').addEventListener('change', e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const x = S.costs.find(c => c.id === tr.dataset.id), k = e.target.dataset.k, C = ct();
  if (k === 'freight') C.freight = +e.target.value || 0;
  else if (k === 'freightCur') C.freightCur = e.target.value;
  else if (k === 'amount') x.amount = +e.target.value || 0;
  else x[k] = e.target.value;
  save(); renderCost();
});
$('#costTable').addEventListener('click', e => {
  const b = e.target.closest('button[data-a=del]'); if (!b) return;
  S.costs = S.costs.filter(c => c.id !== b.closest('tr').dataset.id); save(); renderCost();
});
$('#addCost').onclick = () => { S.costs.push({ id: uid(), name: '其他费用', amount: 0, currency: 'CAD', basis: 'wm' }); save(); renderCost(); };
['insOn','insRate','insMarkup','margin'].forEach(id => $('#' + id).addEventListener('change', e => {
  const s = S.settings;
  if (id === 'insOn') s.ins.on = e.target.checked; else if (id === 'insRate') s.ins.rate = +e.target.value || 0;
  else if (id === 'insMarkup') s.ins.markup = +e.target.value || 0; else s.margin = +e.target.value || 0;
  save(); computeCost();
}));
let lastCost = null;
function computeCost(){
  const C = ct(), s = S.settings, last = S.last && S.last.ctId === C.id ? S.last : null;
  if (!last) { $('#costKpis').innerHTML = ''; $('#landedTable').innerHTML = ''; $('#costMsg').innerHTML = '<div class="msg warn">先到“② 装柜方案”算出这一柜装什么（当前柜型：' + esc(C.name) + '）。</div>'; return; }
  const lines = Object.entries(last.qty).map(([id, q]) => { const p = prodById(id); if (!p) return null; const n = nprod(p); return { id, name: p.name, color: p.color, hs: p.hs, qty: q, cbm: n.cbm, kg: n.kg, val: n.val, duty: n.duty, surtax: n.surtax }; }).filter(Boolean);
  const costs = S.costs.map(x => ({ name: x.isFreight ? '海运费' : x.name, amountCAD: costAmountCAD(x), basis: x.basis, isFreight: !!x.isFreight }));
  const r = lastCost = E.costing(lines, costs, { wmRatio: s.wmRatio, gst: s.gst, gstInCost: s.gstInCost, insurance: s.ins, margin: s.margin });
  const mv = minValue(logisticsEstimate());
  $('#costKpis').innerHTML = `
    <div class="kpi"><div class="l">货值</div><div class="v">${money(r.tot.val)}</div><div class="s">${fmt(r.tot.qty)} 箱 · ${fmt(r.tot.cbm, 1)} m³ · ${fmt(r.tot.kg)} kg</div></div>
    <div class="kpi"><div class="l">物流费合计</div><div class="v">${money(r.logistics)}</div><div class="s">占货值 ${fmt(r.logisticsPct, 1)}%</div></div>
    <div class="kpi"><div class="l">关税 + 附加税</div><div class="v">${money(r.duty + r.surtax)}</div><div class="s">关税 ${money(r.duty)} · 附加 ${money(r.surtax)}</div></div>
    <div class="kpi"><div class="l">GST ${s.gst}%</div><div class="v">${money(r.gst)}</div><div class="s">${s.gstInCost ? '计入成本' : '可抵扣，不计入成本'}</div></div>
    <div class="kpi"><div class="l">落地成本</div><div class="v">${money(r.landed)}</div><div class="s">为货值的 ${fmt(r.tot.val ? r.landed / r.tot.val * 100 : 0, 1)}%</div></div>
    <div class="kpi"><div class="l">现金总支出</div><div class="v">${money(r.cashOut)}</div><div class="s">含 GST</div></div>`;
  const pct = r.logisticsPct, lim = s.minRatio;
  $('#costMsg').innerHTML = s.minMode === 'ratio'
    ? `<div class="msg ${pct <= 10 ? 'ok' : pct <= lim ? 'ok' : 'warn'}">物流费占货值 ${fmt(pct, 1)}%（你的上限 ${lim}%）${pct > lim ? '——这柜货值偏低，考虑加高价货或换柜型。' : pct <= 10 ? '——很健康。' : '——可以接受。'}</div>`
    : `<div class="msg ${r.tot.val >= mv ? 'ok' : 'warn'}">货值 ${money(r.tot.val)}，门槛 ${money(mv)}。</div>`;
  const cn = r.costs.map(c => c.name);
  let h = `<tr><th>货物</th><th>HS</th><th class="n">箱数</th><th class="n">m³</th><th class="n">kg</th><th class="n">计费吨</th><th>按</th><th class="n">货值</th>${cn.map(n => `<th class="n">${esc(n)}</th>`).join('')}<th class="n">关税</th><th class="n">附加税</th><th class="n">GST</th><th class="n">落地合计</th><th class="n">每箱物流费</th><th class="n">每箱落地成本</th><th class="n">建议售价/箱</th></tr>`;
  r.lines.forEach(l => {
    h += `<tr><td><span class="swatch" style="background:${l.color}"></span>${esc(l.name)}</td><td class="mono">${esc(l.hs)}</td><td class="n">${fmt(l.qty)}</td><td class="n">${fmt(l.tCbm, 2)}</td><td class="n">${fmt(l.tKg)}</td><td class="n">${fmt(l.wm, 2)}</td><td><span class="badge">${l.wmBy}</span></td><td class="n">${money(l.tVal)}</td>
      ${cn.map(n => `<td class="n">${money(l.alloc[n] || 0)}</td>`).join('')}
      <td class="n">${money(l.dutyAmt)}</td><td class="n">${money(l.surAmt)}</td><td class="n">${money(l.gstAmt)}</td><td class="n"><b>${money(l.landed)}</b></td><td class="n">${money(l.unitLogistics)}</td><td class="n"><b>${money(l.unitLanded)}</b></td><td class="n">${money(l.sell)}</td></tr>`;
  });
  h += `<tr class="sum"><td>合计</td><td></td><td class="n">${fmt(r.tot.qty)}</td><td class="n">${fmt(r.tot.cbm, 2)}</td><td class="n">${fmt(r.tot.kg)}</td><td class="n">${fmt(r.tot.wm, 2)}</td><td></td><td class="n">${money(r.tot.val)}</td>${r.costs.map(c => `<td class="n">${money(c.amountCAD)}</td>`).join('')}<td class="n">${money(r.duty)}</td><td class="n">${money(r.surtax)}</td><td class="n">${money(r.gst)}</td><td class="n">${money(r.landed)}</td><td></td><td></td><td></td></tr>`;
  $('#landedTable').innerHTML = h;
}
$('#exportCsv').onclick = () => {
  if (!lastCost) return;
  const r = lastCost, cn = r.costs.map(c => c.name);
  const rows = [['货物','HS','箱数','m3','kg','计费吨','按','货值CAD'].concat(cn, ['关税','附加税','GST','落地合计','每箱物流费','每箱落地成本','建议售价'])];
  r.lines.forEach(l => rows.push([l.name, l.hs, l.qty, l.tCbm.toFixed(3), l.tKg.toFixed(1), l.wm.toFixed(3), l.wmBy, l.tVal.toFixed(2)].concat(cn.map(n => (l.alloc[n] || 0).toFixed(2)), [l.dutyAmt.toFixed(2), l.surAmt.toFixed(2), l.gstAmt.toFixed(2), l.landed.toFixed(2), l.unitLogistics.toFixed(2), l.unitLanded.toFixed(2), l.sell.toFixed(2)])));
  UI.text('落地成本表（' + ct().name + '）', '复制后可以直接粘贴到 Excel / WPS 表格，或发到微信保存。', rows.map(r => r.map(c => String(c).replace(/[\t\n]/g, ' ')).join('\t')).join('\n'));
};

/* ---------- ④ 设置 ---------- */
function renderSettings(){
  const s = S.settings;
  $('#rateBox').innerHTML = currencies().map(c => `<label class="f"><span>1 ${c} =</span><span class="row" style="gap:4px"><input type="number" step="0.0001" data-cur="${c}" value="${s.rates[c]}" ${c === 'CAD' ? 'disabled' : ''}> CAD</span></label>`).join('') +
    `<label class="f"><span>加币种</span><span class="row" style="gap:4px"><input id="newCur" class="w50" placeholder="EUR"><button class="btn sm" id="addCur">加</button></span></label>`;
  $('#rateDate').textContent = s.ratesDate ? '更新：' + s.ratesDate : '';
  ['wmRatio','gst','eff','minRatio','minFixed'].forEach(k => $('#' + k).value = s[k]);
  $('#gstInCost').value = s.gstInCost ? '1' : '0'; $('#minMode').value = s.minMode;
  $('#mvRatioW').style.display = s.minMode === 'ratio' ? '' : 'none'; $('#mvFixedW').style.display = s.minMode === 'fixed' ? '' : 'none';
  $('#ctTable').innerHTML = `<tr><th>显示</th><th>名称</th><th class="n">内长 cm</th><th class="n">内宽 cm</th><th class="n">内高 cm</th><th class="n">容积 m³</th><th class="n">可装重量 kg</th><th class="n">海运费</th><th>币种</th><th></th></tr>` +
    S.containers.map(c => `<tr data-id="${c.id}"><td><input type="checkbox" data-k="on" ${c.on !== false ? 'checked' : ''}></td><td><input data-k="name" class="w120" value="${esc(c.name)}"></td>
      ${['L','W','H'].map(k => `<td class="n"><input type="number" data-k="${k}" step="0.1" value="${c[k]}"></td>`).join('')}<td class="n">${fmt(c.L * c.W * c.H / 1e6, 1)}</td>
      <td class="n"><input type="number" data-k="payload" step="100" value="${c.payload}"></td><td class="n"><input type="number" data-k="freight" value="${c.freight}"></td>
      <td><select data-k="freightCur">${sel(currencies(), c.freightCur)}</select></td><td>${['20gp','40gp','40hq'].includes(c.id) ? '' : '<button class="btn sm del" data-a="del">删除</button>'}</td></tr>`).join('');
  const lib = Object.entries(S.hsLib);
  $('#hsLibTable').innerHTML = lib.length ? `<tr><th>HS</th><th>说明</th><th class="n">关税%</th><th class="n">附加税%</th><th>核实日期</th><th></th></tr>` + lib.map(([k, v]) => `<tr data-k="${esc(k)}"><td class="mono">${esc(k)}</td><td>${esc(v.desc)}</td><td class="n">${v.duty}</td><td class="n">${v.surtax}</td><td>${esc(v.date || '')}</td><td><button class="btn sm del">删除</button></td></tr>`).join('')
    : '<tr><td class="muted">还没有。在货物库里改关税%后会自动存进来。</td></tr>';
}
$('#tab-settings').addEventListener('change', e => {
  const t = e.target, s = S.settings;
  if (t.dataset.cur) { s.rates[t.dataset.cur] = +t.value || 0; s.ratesDate = '手动 ' + new Date().toLocaleDateString('zh-CN'); }
  else if (['wmRatio','gst','eff','minRatio','minFixed'].includes(t.id)) s[t.id] = +t.value || 0;
  else if (t.id === 'gstInCost') s.gstInCost = t.value === '1';
  else if (t.id === 'minMode') s.minMode = t.value;
  else if (t.closest('#ctTable')) {
    const c = S.containers.find(x => x.id === t.closest('tr').dataset.id), k = t.dataset.k;
    c[k] = k === 'on' ? t.checked : (k === 'name' || k === 'freightCur') ? t.value : +t.value || 0;
  } else return;
  save(); renderSettings();
});
$('#tab-settings').addEventListener('click', e => {
  const t = e.target;
  if (t.id === 'addCur') { const c = ($('#newCur').value || '').trim().toUpperCase(); if (c && !S.settings.rates[c]) { S.settings.rates[c] = 1; save(); renderSettings(); } }
  if (t.dataset.a === 'del' && t.closest('#ctTable')) { const id = t.closest('tr').dataset.id; S.containers = S.containers.filter(c => c.id !== id); if (S.plan.ctId === id) S.plan.ctId = S.containers[0].id; save(); renderSettings(); }
  if (t.classList.contains('del') && t.closest('#hsLibTable')) { delete S.hsLib[t.closest('tr').dataset.k]; save(); renderSettings(); }
});
$('#addCt').onclick = () => { S.containers.push({ id: uid(), name: '自定义柜', L: 1200, W: 235, H: 260, payload: 26000, freight: 0, freightCur: 'USD', on: true }); save(); renderSettings(); };
$('#exportJson').onclick = () => UI.text('数据备份 ' + new Date().toISOString().slice(0, 10), '点“复制”，然后粘贴发到微信“文件传输助手”保存。恢复时用“粘贴备份”。', JSON.stringify(S));
function restore(t){ try { const d = JSON.parse(t); if (!d || !Array.isArray(d.products)) throw new Error(); S = d; normalize(); if (CLOUD) { save(); renderAll(); UI.alert('已恢复，并同步到云端。'); return; } try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} location.reload(); } catch (e) { UI.alert('内容格式不对，请粘贴完整的备份文本（以 { 开头）。'); } }
$('#importPaste').onclick = () => UI.prompt('粘贴备份内容', '', true).then(t => { if (t) UI.confirm('恢复备份会覆盖当前所有数据，继续？', '覆盖并恢复').then(ok => ok && restore(t.trim())); });
$('#importJson').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => UI.confirm('恢复备份会覆盖当前所有数据，继续？', '覆盖并恢复').then(ok => ok && restore(t)));
};
$('#resetAll').onclick = () => UI.confirm('清空所有数据并恢复示例？建议先备份。', '清空').then(ok => { if (!ok) return; try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); });

/* ---------- 启动 ---------- */
function activeTab(){ const b = $('#nav button.on'); return b ? b.dataset.t : 'products'; }
function renderAll(){
  renderSaved();
  const t = activeTab();
  if (t === 'products') renderProducts(); else if (t === 'plan') renderPlan(); else if (t === 'cost') renderCost(); else renderSettings();
}
renderProducts(); renderSaved();
window.__S = () => S;

/* ---------- 只读模式 ---------- */
const RO_OK = ['hsQuery', 'showShell', 'ctSel', 'loadPlan'];
function applyRO(){
  document.body.classList.toggle('ro', RO);
  $('#roBar').hidden = !RO;
  if (!RO) return;
  $$('main input, main select, main textarea').forEach(el => { if (!RO_OK.includes(el.id)) el.disabled = true; });
}
let roQueued = false;
new MutationObserver(() => { if (RO && !roQueued) { roQueued = true; queueMicrotask(() => { roQueued = false; applyRO(); }); } }).observe($('main'), { childList: true, subtree: true });

/* ---------- 同步状态小标签 ---------- */
function setSync(st){
  const p = $('#syncPill'); if (!CLOUD) { p.hidden = true; return; }
  if (st && st !== 'ro') CLOUD.st = st;
  const k = RO ? 'ro' : (!navigator.onLine ? 'off' : CLOUD.st || 'loading');
  const txt = { ro: '只读', off: '离线', ok: '已同步', saving: '保存中…', loading: '同步中…', err: '同步失败' }[k];
  p.hidden = false; p.className = 'pill ' + k; p.querySelector('b').textContent = txt;
}
addEventListener('online', () => setSync()); addEventListener('offline', () => setSync());

/* ---------- 云同步（Firebase Firestore） ----------
   planner/config   设置、柜型、费用、HS 库
   planner/current  当前装柜方案和结果
   products/{id}    每种货物一条
   plans/{id}       保存的方案
   只改动过的那几条才会写入；只有在本机明确删除的货物/方案才会从云端删除。 */
if (window.FIREBASE_CONFIG && window.firebase && firebase.firestore && firebase.auth) (function(){
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
  const C = CLOUD = { auth, db, user: null, ready: false, dirty: false, st: 'loading', sy: { config: null, current: null, products: {}, plans: {} }, parts: {}, queued: {}, unsub: [], renderLater: false };
  const clean = o => JSON.parse(JSON.stringify(o === undefined ? null : o));
  const cfgOf = () => clean({ settings: S.settings, containers: S.containers, costs: S.costs, hsLib: S.hsLib, seeded: S.seeded });
  const curOf = () => clean({ plan: S.plan, last: S.last || null });
  const rowOf = (x, i) => clean(Object.assign({}, x, { order: i }));
  const strip = d => { const o = Object.assign({}, d); delete o.order; return o; };
  const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = sortKeys(v[k]), o), {}) : v;
  const stable = v => JSON.stringify(sortKeys(v));

  /* 登录 */
  const showLogin = on => { $('#login').hidden = !on; if (on) setTimeout(() => $('#lEmail').focus(), 50); };
  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const em = $('#lEmail').value.trim(), pw = $('#lPass').value;
    if (!em || !pw) { $('#lErr').textContent = '请填写邮箱和密码'; return; }
    $('#lBtn').disabled = true; $('#lBtn').textContent = '登录中…'; $('#lErr').textContent = '';
    auth.signInWithEmailAndPassword(em, pw).catch(err => {
      const m = { 'auth/invalid-credential': '邮箱或密码不对', 'auth/wrong-password': '邮箱或密码不对', 'auth/user-not-found': '没有这个账号，请找管理员开通', 'auth/invalid-email': '邮箱格式不对', 'auth/too-many-requests': '尝试次数太多，请稍后再试', 'auth/network-request-failed': '网络连接失败，请检查网络' }[err.code];
      $('#lErr').textContent = m || ('登录失败：' + (err.message || err.code));
    }).finally(() => { $('#lBtn').disabled = false; $('#lBtn').textContent = '登录'; });
  });

  function renderAcct(){
    const a = $('#acct'); a.hidden = false;
    a.innerHTML = `<span>已登录：<b>${esc(C.user.email || '')}</b></span><span class="badge ${RO ? '' : 'ok'}">${RO ? '只读' : '可编辑'}</span><button class="btn sm" id="logout">退出登录</button>`;
    $('#logout').onclick = () => UI.confirm('退出登录？', '退出').then(ok => ok && auth.signOut());
    $('#dataNote').innerHTML = '数据保存在云端，电脑、手机打开看到的都是同一份，改动几秒内同步。“备份”仍然可以用来留一份底。';
    $('#resetAll').hidden = true;
    $('#prodHint').textContent = '每种货录一次，单位、币种可以各自选；数据保存在云端，自动同步';
  }

  /* 远端 → 本机 */
  function applyPart(name, data, force){
    if (name === 'config') {
      if (!data) return false;
      const str = stable(data); if (str === C.sy.config && !force) return false;
      ['settings', 'containers', 'costs', 'hsLib', 'seeded'].forEach(k => { if (data[k] !== undefined) S[k] = data[k]; });
      C.sy.config = str; return true;
    }
    if (name === 'current') {
      if (!data) return false;
      const str = stable(data); if (str === C.sy.current && !force) return false;
      if (data.plan) S.plan = data.plan; S.last = data.last || null;
      C.sy.current = str; return true;
    }
    const key = name === 'products' ? 'products' : 'plans';
    const map = {}; data.forEach(d => map[d.id] = stable(d));
    const same = !force && Object.keys(map).length === Object.keys(C.sy[key]).length && Object.keys(map).every(id => map[id] === C.sy[key][id]);
    if (same) return false;
    const list = data.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(strip);
    if (name === 'products') S.products = list; else S.saved = list;
    C.sy[key] = map; return true;
  }
  function onRemote(name, data){
    C.parts[name] = data;
    if (!C.ready) { tryReady(); return; }
    if (C.dirty) { C.queued[name] = data; return; }       // 本机有没保存的改动：先保存，再合并
    if (applyPart(name, data)) { normalize(); requestRender(); }
  }
  function requestRender(){
    const a = document.activeElement;
    if (a && a.closest && a.closest('main') && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && !RO) { C.renderLater = true; return; }
    renderAll();
  }
  document.addEventListener('focusout', () => { if (C.renderLater) setTimeout(() => { if (C.renderLater && !(document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) { C.renderLater = false; renderAll(); } }, 0); });

  function tryReady(){
    const P = C.parts;
    if (P.config === undefined || P.current === undefined || P.products === undefined || P.plans === undefined || C.role === undefined) return;
    if (P.config === null) {
      if (RO) { $('#planMsg').innerHTML = ''; UI.alert('云端还没有数据。请管理员先登录一次，数据会自动上传。'); C.ready = true; setSync('ok'); return; }
      // 第一次：把本机现有的数据整份上传
      C.ready = true; normalize(); C.dirty = true; cloudPush(); renderAll();
      UI.alert('第一次登录：已把这台设备上的数据上传到云端。以后电脑、手机都用这份。');
      return;
    }
    ['config', 'current', 'products', 'plans'].forEach(n => applyPart(n, P[n], true));
    if (normalize() && !RO) { C.ready = true; save(); } else C.ready = true;
    renderAll(); setSync('ok');
  }

  /* 本机 → 远端（只写变动的部分） */
  window.cloudPush = function(){
    clearTimeout(saveT);
    if (RO || !C.ready) return;
    const sy = C.sy, b = db.batch(), wrote = {}; let n = 0;
    const cfg = cfgOf(), cs = stable(cfg);
    if (cs !== sy.config) { b.set(db.doc('planner/config'), cfg); sy.config = cs; wrote.config = 1; n++; }
    const cur = curOf(), us = stable(cur);
    if (us !== sy.current) { b.set(db.doc('planner/current'), cur); sy.current = us; wrote.current = 1; n++; }
    [['products', S.products, 'products'], ['plans', S.saved, 'plans']].forEach(([coll, list, key]) => {
      const seen = {};
      list.forEach((x, i) => {
        if (!x.id) x.id = uid();
        const o = rowOf(x, i), str = stable(o); seen[x.id] = 1;
        if (sy[key][x.id] !== str) { b.set(db.collection(coll).doc(x.id), o); sy[key][x.id] = str; wrote[key] = 1; n++; }
      });
      Object.keys(sy[key]).forEach(id => { if (!seen[id]) { b.delete(db.collection(coll).doc(id)); delete sy[key][id]; wrote[key] = 1; n++; } });
    });
    C.dirty = false;
    const q = C.queued; C.queued = {};
    Object.keys(q).forEach(name => { if (!wrote[name] && applyPart(name, q[name])) { normalize(); requestRender(); } });
    if (!n) { setSync('ok'); return; }
    b.commit().then(() => setSync('ok')).catch(err => {
      setSync('err');
      UI.alert(err && err.code === 'permission-denied' ? '保存失败：这个账号没有修改权限。' : '保存到云端失败：' + ((err && err.message) || err) + '\n联网后再改一次即可重试。');
    });
  };

  function listen(){
    const onErr = err => { setSync('err'); if (err && err.code === 'permission-denied') UI.alert('这个账号没有查看权限，请联系管理员。'); };
    C.unsub.push(db.doc('planner/config').onSnapshot(d => onRemote('config', d.exists ? d.data() : null), onErr));
    C.unsub.push(db.doc('planner/current').onSnapshot(d => onRemote('current', d.exists ? d.data() : null), onErr));
    C.unsub.push(db.collection('products').onSnapshot(q => onRemote('products', q.docs.map(d => Object.assign({ id: d.id }, d.data()))), onErr));
    C.unsub.push(db.collection('plans').onSnapshot(q => onRemote('plans', q.docs.map(d => Object.assign({ id: d.id }, d.data()))), onErr));
  }

  auth.onAuthStateChanged(user => {
    C.unsub.forEach(f => { try { f(); } catch (e) {} }); C.unsub = [];
    C.ready = false; C.parts = {}; C.queued = {}; C.dirty = false; C.sy = { config: null, current: null, products: {}, plans: {} }; C.role = undefined;
    C.user = user;
    if (!user) { showLogin(true); $('#syncPill').hidden = true; return; }
    showLogin(false); RO = true; applyRO(); setSync('loading');
    // 判断有没有修改权限：试写一条“最近打开”记录（规则只允许管理员写）
    let done = false;
    const finish = editor => { if (done) return; done = true; C.role = editor ? 'editor' : 'viewer'; RO = !editor; applyRO(); renderAcct(); renderSaved(); setSync(); tryReady(); };
    db.doc('planner/access').set({ ['open_' + user.uid]: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .then(() => finish(true), () => finish(false));
    setTimeout(() => finish(false), 8000);   // 没网时先按只读打开
    listen();
  });
  showLogin(false);
})();
})();
