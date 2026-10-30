// ==UserScript==
// @name         eCondos - Diagnóstico de API (somente leitura)
// @namespace    https://github.com/wallissonghost-code/Econdos
// @version      1.2.0
// @description  Compara sucessos e falhas de dispositivos sem alterar requisições.
// @match        https://*.econdos.com.br/*
// @match        https://econdos.com.br/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  if (window.__econdosDiagnostico) return;
  const logs = [];
  const MAX = 40;
  const relevant = url => { try { const p = new URL(url, location.href).pathname; return /\/api\/v\d+\/condos\/.*\/(devices|sync)(\/|$)/i.test(p); } catch { return false; } };
  const scrub = s => String(s || '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/\b\d{5,}\b/g, '[ID]')
    .replace(/\b[a-f0-9]{16,}\b/gi, '[ID]')
    .slice(0, 500);
  const path = url => {
    try { return new URL(url, location.href).pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{20,}/gi, '[ID]').replace(/\b\d{5,}\b/g, '[ID]').replace(/\b[a-f0-9]{16,}\b/gi, '[ID]'); }
    catch { return '[caminho indisponível]'; }
  };
  function record(method, url, status, ms, body) {
    if (!relevant(url)) return;
    const item = { hora: new Date().toLocaleTimeString(), metodo: String(method || 'GET').toUpperCase(),
      caminho: path(url), status, duracaoMs: Math.round(ms), categoria: status === 0 ? 'rede/cancelamento' : status >= 500 ? 'servidor' : status >= 400 ? 'requisição' : 'sucesso', erro: scrub(body) };
    logs.push(item); if (logs.length > MAX) logs.shift();
    console[status >= 400 || status === 0 ? 'warn' : 'info']('[eCondos diagnóstico]', item);
    render();
  }
  function render() {
    let panel = document.getElementById('econdos-diagnostico');
    if (!panel || !panel.isConnected) return;
    panel.querySelector('[data-count]').textContent = String(logs.length);
    const last = logs[logs.length - 1];
    panel.querySelector('[data-last]').textContent = last
      ? last.metodo + ' ' + last.status + ' · ' + last.caminho + ' · ' + last.erro
      : 'Aguardando operações de dispositivos...';
  }
  function mount() {
    if (!document.body || document.getElementById('econdos-diagnostico')) return;
    const panel = document.createElement('div');
    panel.id = 'econdos-diagnostico';
    panel.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#17212b;color:white;padding:12px;border-radius:10px;font:12px Arial;max-width:360px;box-shadow:0 3px 16px #0006';
    panel.innerHTML = '<b>Diagnóstico eCondos</b> · operações: <span data-count>0</span><div data-last style="margin:8px 0;overflow-wrap:anywhere">Aguardando operações...</div><button type="button" data-copy>Copiar relatório</button> <button type="button" data-close>Fechar painel</button>';
    panel.querySelector('[data-copy]').onclick = () => {
      const report = JSON.stringify(logs, null, 2);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(report).catch(() => console.log(report));
      else console.log(report);
    };
    panel.querySelector('[data-close]').onclick = () => panel.remove();
    document.body.appendChild(panel); render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const input = args[0], init = args[1] || {};
    const url = typeof input === 'string' ? input : input?.url;
    const method = init.method || input?.method || 'GET';
    const start = performance.now();
    return originalFetch.apply(this, args).then(response => {
      if (relevant(url)) { if (response.ok) record(method, url, response.status, performance.now() - start, '[resposta omitida por privacidade]'); else response.clone().text().then(t => record(method, url, response.status, performance.now() - start, t)).catch(() => record(method, url, response.status, performance.now() - start, '[resposta inacessível]')); }
      return response;
    }, err => { record(method, url, 0, performance.now() - start, err.message); throw err; });
  };
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__ecDiag = { method, url }; return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    const start = performance.now();
    this.addEventListener('loadend', () => {
      if (relevant(this.__ecDiag?.url)) {
        let body = '';
        try { body = this.responseType === '' || this.responseType === 'text' ? this.responseText : '[resposta não textual]'; }
        catch { body = '[resposta inacessível]'; }
        record(this.__ecDiag?.method, this.__ecDiag?.url, this.status, performance.now() - start, this.status >= 400 || this.status === 0 ? body : '[resposta omitida por privacidade]');
      }
    }, { once: true });
    return send.apply(this, args);
  };
  window.__econdosDiagnostico = { relatorio: () => logs.map(x => ({...x})), limpar: () => { logs.length = 0; render(); } };
})();
