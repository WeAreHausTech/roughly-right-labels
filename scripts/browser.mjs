// Startar Chromium med tillägget laddat från repots mapp (--load-extension), så att det
// körs i en riktig webbläsare.
//
//   npm run browser   Öppnar Roughly Right i ett eget Chromium-fönster. Inloggningen sparas
//                     i .playwright-profile/, så du loggar in en gång. En statussida på
//                     http://localhost:9333 (eller PORT) visar att webbläsaren är igång.
//   npm run check     Körs utan fönster. Playwright svarar med en testsida i stället för
//                     den riktiga sidan på app.roughlyright.com, och skriptet kontrollerar
//                     att content.js byter texterna och att inställningssidan visar
//                     standardreglerna. Slutar med 0 om allt stämmer, annars 1.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "https://app.roughlyright.com/";
const PORT = Number(process.env.PORT || 9333);
const check = process.argv.includes("--check");

const context = await chromium.launchPersistentContext(
  check ? "" : path.join(ROOT, ".playwright-profile"),
  {
    channel: "chromium",
    headless: check,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  },
);
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const extensionId = new URL(worker.url()).host;

if (check) {
  process.exit((await runChecks()) ? 0 : 1);
} else {
  await openApp();
}

// Testsidan har standardreglernas texter i titeln, i länkar, i attribut och i en text som
// läggs till efter sidladdningen. Den sista visar att content.js byter text som kommer senare.
async function runChecks() {
  await context.route(`${APP}**`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><title>Roughly Now</title>
        <nav><a id="menu">Pågående</a><a id="tip" title="Arkivet">i</a></nav>
        <input id="search" placeholder="Download"><p id="later"></p>
        <script>setTimeout(() => { later.textContent = "Tid är pengar" }, 300)</script>`,
    }),
  );
  const page = await context.newPage();
  await page.goto(APP);
  const results = [
    ["fönstrets titel", () => document.title === "Översikt"],
    ["menytext", () => menu.textContent === "Projekt"],
    ["hovringstext", () => tip.title === "Register"],
    ["platshållare", () => search.placeholder === "Ladda ner"],
    ["text som kommer senare", () => later.textContent === "Ekonomi"],
  ];
  let ok = true;
  for (const [name, test] of results) {
    const passed = await page.waitForFunction(test, null, { timeout: 5000 }).then(
      () => true,
      () => false,
    );
    console.log(`${passed ? "ok " : "FEL"} ${name}`);
    ok &&= passed;
  }
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const rules = await options.locator("#rules").inputValue();
  const optionsOk = rules.includes("Roughly Now => Översikt");
  console.log(`${optionsOk ? "ok " : "FEL"} inställningssidan visar standardreglerna`);
  await context.close();
  return ok && optionsOk;
}

async function openApp() {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(APP);
  const server = http
    .createServer((_, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><title>Roughly Righter</title><body style="font:14px system-ui;margin:32px">` +
          `<h1>Chromium med Roughly Righter är igång</h1>` +
          `<p>Tilläggets id: <code>${extensionId}</code>. Inställningar: ` +
          `<code>chrome-extension://${extensionId}/options.html</code></p>` +
          `<p>Stäng Chromium-fönstret för att avsluta.</p>`,
      );
    })
    .listen(PORT);
  console.log(`Chromium körs med tillägget (${extensionId}). Status: http://localhost:${PORT}`);
  const stop = () => context.close();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  context.on("close", () => {
    server.close();
    process.exit(0);
  });
}
