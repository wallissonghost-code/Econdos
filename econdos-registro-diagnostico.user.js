// ==UserScript==
// @name         eCondos - Diagnóstico de Registro de Encomendas
// @namespace    https://github.com/wallissonghost-code/Econdos
// @version      1.4.0
// @description  Observa o fluxo de cadastro e upload de encomendas sem modificar requisições ou registrar dados pessoais.
// @match        https://*.econdos.com.br/*
// @match        https://econdos.com.br/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(() => {
  'use strict';
  if (window.__ecRegistroDiag) return;
  const events = [];
  const MAX = 150;
  const keywords = /encomenda|entrega|pacote|package|parcel|delivery|upload|anexo|attachment|arquivo|file|registro|recebimento|criar|cadastrar/i;
  const sensitive = /token|auth|senha|password|secret|cookie|cpf|cnpj|email|telefone|phone|nome|name|address|endereco|documento|resident|morador|apartamento|unit|bloco|codigo|code|id/i;
  const safePath = value => {
    try {
      return new URL(value, location.href).pathname
        .replace(/[a-f0-9]{8}-[a-f0-9-]{20,}/gi, ':uuid')
        .replace(/\b\d{3,}\b/g, ':numero');
    } catch { return '[indisponível]'; }
  };
  const relevant = (url, method = 'GET') => {
    const m = String(method).toUpperCase();
    try { const u = new URL(url, location.href); return (u.protocol === 'https:' && (u.hostname === 'econdos.com.br' || u.hostname.endsWith('.econdos.com.br'))) && (/^(POST|PUT|PATCH|DELETE)$/.test(m) || keywords.test(u.pathname)); } catch { return false; }
  };
  // Estrutura profunda sem valores: evita expor moradores, identificadores e credenciais.
  const technical = new Set(['type', 'status', 'subType']);
  const safeTechnical = value => typeof value === 'string' && /^[a-zA-Z_ -]{1,50}$/.test(value) ? value : '[omitido]';
  const schema = (value, depth = 0, keyName = '') => {
    if (depth > 6) return '[profundidade limitada]';
    if (value === null) return { tipo: 'null' };
    if (Array.isArray(value)) return { tipo: 'array', quantidade: value.length, itens: value.slice(0, 3).map(v => schema(v, depth + 1)) };
    if (typeof value === 'object') {
      return { tipo: 'objeto', propriedades: Object.fromEntries(
        Object.entries(value).slice(0, 50).map(([key, val]) => [
          sensitive.test(key) ? '[campo sensível]' : key.slice(0, 60),
          sensitive.test(key) ? { tipo: Array.isArray(val) ? 'array' : typeof val, protegido: true } : schema(val, depth + 1, key)
        ])
      ) };
    }
    return { tipo: typeof value, valor: technical.has(keyName) ? safeTechnical(value) : '[omitido]' };
  };
  const bodyInfo = body => {
    if (body instanceof FormData) {
      const entries = Array.from(body.entries());
      return { tipo: 'FormData', campos: entries.slice(0, 35).map(([k, v]) => ({
        campo: sensitive.test(k) ? '[protegido]' : k.slice(0, 45),
        tipo: v instanceof File ? 'arquivo' : 'texto',
        arquivo: v instanceof File ? { tamanhoBytes: v.size, mime: v.type || 'desconhecido' } : undefined
      })) };
    }
    if (body instanceof Blob) return { tipo: 'Blob', tamanhoBytes: body.size, mime: body.type };
    if (typeof body === 'string') {
      try {
        const obj = JSON.parse(body);
        if (obj && typeof obj === 'object') return { tipo: 'JSON', estrutura: schema(obj) };
      } catch {}
      return { tipo: 'texto', tamanhoCaracteres: body.length };
    }
    if (body instanceof URLSearchParams) return { tipo: 'URLSearchParams', quantidadeCampos: Array.from(body.keys()).length };
    return { tipo: body == null ? 'sem corpo' : typeof body };
  };
  const responseInfo = text => {
    try {
      const parsed = JSON.parse(text);
      return { tipo: 'JSON', estrutura: schema(parsed), referenciaImagem: parsed && typeof parsed === 'object' ? Object.keys(parsed).filter(k => /^(url|path|file|filename|key|location|id|_id)$/i.test(k)).map(k => ({ campo: k, tipo: typeof parsed[k], valor: '[omitido]' })) : [] };
    } catch { return { tipo: 'não JSON' }; }
  };
  const uploadPath = url => /\/files\/upload(?:\/|$)/i.test(new URL(url, location.href).pathname);
  const log = item => {
    events.push({ hora: new Date().toISOString(), ...item });
    if (events.length > MAX) events.shift();
    console.info('[eCondos registro]', events[events.length - 1]);
    paint();
  };
  function paint() {
    const panel = document.getElementById('ec-registro-diag');
    if (!panel) return;
    panel.querySelector('[data-count]').textContent = String(events.length);
    panel.querySelector('[data-last]').textContent = events.length
      ? events[events.length - 1].evento + ' · ' + (events[events.length - 1].caminho || events[events.length - 1].rotulo || '')
      : 'Aguardando cadastro ou upload...';
  }
  function mount() {
    if (!document.body || document.getElementById('ec-registro-diag')) return;
    const panel = document.createElement('aside');
    panel.id = 'ec-registro-diag';
    panel.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#17212b;color:white;padding:12px;border-radius:10px;font:12px Arial;max-width:340px;box-shadow:0 3px 16px #0006';
    panel.innerHTML = '<b>Registro de encomendas · diagnóstico</b><div style="margin:8px 0">Eventos: <span data-count>0</span></div><div data-last style="margin:8px 0;overflow-wrap:anywhere"></div><button type="button" data-copy>Copiar relatório</button> <button type="button" data-clear>Limpar</button> <button type="button" data-close>Fechar</button>';
    panel.querySelector('[data-copy]').onclick = () => {
      const data = JSON.stringify({ versao: '1.4.0', eventos: events }, null, 2);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(data).catch(() => console.log(data));
      else console.log(data);
    };
    panel.querySelector('[data-clear]').onclick = () => { events.length = 0; paint(); };
    panel.querySelector('[data-close]').onclick = () => panel.remove();
    document.body.appendChild(panel);
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  const originalFetch = window.fetch;
  if (originalFetch) window.fetch = function (...args) {
    const request = args[0], init = args[1] || {};
    const url = typeof request === 'string' ? request : request?.url || (request instanceof URL ? request.href : null);
    const method = String(init.method || request?.method || 'GET').toUpperCase();
    if (!url || !relevant(url, method)) return originalFetch.apply(this, args);
    const start = performance.now();
    const info = bodyInfo(init.body);
    return originalFetch.apply(this, args).then(response => {
      log({ evento: 'HTTP fetch', metodo: method, caminho: safePath(url), status: response.status, duracaoMs: Math.round(performance.now() - start), envio: info });
      if (uploadPath(url)) response.clone().text().then(t => log({ evento: 'Resposta upload fetch', caminho: safePath(url), resposta: responseInfo(t.slice(0, 100000)) })).catch(() => {});
      return response;
    }, error => {
      log({ evento: 'HTTP fetch falhou', metodo: method, caminho: safePath(url), erroTipo: error?.name || 'erro' });
      throw error;
    });
  };
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__ecRegistro = { method, url };
    return xhrOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(body) {
    const req = this.__ecRegistro;
    if (req && relevant(req.url, req.method)) {
      const start = performance.now();
      const envio = bodyInfo(body);
      this.addEventListener('loadend', () => {
        log({
          evento: 'HTTP XHR', metodo: String(req.method).toUpperCase(),
          caminho: safePath(req.url), status: this.status,
          duracaoMs: Math.round(performance.now() - start), envio
        });
        if (uploadPath(req.url)) {
          try {
            if (this.responseType === '' || this.responseType === 'text') log({ evento: 'Resposta upload XHR', caminho: safePath(req.url), resposta: responseInfo(this.responseText.slice(0, 100000)) });
            else if (this.responseType === 'json') log({ evento: 'Resposta upload XHR', caminho: safePath(req.url), resposta: { tipo: 'JSON', estrutura: schema(this.response) } });
          } catch {}
        }
      }, { once: true });
    }
    return xhrSend.apply(this, arguments);
  };
  document.addEventListener('click', event => {
    const target = event.target?.closest?.('button,[role="button"],input[type="submit"],a');
    if (!target || target.closest('#ec-registro-diag')) return;
    const label = String(target.getAttribute('aria-label') || target.innerText || target.value || '').trim().slice(0, 80);
    if (keywords.test(label) || /^(salvar|confirmar|finalizar|enviar)$/i.test(label)) log({ evento: 'Clique na interface', rotulo: label });
  }, true);
  document.addEventListener('submit', event => {
    const form = event.target;
    const labels = Array.from(form.querySelectorAll('button,input[type="submit"]')).map(el => el.innerText || el.value || '').join(' ');
    if (keywords.test(labels) || keywords.test(location.pathname)) log({ evento: 'Formulário enviado', campos: Array.from(form.elements).slice(0, 35).map(el => sensitive.test(el.name || '') ? '[protegido]' : String(el.name || el.tagName).slice(0, 45)) });
  }, true);
  window.__ecRegistroDiag = { relatorio: () => events.map(e => ({ ...e })), limpar: () => { events.length = 0; paint(); } };
  log({ evento: 'Monitor iniciado', versao: '1.4.0', origem: location.hostname });
})();