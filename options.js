const box = document.getElementById("rules");
const status = document.getElementById("status");
chrome.storage.sync.get({ rules: DEFAULT_RULES }, ({ rules }) => (box.value = rules));
document.getElementById("save").onclick = () =>
  chrome.storage.sync.set({ rules: box.value }, () => {
    status.textContent = "Sparat";
    setTimeout(() => (status.textContent = ""), 1500);
  });
