(() => {
  const DEFAULT_RULES = `Vad har jag gjort? => Tidsrapportering
Roughly Now => Översikt
Pågående => Projekt
Arkivet => Register
Tid är pengar => Ekonomi
Återhämtningsgrad => Debiteringsgrad
Eff. timarvode => Snittpris/timme
View.Changes => Visa ändringar
YEAR_TO_DATE => Hittills i år
Download as excel => Exportera till Excel
Download => Ladda ner
Previous => Föregående
Next => Nästa`;
  const ATTRS = ["placeholder", "title", "aria-label"];
  let map = new Map();

  const parse = (text) =>
    new Map(
      text.split("\n")
        .map((l) => l.split("=>"))
        .filter((p) => p.length === 2 && p[0].trim())
        .map(([a, b]) => [a.trim(), b.trim()])
    );

  const swap = (s) => {
    if (!s) return null;
    const t = s.trim();
    if (!map.has(t)) return null;
    return s.replace(t, map.get(t));
  };

  const fixNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const r = swap(node.nodeValue);
      if (r !== null && r !== node.nodeValue) node.nodeValue = r;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    for (const a of ATTRS) {
      const r = swap(node.getAttribute(a));
      if (r !== null) node.setAttribute(a, r);
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === Node.TEXT_NODE) {
        const r = swap(n.nodeValue);
        if (r !== null && r !== n.nodeValue) n.nodeValue = r;
      } else {
        for (const a of ATTRS) {
          const r = swap(n.getAttribute(a));
          if (r !== null) n.setAttribute(a, r);
        }
      }
    }
  };

  const fixTitle = () => {
    let t = document.title;
    for (const [from, to] of map) t = t.split(from).join(to);
    if (t !== document.title) document.title = t;
  };

  const run = () => {
    if (document.documentElement) fixNode(document.documentElement);
    fixTitle();
  };

  new MutationObserver((muts) => {
    if (!map.size) return;
    for (const m of muts) {
      if (m.type === "characterData") fixNode(m.target);
      else if (m.type === "attributes") fixNode(m.target);
      else m.addedNodes.forEach(fixNode);
    }
    fixTitle();
  }).observe(document, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  });

  chrome.storage.sync.get({ rules: DEFAULT_RULES }, ({ rules }) => {
    map = parse(rules);
    run();
  });

  chrome.storage.onChanged.addListener((c) => {
    if (c.rules) { map = parse(c.rules.newValue || ""); run(); }
  });
})();
