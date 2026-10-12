// Klick på ett belopp i Kvar-kolumnen öppnar en meny med två lägen:
// "En månad" lägger hela beloppet på en av de fyra första öppna månaderna,
// "Fördela" sprider det över 1–12 öppna månader (jämnt, kurva, eget m.m.).
// Månader man skriver in ett belopp i låses, och resten fördelas alltid på de
// olåsta månaderna enligt vald form, så det blir aldrig något kvar.
// Månader utanför vyn räknas med. Sparar via appens API och laddar om listan.
// Körs i sidans egen JS-värld (MAIN) för att kunna läsa projektdata och
// appens query-cache.
(() => {
  if (window.top !== window) return;
  const SINGLE = 4;
  const MAX = 12;
  const TEAL = "#0d9488";
  let menu = null;

  const num = (s) => Number((s || "").replace(/[\s  %]/g, "").replace("−", "-").replace(",", "."));
  const fmt = (n) => Math.round(n).toLocaleString("sv-SE");
  const round = (n) => Math.round(n * 100) / 100;
  const nextMonth = (m) => (m % 100 === 12 ? (Math.floor(m / 100) + 1) * 100 + 1 : m + 1);
  const monthName = (m) => new Date(Math.floor(m / 100), (m % 100) - 1).toLocaleDateString("sv-SE", { month: "short", year: "numeric" });
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  // Lägger in tusentalsmellanslag medan man skriver och behåller markörens plats.
  const liveFormat = (inp) => {
    const v = inp.value;
    const m = v.replace(/\s/g, "").match(/^([−-]?)(\d*)(,\d*)?(%?)$/);
    if (!m) return;
    const out = m[1] + (m[2] ? Number(m[2]).toLocaleString("sv-SE") : "") + (m[3] || "") + m[4];
    if (out === v) return;
    const before = v.slice(0, inp.selectionStart).replace(/\s/g, "").length;
    let i = 0;
    for (let c = 0; i < out.length && c < before; i++) if (!/\s/.test(out[i])) c++;
    inp.value = out;
    inp.setSelectionRange(i, i);
  };

  // Vikter per månad för varje förval. "Egen" är en normalfördelning med topp vid
  // månadsindex "peak" (decimaltal, styrs med reglaget, standard mitt i perioden).
  const PRESETS = {
    "Jämnt": () => 1,
    "Framtungt": (i, n) => n - i,
    "Baktungt": (i) => i + 1,
    "Egen": (i, n, peak) => Math.exp(-((i - peak) ** 2) / (2 * Math.max(n / 4, 0.5) ** 2)),
  };

  const css = `
.rrk{position:fixed;z-index:2147483647;background:#fff;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:8px;font:12px system-ui,sans-serif;color:#1e293b;min-width:240px;max-height:calc(100vh - 16px);overflow:auto}
.rrk button{font:inherit;cursor:pointer;color:inherit}
.rrk-seg{display:flex;gap:2px;background:#f1f5f9;border-radius:6px;padding:2px;margin-bottom:8px}
.rrk-seg button{flex:1;border:0;background:none;padding:5px;border-radius:5px;color:#64748b}
.rrk-seg button.on{background:#fff;color:#1e293b;font-weight:600;box-shadow:0 0 0 1px #e2e8f0}
.rrk-head{padding:2px 6px 6px;color:#64748b}
.rrk-pick{display:flex;justify-content:space-between;gap:16px;width:100%;padding:6px;border:0;border-radius:6px;background:none;text-align:left}
.rrk-pick:hover{background:#f1f5f9}
.rrk-num{color:${TEAL};font-variant-numeric:tabular-nums}
.rrk-bar-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;color:#64748b}
.rrk-step{display:flex;gap:6px;align-items:center;color:#1e293b}
.rrk-step button{width:24px;height:24px;border:1px solid #e2e8f0;border-radius:6px;background:#fff}
.rrk-chips{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
.rrk-chips button{border:1px solid #e2e8f0;background:#fff;border-radius:999px;padding:3px 10px}
.rrk-chips button.on{background:#ccfbf1;border-color:${TEAL};color:#115e59}
.rrk-peak{display:grid;grid-template-columns:auto 1fr 84px;gap:8px;align-items:center;margin-bottom:8px;color:#64748b}
.rrk-peak input{width:100%;accent-color:${TEAL}}
.rrk-peak b{color:#1e293b;text-align:right;font-weight:600}
.rrk-row{display:grid;grid-template-columns:64px 1fr 84px 34px 16px;gap:8px;align-items:center;padding:3px 0}
.rrk-row small{display:block;color:#94a3b8;font-size:10px}
.rrk-track{height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden}
.rrk-track i{display:block;height:100%;background:${TEAL}}
.rrk-row input{height:24px;border:1px solid #e2e8f0;border-radius:6px;text-align:right;padding:0 6px;font:inherit;font-variant-numeric:tabular-nums;width:100%;box-sizing:border-box}
.rrk-row input.lock{border-color:${TEAL};background:#f0fdfa}
.rrk-pct{color:#94a3b8;text-align:right}
.rrk-lock{border:0;background:none;padding:0;font-size:11px;line-height:1}
.rrk-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid #e2e8f0;margin-top:6px;padding-top:8px}
.rrk-foot button{border:1px solid #e2e8f0;background:#fff;border-radius:6px;padding:4px 8px}
.rrk-foot .rrk-save{background:${TEAL};border-color:${TEAL};color:#fff}
.rrk-msg{margin-top:6px;color:#dc2626}`;

  const close = () => { menu?.remove(); menu = null; };

  const fiber = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactFiber"))];

  const projectOf = (tr) => {
    for (let f = fiber(tr); f; f = f.return) {
      const o = f.memoizedProps?.row?.original;
      if (o?._id && o.allocationMonthMap) return o;
    }
    return null;
  };

  const queryClient = (el) => {
    for (let f = fiber(el); f; f = f.return) {
      const c = f.memoizedProps?.client;
      if (c && typeof c.invalidateQueries === "function") return c;
    }
    return null;
  };

  const trpc = async (path, input, post) => {
    const url = `/trpc/${path}?batch=1` + (post ? "" : `&input=${encodeURIComponent(JSON.stringify({ 0: input ?? {} }))}`);
    const res = await fetch(url, post
      ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ 0: input }) }
      : undefined);
    const json = await res.json();
    if (!res.ok || json[0]?.error) throw new Error(json[0]?.error?.message || res.status);
    return json[0].result.data;
  };

  const latestClosed = async (client) =>
    Number(client?.getQueryData([["calendars", "getLatestClosedMonth"], { type: "query" }])
      ?? (await trpc("calendars.getLatestClosedMonth")));

  const openMonths = (project, closedUntil) => {
    const out = [];
    for (let m = nextMonth(closedUntil); out.length < MAX; m = nextMonth(m)) {
      const a = project.allocationMonthMap[m];
      if (a?.closed) continue;
      out.push({ month: m, alloc: a, value: a?.revenue ?? 0 });
    }
    return out;
  };

  const save = async (project, m, add) => {
    const revenue = round(m.value + add);
    if (m.alloc?._id) {
      await trpc("projects.updateSubDocument", {
        projectId: project._id,
        subDocumentUpdate: { subDocumentType: "allocations", update: { ...m.alloc, revenue } },
      }, true);
    } else {
      await trpc("projects.addSubDocument", {
        projectId: project._id,
        subDocumentType: "allocations",
        template: { month: m.month, revenue, closed: false },
      }, true);
    }
  };

  // Delar upp beloppet enligt vikterna i hela kronor; avrundningsresten hamnar på sista månaden.
  const split = (amount, weights) => {
    const total = sum(weights);
    const parts = weights.map((w) => Math.round((amount * w) / total));
    parts[parts.length - 1] = round(parts[parts.length - 1] + amount - sum(parts));
    return parts;
  };

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  const show = (cell, amount, months, commit) => {
    close();
    if (!document.getElementById("rrk-css")) {
      const s = el("style", null, css);
      s.id = "rrk-css";
      document.head.append(s);
    }
    menu = el("div", "rrk");
    const seg = el("div", "rrk-seg");
    const tabOne = el("button", "on", "En månad");
    const tabSpread = el("button", null, "Fördela");
    seg.append(tabOne, tabSpread);
    const body = el("div");
    const msg = el("div", "rrk-msg");
    menu.append(seg, body, msg);

    const run = async (parts) => {
      menu.querySelectorAll("button, input").forEach((x) => (x.disabled = true));
      msg.style.color = "#64748b";
      msg.textContent = "Sparar…";
      try { await commit(parts); close(); } catch (err) {
        msg.style.color = "#dc2626";
        msg.textContent = `Fel: ${err.message}`;
        menu.querySelectorAll("button, input").forEach((x) => (x.disabled = false));
      }
    };

    const renderOne = () => {
      body.replaceChildren(el("div", "rrk-head", `Lägg ${fmt(amount)} på`));
      for (const m of months.slice(0, SINGLE)) {
        const b = el("button", "rrk-pick");
        b.type = "button";
        b.append(el("span", null, monthName(m.month)), el("span", "rrk-num", `${fmt(m.value)} → ${fmt(m.value + amount)}`));
        b.onclick = () => run([{ m, add: amount }]);
        body.append(b);
      }
    };

    let n = Math.min(4, months.length);
    let preset = "Jämnt";
    let parts = [];
    let locked = []; // index på inskrivna månader, äldst först
    let shift = 0;
    const peak = () => Math.min(n - 1, Math.max(0, (n - 1) / 2 + shift));
    // Låsta månader behåller sitt belopp. Resten delas på de olåsta enligt formen,
    // med samma vikt per position som utan lås.
    const calc = () => {
      locked = locked.filter((i) => i < n);
      const free = [...Array(n).keys()].filter((i) => !locked.includes(i));
      const share = split(round(amount - sum(locked.map((i) => parts[i]))), free.map((i) => PRESETS[preset](i, n, peak())));
      const next = Array(n).fill(0);
      locked.forEach((i) => (next[i] = parts[i]));
      free.forEach((i, k) => (next[i] = share[k]));
      parts = next;
    };
    const peakName = () => monthName(months[Math.round(peak())].month);

    const renderSpread = () => {
      const top = el("div", "rrk-bar-top");
      const step = el("span", "rrk-step");
      const dec = el("button", null, "−");
      const inc = el("button", null, "+");
      dec.onclick = () => { if (n > 1) { n--; calc(); renderSpread(); } };
      inc.onclick = () => { if (n < months.length) { n++; calc(); renderSpread(); } };
      step.append(dec, el("b", null, String(n)), inc);
      top.append(el("span", null, `Fördela ${fmt(amount)} på`), step);

      const chips = el("div", "rrk-chips");
      for (const k of Object.keys(PRESETS)) {
        const c = el("button", k === preset ? "on" : null, k);
        c.onclick = () => { preset = k; calc(); renderSpread(); };
        chips.append(c);
      }

      const lower = el("div");
      const curve = el("div");
      if (preset === "Egen") {
        curve.className = "rrk-peak";
        const slider = el("input");
        slider.type = "range";
        slider.min = 0;
        slider.max = n - 1;
        slider.step = 0.1;
        slider.value = peak();
        slider.disabled = n < 2;
        const label = el("b", null, peakName());
        slider.oninput = () => {
          shift = Number(slider.value) - (n - 1) / 2;
          calc();
          label.textContent = peakName();
          fill();
        };
        curve.append(el("span", null, "Topp"), slider, label);
      }

      // Raderna och summeringen ritas om separat så att reglaget inte tappar greppet.
      const fill = () => {
        const rows = el("div");
        const max = Math.max(...parts.map(Math.abs), 1);
        parts.forEach((p, i) => {
          const m = months[i];
          const row = el("div", "rrk-row");
          const name = el("span", null, monthName(m.month));
          name.append(el("small", null, `nu ${fmt(m.value)}`));
          const track = el("div", "rrk-track");
          const bar = el("i");
          bar.style.width = `${(Math.abs(p) / max) * 100}%`;
          track.append(bar);
          const isLocked = locked.includes(i);
          const inp = el("input", isLocked ? "lock" : null);
          inp.value = fmt(p);
          inp.inputMode = "decimal";
          inp.readOnly = n < 2;
          inp.oninput = () => liveFormat(inp);
          inp.title = "Belopp eller procent, t.ex. 30%. Låser månaden.";
          // Minst en månad hålls olåst; låser man den sista släpps den äldsta.
          inp.onchange = () => {
            const v = num(inp.value);
            parts[i] = isNaN(v) ? 0 : inp.value.trim().endsWith("%") ? Math.round((amount * v) / 100) : v;
            locked = [...locked.filter((x) => x !== i), i];
            while (locked.length > n - 1) locked.shift();
            calc();
            renderSpread();
          };
          const lock = el("button", "rrk-lock", isLocked ? "🔒" : "");
          lock.title = "Lås upp";
          lock.disabled = !isLocked;
          lock.onclick = () => { locked = locked.filter((x) => x !== i); calc(); renderSpread(); };
          row.append(name, track, inp, el("span", "rrk-pct", `${Math.round((p / amount) * 100)}%`), lock);
          rows.append(row);
        });

        const left = round(amount - sum(parts));
        // Låsta belopp större än helheten tvingar olåsta månader under noll.
        const over = parts.some((p, i) => !locked.includes(i) && Math.sign(p) === -Math.sign(amount));
        const foot = el("div", "rrk-foot");
        const status = el("span", null, over ? "Låsta månader är mer än beloppet" : left ? `Kvar att fördela: ${fmt(left)}` : "Allt fördelat");
        status.style.color = over || left ? "#b45309" : TEAL;
        const actions = el("span");
        actions.style.display = "flex";
        actions.style.gap = "4px";
        const unlock = el("button", null, "Lås upp alla");
        unlock.onclick = () => { locked = []; calc(); renderSpread(); };
        const ok = el("button", "rrk-save", "Spara");
        ok.onclick = () => {
          if (over) { msg.textContent = "Sänk en låst månad eller lås upp den."; return; }
          if (left) {
            msg.textContent = Math.sign(left) === Math.sign(amount)
              ? `Fördela ${fmt(Math.abs(left))} till innan du sparar.`
              : `Du har fördelat ${fmt(Math.abs(left))} för mycket.`;
            return;
          }
          run(parts.map((add, i) => ({ m: months[i], add })).filter((x) => x.add));
        };
        if (locked.length) actions.append(unlock);
        actions.append(ok);
        foot.append(status, actions);
        lower.replaceChildren(rows, foot);
      };

      fill();
      msg.textContent = "";
      body.replaceChildren(top, chips, curve, lower);
      place();
    };

    const place = () => {
      const r = cell.getBoundingClientRect();
      const left = Math.min(r.left, innerWidth - menu.offsetWidth - 8);
      const below = r.bottom + 4 + menu.offsetHeight < innerHeight;
      menu.style.left = `${Math.max(8, left)}px`;
      menu.style.top = `${Math.max(8, below ? r.bottom + 4 : r.top - menu.offsetHeight - 4)}px`;
    };

    tabOne.onclick = () => { tabOne.className = "on"; tabSpread.className = ""; msg.textContent = ""; renderOne(); place(); };
    tabSpread.onclick = () => { tabSpread.className = "on"; tabOne.className = ""; calc(); renderSpread(); };

    document.body.append(menu);
    renderOne();
    place();
  };

  document.addEventListener("click", async (e) => {
    if (menu?.contains(e.target)) return;
    close();
    const td = e.target.closest?.("tbody td");
    const table = td?.closest("table");
    if (!table) return;
    const row = td.parentElement;
    const i = [...row.children].indexOf(td);
    if (table.querySelectorAll("thead th")[i]?.textContent.trim() !== "Kvar") return;
    const amount = num(td.textContent);
    const project = projectOf(row);
    if (!amount || !project) return;
    e.stopPropagation();
    const client = queryClient(row);
    const months = openMonths(project, await latestClosed(client));
    show(td, amount, months, async (parts) => {
      for (const { m, add } of parts) await save(project, m, add);
      if (client) await client.invalidateQueries();
      else location.reload();
    });
  }, true);

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  addEventListener("scroll", (e) => { if (!menu?.contains(e.target)) close(); }, true);
})();
