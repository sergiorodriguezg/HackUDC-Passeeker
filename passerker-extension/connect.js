const out = document.getElementById('out');
const yes = document.getElementById('yes');
const no = document.getElementById('no');

function show(x){
  out.textContent = typeof x === 'string' ? x : JSON.stringify(x, null, 2);
}

show('Pulsa “Sí, conectar” para emparejar.');

yes.addEventListener('click', () => {
  show('Conectando…');
  chrome.runtime.sendMessage({ type: 'CONNECT' }, (resp) => {
    if (chrome.runtime.lastError) {
      show('ERROR runtime: ' + chrome.runtime.lastError.message);
      return;
    }
    if (resp?.ok) {
      show('✅ Conectado. Ya puedes cerrar esta ventana.');
      setTimeout(() => window.close(), 700);
      return;
    }
    show(resp);
  });
});

no.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'DISMISS_CONNECT' }, () => window.close());
});
