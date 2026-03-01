// SPDX-License-Identifier: MIT
const out = document.getElementById("out");
const btn = document.getElementById("connect");

function show(x) {
  out.textContent = typeof x === "string" ? x : JSON.stringify(x, null, 2);
}

show("Popup cargado ✅");

btn.addEventListener("click", () => {
  show("Enviando CONNECT…");

  chrome.runtime.sendMessage({ type: "CONNECT" }, (resp) => {
    if (chrome.runtime.lastError) {
      show("ERROR runtime: " + chrome.runtime.lastError.message);
      return;
    }
    show(resp);
  });
});
