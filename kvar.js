// Klick på ett belopp i Kvar-kolumnen visar en meny med de fyra första öppna
// månaderna. Valet lägger beloppet på den månaden via appens eget redigeringsfält.
(() => {
  if (window.top !== window) return;
  const LIMIT = 4;
  let menu = null;

  const num = (s) => Number((s || "").replace(/[\s\u00a0\u202f]/g, "").replace("\u2212", "-").replace(",", "."));
  const fmt = (n) => n.toLocaleString("sv-SE").replace("-", "\u2212");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const close = () => { menu?.remove(); menu = null; };

  const columns = (table) => [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());

  const openMonths = (row, heads) => {
    const out = [];
    [...row.children].forEach((td, i) => {
      const inp = td.querySelector("input");
      if (!inp || inp.title || inp.disabled || out.length >= LIMIT) return;
      out.push({ td, label: heads[i], value: num(inp.value) });
    });
    return out;
  };

  const waitFor = async (fn, ms = 2000) => {
    for (let t = 0; t < ms; t += 50) { const v = fn(); if (v) return v; await wait(50); }
    return null;
  };

  const addTo = async (td, amount) => {
    const ro = td.querySelector("input");
    const current = num(ro.value);
    ro.focus();
    const inp = await waitFor(() => { const i = td.querySelector("input"); return i && !i.readOnly ? i : null; });
    if (!inp) return alert("Kunde inte öppna månaden för redigering.");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(inp, String(Math.round((current + amount) * 100) / 100));
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(50);
    inp.blur();
    await wait(300);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  };

  const show = (cell, amount, months) => {
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
    if (!months.length) {
      const none = document.createElement("div");
      none.textContent = "Inga öppna månader i vyn.";
      none.style.padding = "4px 8px";
      menu.append(none);
    }
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
      name.textContent = m.label;
      const val = document.createElement("span");
      val.textContent = `${fmt(m.value)} → ${fmt(Math.round((m.value + amount) * 100) / 100)}`;
      val.style.color = "#0d9488";
      val.style.fontVariantNumeric = "tabular-nums";
      b.append(name, val);
      b.onclick = () => { close(); addTo(m.td, amount); };
      menu.append(b);
    }
    document.body.append(menu);
    const r = cell.getBoundingClientRect();
    const left = Math.min(r.left, innerWidth - menu.offsetWidth - 8);
    const below = r.bottom + 4 + menu.offsetHeight < innerHeight;
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${below ? r.bottom + 4 : r.top - menu.offsetHeight - 4}px`;
  };

  document.addEventListener("click", (e) => {
    if (menu?.contains(e.target)) return;
    close();
    const td = e.target.closest?.("tbody td");
    const table = td?.closest("table");
    if (!table) return;
    const heads = columns(table);
    const row = td.parentElement;
    const i = [...row.children].indexOf(td);
    if (heads[i] !== "Kvar") return;
    const amount = num(td.textContent);
    if (!amount) return;
    e.stopPropagation();
    show(td, amount, openMonths(row, heads));
  }, true);

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  addEventListener("scroll", close, true);
})();
