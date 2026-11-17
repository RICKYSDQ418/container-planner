/* ===== 装柜 + 成本 计算引擎（无界面，可单独复用到以后的 App） ===== */
(function (root) {
  'use strict';

  /* ---------- 单位换算：内部统一 cm / kg / CAD ---------- */
  const DIM = { cm: 1, mm: 0.1, m: 100, in: 2.54 };
  const WT = { kg: 1, lb: 0.45359237 };
  function toCm(v, u) { return (+v || 0) * (DIM[u] || 1); }
  function toKg(v, u) { return (+v || 0) * (WT[u] || 1); }
  function toCAD(v, cur, rates) { return (+v || 0) * ((rates && rates[cur]) || 1); }

  /* 货物标准化：返回 cm/kg/CAD 的单箱数据 */
  function norm(p, rates) {
    const l = toCm(p.L, p.dimUnit), w = toCm(p.W, p.dimUnit), h = toCm(p.H, p.dimUnit);
    return {
      id: p.id, name: p.name, d: [l, w, h],
      cbm: l * w * h / 1e6,
      kg: toKg(p.weight, p.wtUnit),
      val: toCAD(p.price, p.currency, rates),
      duty: +p.dutyRate || 0, surtax: +p.surtaxRate || 0,
      noRotate: !!p.noRotate,
    };
  }

  /* ---------- 3D 装箱：块堆叠 + 空间切分（guillotine）启发式 ---------- */
  function orients(d, noRotate) {
    const [a, b, c] = d;
    const list = noRotate
      ? [[a, b, c], [b, a, c]]                    // 只允许水平转向，不能侧放/倒放
      : [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
    const seen = {}, out = [];
    list.forEach(o => { const k = o.join(','); if (!seen[k]) { seen[k] = 1; out.push(o); } });
    return out;
  }

  function packOnce(C, items, variant) {
    const rem = items.map((it, i) => Object.assign({}, it, { left: it.qty, idx: i }));
    const minDim = Math.min.apply(null, items.map(it => Math.min.apply(null, it.d)));
    let spaces = [{ x: 0, y: 0, z: 0, L: C.L, W: C.W, H: C.H }];
    let wUsed = 0;
    const blocks = [];
    const key = variant.order === 'xzy'
      ? s => [s.x, s.z, s.y] : s => [s.x, s.y, s.z];
    let guard = 0;
    while (spaces.length && guard++ < 200000) {
      // 取最靠里、最低的空间
      let si = 0, bk = key(spaces[0]);
      for (let i = 1; i < spaces.length; i++) {
        const k = key(spaces[i]);
        if (k[0] < bk[0] - 1e-6 || (Math.abs(k[0] - bk[0]) < 1e-6 && (k[1] < bk[1] - 1e-6 || (Math.abs(k[1] - bk[1]) < 1e-6 && k[2] < bk[2])))) { si = i; bk = k; }
      }
      const s = spaces.splice(si, 1)[0];
      let best = null;
      for (const it of rem) {
        if (it.left <= 0) continue;
        const byW = it.kg > 0 ? Math.floor((C.payload - wUsed) / it.kg + 1e-9) : Infinity;
        const cap = Math.min(it.left, byW);
        if (cap <= 0) continue;
        for (const o of orients(it.d, it.noRotate)) {
          const [l, w, h] = o;
          if (l > s.L + 1e-6 || w > s.W + 1e-6 || h > s.H + 1e-6) continue;
          const nx = Math.floor(s.L / l + 1e-9), ny = Math.floor(s.W / w + 1e-9), nz = Math.floor(s.H / h + 1e-9);
          const wall = ny * nz;
          let bx, by, bz;
          if (cap >= wall) { bx = Math.min(nx, Math.floor(cap / wall)); by = ny; bz = nz; }
          else if (cap >= ny) { bx = 1; by = ny; bz = Math.floor(cap / ny); }
          else { bx = 1; by = cap; bz = 1; }
          const n = bx * by * bz, vol = n * l * w * h;
          const cross = (by * w * bz * h) / (s.W * s.H);
          let score;
          if (variant.score === 'vol') score = vol;
          else if (variant.score === 'cross') score = cross * 1e3 + vol / (s.L * s.W * s.H);
          else score = vol * (0.3 + cross);
          if (!best || score > best.score) best = { it, o, bx, by, bz, n, score };
        }
      }
      if (!best) continue;
      const { it, o, bx, by, bz, n } = best;
      const [l, w, h] = o;
      blocks.push({ pid: it.id, idx: it.idx, x: s.x, y: s.y, z: s.z, l, w, h, bx, by, bz, n });
      it.left -= n; wUsed += n * it.kg;
      const BL = bx * l, BW = by * w, BH = bz * h;
      const add = sp => { if (sp.L >= minDim - 1e-6 && sp.W >= minDim - 1e-6 && sp.H >= minDim - 1e-6) spaces.push(sp); };
      add({ x: s.x, y: s.y, z: s.z + BH, L: BL, W: BW, H: s.H - BH });       // 块上方
      add({ x: s.x, y: s.y + BW, z: s.z, L: BL, W: s.W - BW, H: s.H });       // 块侧边
      add({ x: s.x + BL, y: s.y, z: s.z, L: s.L - BL, W: s.W, H: s.H });      // 块前方
    }
    const placed = {};
    let vol = 0;
    blocks.forEach(b => { placed[b.pid] = (placed[b.pid] || 0) + b.n; vol += b.n * b.l * b.w * b.h; });
    const allIn = rem.every(it => it.left <= 0);
    return { blocks, placed, vol, kg: wUsed, allIn, left: rem.reduce((a, it) => a + Math.max(0, it.left), 0) };
  }

  const VARIANTS = [
    { order: 'xzy', score: 'mix' }, { order: 'xyz', score: 'mix' },
    { order: 'xzy', score: 'vol' }, { order: 'xyz', score: 'vol' },
    { order: 'xzy', score: 'cross' }, { order: 'xyz', score: 'cross' },
  ];

  /* C: {L,W,H (cm), payload (kg)}; items: [{id, d:[l,w,h], kg, qty, noRotate}] */
  function pack(C, items) {
    items = items.filter(it => it.qty > 0);
    if (!items.length) return { blocks: [], placed: {}, vol: 0, kg: 0, allIn: true, left: 0 };
    let best = null;
    const orders = [items, items.slice().sort((a, b) => b.d[0] * b.d[1] * b.d[2] - a.d[0] * a.d[1] * a.d[2])];
    for (const its of orders) for (const v of VARIANTS) {
      const r = packOnce(C, its, v);
      if (!best || (r.allIn && !best.allIn) || (r.allIn === best.allIn && r.vol > best.vol + 1e-6)) best = r;
      if (best.allIn && its === orders[0] && v === VARIANTS[0]) { /* 继续试，取最紧凑 */ }
    }
    return best;
  }

  /* 单一货物最多能装多少 */
  function maxSingle(C, it) {
    const byVol = Math.floor((C.L * C.W * C.H) / (it.d[0] * it.d[1] * it.d[2]));
    const byWt = it.kg > 0 ? Math.floor(C.payload / it.kg) : Infinity;
    const q = Math.min(byVol, byWt);
    if (!isFinite(q) || q <= 0) return { qty: 0, limit: '放不下' };
    const r = pack(C, [Object.assign({}, it, { qty: q })]);
    const n = r.placed[it.id] || 0;
    return { qty: n, limit: (byWt <= byVol && n >= byWt) ? '重量' : '体积/尺寸' };
  }

  /* ---------- 自动配货优化（线性规划 + 实际装箱校验） ---------- */
  function solveLP(LP, prods, C, eta, opt) {
    // prods: [{id, cbm, kg, val, min, max, ratio}]
    const Vcap = C.L * C.W * C.H / 1e6 * eta, Wcap = C.payload;
    const model = { optimize: 'obj', opType: 'max', constraints: { vol: { max: Vcap }, wt: { max: Wcap } }, variables: {} };
    if (opt.objective === 'ratio') {
      const v = { obj: 1, vol: 0, wt: 0, val: 0 };
      prods.forEach(p => { const r = p.ratio || 0; v.vol += r * p.cbm; v.wt += r * p.kg; v.val += r * p.val; });
      model.variables.k = v;
      if (opt.minValue > 0 && opt.useValue) model.constraints.val = { min: opt.minValue };
      const res = LP.Solve(model);
      if (!res.feasible) return null;
      const k = res.k || 0;
      return prods.map(p => k * (p.ratio || 0));
    }
    prods.forEach((p, i) => {
      const obj = opt.objective === 'value' ? p.val : (p.cbm / Vcap + p.kg / Wcap);
      const v = { obj, vol: p.cbm, wt: p.kg, val: p.val };
      v['b' + i] = 1;
      model.variables['q' + i] = v;
      const c = {};
      if (p.min > 0) c.min = p.min;
      if (isFinite(p.max)) c.max = p.max;
      if (c.min != null || c.max != null) model.constraints['b' + i] = c;
    });
    if (opt.minValue > 0 && opt.useValue) model.constraints.val = { min: opt.minValue };
    const res = LP.Solve(model);
    if (!res.feasible) return null;
    return prods.map((p, i) => res['q' + i] || 0);
  }

  function integerize(q, prods, C, eta, opt) {
    const Vcap = C.L * C.W * C.H / 1e6 * eta, Wcap = C.payload;
    let out = q.map((x, i) => Math.max(Math.floor(x + 1e-6), prods[i].min || 0));
    if (opt.objective === 'ratio') return out;
    const coef = prods.map(p => opt.objective === 'value' ? p.val : (p.cbm / Vcap + p.kg / Wcap));
    const sum = () => out.reduce((a, n, i) => ({ v: a.v + n * prods[i].cbm, w: a.w + n * prods[i].kg }), { v: 0, w: 0 });
    let s = sum();
    const order = prods.map((p, i) => i).sort((a, b) => coef[b] - coef[a]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const i of order) {
        const p = prods[i];
        if (out[i] + 1 > p.max) continue;
        if (s.v + p.cbm <= Vcap + 1e-9 && s.w + p.kg <= Wcap + 1e-9) { out[i]++; s.v += p.cbm; s.w += p.kg; changed = true; break; }
      }
    }
    return out;
  }

  /* prods 需带 d:[l,w,h], noRotate；返回最佳方案 */
  function optimize(LP, C, prods, opt) {
    const Vc = C.L * C.W * C.H / 1e6;
    // “每种至少占 x% 柜容”——让方案更均衡
    if (opt.minShare > 0 && opt.objective !== 'ratio') {
      prods = prods.map(p => Object.assign({}, p, { min: Math.max(p.min || 0, Math.ceil(Vc * opt.minShare / 100 / p.cbm)) }));
    }
    const mkItems = q => prods.map((p, i) => ({ id: p.id, d: p.d, kg: p.kg, noRotate: p.noRotate, qty: q[i] }));
    const stats = q => q.reduce((a, n, i) => ({ v: a.v + n * prods[i].cbm, w: a.w + n * prods[i].kg, val: a.val + n * prods[i].val }), { v: 0, w: 0, val: 0 });
    const score = q => {
      const s = stats(q);
      const base = opt.objective === 'value' ? s.val : opt.objective === 'ratio' ? Math.min.apply(null, q.map((n, i) => prods[i].ratio > 0 ? n / prods[i].ratio : Infinity)) : (s.v / Vc + s.w / C.payload);
      const valOk = !(opt.minValue > 0) || s.val >= opt.minValue - 1e-6;
      const minOk = q.every((n, i) => n >= (prods[i].min || 0));
      return { base, valOk, minOk, s };
    };
    const better = (a, b) => {               // a 是否优于 b
      if (!b) return true;
      if (a.minOk !== b.minOk) return a.minOk;
      if (a.valOk !== b.valOk) return a.valOk;
      return a.base > b.base + 1e-9;
    };
    let best = null, bestSc = null, lpValueOk = true;
    const start = Math.min(0.99, (opt.eff || 0.95) + 0.04);
    for (let eta = start; eta >= 0.5; eta -= 0.02) {
      let q = solveLP(LP, prods, C, eta, Object.assign({}, opt, { useValue: true }));
      if (!q) { lpValueOk = false; q = solveLP(LP, prods, C, eta, Object.assign({}, opt, { useValue: false })); }
      if (!q) { if (!best) continue; else break; }
      const qi = integerize(q, prods, C, eta, opt);
      const r = pack(C, mkItems(qi));
      const placedQ = prods.map(p => r.placed[p.id] || 0);
      const sc = score(placedQ);
      if (better(sc, bestSc)) { best = { qty: placedQ, packing: r, eta }; bestSc = sc; }
      if (r.allIn) break;
    }
    if (!best) return { error: '无解：每种货物的“最少数量”加起来已经超过柜子容量，请调低' };
    // 补装：在已排好的基础上再尝试多塞（按目标优先级、二分步长）
    if (opt.objective !== 'ratio') {
      const coef = prods.map(p => opt.objective === 'value' ? p.val : (p.cbm / Vc + p.kg / C.payload));
      const order = prods.map((p, i) => i).sort((a, b) => coef[b] - coef[a]);
      for (const i of order) {
        let step = 64;
        while (step >= 1) {
          if (best.qty[i] + step > prods[i].max) { step = Math.floor(step / 2); continue; }
          const q2 = best.qty.slice(); q2[i] += step;
          const r = pack(C, mkItems(q2));
          if (r.allIn) { best = { qty: q2, packing: r, eta: best.eta }; } else step = Math.floor(step / 2);
        }
      }
    } else {
      // 按比例模式：整体等比放大直到装不下
      const ks = best.qty.map((n, i) => prods[i].ratio > 0 ? n / prods[i].ratio : Infinity);
      let t = Math.min.apply(null, ks), step = Math.max(t * 0.08, 0.05);
      const mk = t => prods.map(p => Math.min(p.max, Math.round((p.ratio || 0) * t)));
      if (isFinite(t)) {
        let ok = best;
        while (step > t * 0.002) {
          const q2 = mk(t + step), r = pack(C, mkItems(q2));
          if (r.allIn) { t += step; ok = { qty: q2, packing: r, eta: best.eta }; } else step /= 2;
        }
        best = ok;
      }
    }
    const sc = score(best.qty);
    return { qty: best.qty, packing: best.packing, eta: best.eta, valueOk: sc.valOk, minOk: sc.minOk, value: sc.s.val, lpValueOk };
  }

  /* ---------- 成本计算与运费分摊 ---------- */
  /* lines: [{id,name,qty,cbm,kg,val (单件CAD), duty%, surtax%}]
     costs: [{name, amountCAD, basis: wm|value|qty|cbm|kg}]
     s: {wmRatio (kg/CBM), gst %, gstInCost, insurance:{on, rate%, markup%}} */
  function costing(lines, costs, s) {
    const L = lines.filter(l => l.qty > 0).map(l => {
      const cbm = l.qty * l.cbm, kg = l.qty * l.kg, value = l.qty * l.val;
      const wm = Math.max(cbm, kg / (s.wmRatio || 1000));
      return Object.assign({}, l, { tCbm: cbm, tKg: kg, tVal: value, wm, wmBy: cbm >= kg / (s.wmRatio || 1000) ? '体积' : '重量', alloc: {}, allocSum: 0 });
    });
    const tot = { qty: 0, cbm: 0, kg: 0, val: 0, wm: 0 };
    L.forEach(l => { tot.qty += l.qty; tot.cbm += l.tCbm; tot.kg += l.tKg; tot.val += l.tVal; tot.wm += l.wm; });
    const basisVal = (l, b) => b === 'value' ? l.tVal : b === 'qty' ? l.qty : b === 'cbm' ? l.tCbm : b === 'kg' ? l.tKg : l.wm;
    const basisTot = b => b === 'value' ? tot.val : b === 'qty' ? tot.qty : b === 'cbm' ? tot.cbm : b === 'kg' ? tot.kg : tot.wm;
    const allCosts = costs.slice();
    const freightCAD = costs.filter(c => c.isFreight).reduce((a, c) => a + c.amountCAD, 0);
    if (s.insurance && s.insurance.on) {
      allCosts.push({ name: '货物保险（自动）', amountCAD: (tot.val + freightCAD) * (s.insurance.markup / 100) * (s.insurance.rate / 100), basis: 'value', auto: true });
    }
    let logistics = 0;
    allCosts.forEach(c => {
      logistics += c.amountCAD;
      const bt = basisTot(c.basis);
      L.forEach(l => {
        const a = bt > 0 ? c.amountCAD * basisVal(l, c.basis) / bt : 0;
        l.alloc[c.name] = (l.alloc[c.name] || 0) + a; l.allocSum += a;
      });
    });
    let dutyT = 0, surT = 0, gstT = 0, landedT = 0;
    L.forEach(l => {
      l.dutyAmt = l.tVal * l.duty / 100;              // 完税价按货价（FOB）计
      l.surAmt = l.tVal * l.surtax / 100;
      l.gstAmt = (l.tVal + l.dutyAmt + l.surAmt) * (s.gst / 100);
      l.landed = l.tVal + l.allocSum + l.dutyAmt + l.surAmt + (s.gstInCost ? l.gstAmt : 0);
      l.unitLanded = l.landed / l.qty;
      l.unitLogistics = l.allocSum / l.qty;
      l.sell = s.margin < 100 ? l.unitLanded / (1 - s.margin / 100) : 0;
      dutyT += l.dutyAmt; surT += l.surAmt; gstT += l.gstAmt; landedT += l.landed;
    });
    return {
      lines: L, costs: allCosts, tot, logistics, duty: dutyT, surtax: surT, gst: gstT,
      landed: landedT, cashOut: tot.val + logistics + dutyT + surT + gstT,
      logisticsPct: tot.val > 0 ? logistics / tot.val * 100 : 0,
    };
  }

  root.CPEngine = { DIM, WT, toCm, toKg, toCAD, norm, orients, pack, packOnce, maxSingle, optimize, costing };
  if (typeof module !== 'undefined') module.exports = root.CPEngine;
})(typeof window !== 'undefined' ? window : globalThis);
