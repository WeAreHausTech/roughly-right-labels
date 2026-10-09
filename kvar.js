// Klick på ett belopp i Kvar-kolumnen visar en meny med de fyra första öppna
// månaderna, även de som ligger utanför vyn. Valet lägger beloppet på månaden
// via appens API och laddar om listan. Körs i sidans egen JS-värld (MAIN) för
// att kunna läsa projektdata och appens query-cache.
(() => {
  if (window.top !== window) return;
  const LIMIT = 4;
  let menu = null;

  const num = (s) => Number((s || "").replace(/[\s  ]/g, "").replace("−", "-").replace(",", "."));
  const fmt = (n) => n.toLocaleString("sv-SE");
  const round = (n) => Math.round(n * 100) / 100;
  const nextMonth = (m) => (m % 100 === 12 ? (Math.floor(m / 100) + 1) * 100 + 1 : m + 1);
  const monthName = (m) => new Date(Math.floor(m / 100), (m % 100) - 1).toLocaleDateString("sv-SE", { month: "short", year: "numeric" });

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
    for (let m = nextMonth(closedUntil); out.length < LIMIT; m = nextMonth(m)) {
      const a = project.allocationMonthMap[m];
      if (a?.closed) continue;
      out.push({ month: m, alloc: a, value: a?.revenue ?? 0 });
    }
    return out;
  };

  const addTo = async (project, m, amount, client) => {
    const revenue = round(m.value + amount);
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
    if (client) await client.invalidateQueries();
    else location.reload();
  };

  const show = (cell, amount, months, onPick) => {
    close();
    menu = document.createElement("div");
    Object.assign(menu.style, {
      position: "fixed", zIndex: 2147483647, background: "#fff", borderRadius: "8px",
      boxShadow: "0 4px 16px rgba(0,0,0,.18)", padding: "6px", font: "12px system-ui, sans-serif",
      minWidth: "220px",
    });
    const head = document.createElement("div");
    head.textContent = `Lägg ${fmt(amount)} på`;
    Object.assign(head.style, { padding: "4px 8px 6px", color: "#64748b" });
    menu.append(head);
    for (const m of months) {
      const b = document.createElement("button");
      b.type = "button";
      Object.assign(b.style, {
        display: "flex", justifyContent: "space-between", gap: "16px", width: "100%",
        padding: "6px 8px", border: 0, borderRadius: "6px", background: "none",
        cursor: "pointer", font: "inherit", textAlign: "left",
      });
      b.onmouseenter = () => (b.style.background = "#f1f5f9");
      b.onmouseleave = () => (b.style.background = "none");
      const name = document.createElement("span");
      name.textContent = monthName(m.month);
      const val = document.createElement("span");
      val.textContent = `${fmt(m.value)} → ${fmt(round(m.value + amount))}`;
      val.style.color = "#0d9488";
      val.style.fontVariantNumeric = "tabular-nums";
      b.append(name, val);
      b.onclick = async () => {
        menu.querySelectorAll("button").forEach((x) => (x.disabled = true));
        head.textContent = "Sparar…";
        try { await onPick(m); close(); } catch (err) { head.textContent = `Fel: ${err.message}`; }
      };
      menu.append(b);
    }
    document.body.append(menu);
    const r = cell.getBoundingClientRect();
    const left = Math.min(r.left, innerWidth - menu.offsetWidth - 8);
    const below = r.bottom + 4 + menu.offsetHeight < innerHeight;
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${below ? r.bottom + 4 : r.top - menu.offsetHeight - 4}px`;
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
    show(td, amount, months, (m) => addTo(project, m, amount, client));
  }, true);

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  addEventListener("scroll", (e) => { if (!menu?.contains(e.target)) close(); }, true);
})();
