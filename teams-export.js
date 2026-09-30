// Teams web chat -> Markdown (+ images folder) and/or one standalone HTML file.
// Runs only inside your own logged-in tab. It reads no tokens, asks for no consent,
// and sends nothing anywhere. The only network calls are fetches of images that
// are already displayed in the chat, so they can be saved with the export.
//
// HOW TO USE: 1) open ONE chat in Teams web  2) edit CONFIG below if you want
//             3) press F12 -> Console -> paste this whole script -> Enter.

// ===================== CONFIG (edit these) =====================
const CONFIG = {
  format: 'md',       // 'md'   = Markdown; if the chat has images you get a .zip with chat.md + images/
                      // 'html' = one self-contained .html file (images embedded)
                      // 'both' = both of the above
  since: '',          // oldest day to include, e.g. '2026-01-01'   ('' = no limit)
  until: '',          // newest day to include, e.g. '2026-03-31'   ('' = no limit)
  maxMessages: 0,     // keep only the NEWEST N messages            (0 = no limit)
  fileName: '',       // name without extension                     ('' = use the chat title)
  pickFolder: false,  // true = you choose a folder and files are written there directly
                      //        (Chrome/Edge only). false = normal browser download.
};
// ===============================================================

(async () => {
  // The folder picker must come first: browsers only allow it right after your Enter key press.
  let dir = null;
  if (CONFIG.pickFolder) {
    try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); }
    catch (e) { console.warn('Folder picker unavailable or cancelled (' + e.name + '). Using normal download instead.'); }
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const enc = new TextEncoder();
  const fmt = CONFIG.format;
  if (!['md', 'html', 'both'].includes(fmt)) { console.error("CONFIG.format must be 'md', 'html' or 'both'."); return; }

  const sinceMs = CONFIG.since ? new Date(CONFIG.since + 'T00:00:00').getTime() : 0;
  const untilMs = CONFIG.until ? new Date(CONFIG.until + 'T23:59:59.999').getTime() : Infinity;
  if (isNaN(sinceMs) || isNaN(untilMs)) { console.error("Dates must look like '2026-01-31'."); return; }
  const MAX = CONFIG.maxMessages > 0 ? Math.floor(CONFIG.maxMessages) : 0;

  // ---- Selectors: Teams may rename these. The tutorial's step-1 check verifies them. ----
  const MSG_CANDIDATES = ['[data-tid="chat-pane-message"]', '[data-tid="channel-pane-message"]'];
  const AUTHOR = '[data-tid="message-author-name"]';
  const BODY = '[data-tid="message-body"]';

  const MSG = MSG_CANDIDATES.find(s => document.querySelector(s));
  if (!MSG) {
    console.error('No messages found. Open a chat first, or run the step-1 check and send me the table.');
    return;
  }

  // Find the scrollable element holding the messages (null if the chat is short).
  let box = document.querySelector(MSG).parentElement;
  while (box && !(box.scrollHeight > box.clientHeight + 5 && /auto|scroll/.test(getComputedStyle(box).overflowY))) {
    box = box.parentElement;
  }

  // ---- Time: Teams message ids are normally the send time in epoch milliseconds. ----
  const validMs = v => /^\d{13}$/.test(v) && +v > 1.4e12 && +v < Date.now() + 864e5;
  const midOf = m => {
    const direct = m.getAttribute('data-mid') || m.closest('[data-mid]')?.getAttribute('data-mid') || '';
    if (validMs(direct)) return direct;
    for (const x of [m, ...m.querySelectorAll('[id]')]) {
      const hit = (x.id || '').match(/\d{13}/);
      if (hit && validMs(hit[0])) return hit[0];
    }
    return '';
  };

  const hostOf = src => { try { return new URL(src, location.href).host; } catch { return '?'; } };
  let imgOk = 0, imgFail = 0;
  const failedHosts = new Set();

  const toDataUrl = async src => {
    try {
      const r = await fetch(src, { credentials: 'include' });
      if (!r.ok) throw new Error(r.status);
      const blob = await r.blob();
      return await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  // Keep only text/formatting: drop scripts, buttons, svg, and every attribute except src/href/alt.
  const clean = root => {
    root.querySelectorAll('script,style,svg,button,iframe,[role="toolbar"]').forEach(x => x.remove());
    [root, ...root.querySelectorAll('*')].forEach(x => {
      [...x.attributes].forEach(a => { if (!['src', 'href', 'alt'].includes(a.name)) x.removeAttribute(a.name); });
      const h = x.getAttribute('href');
      if (h && h.trim().toLowerCase().startsWith('javascript:')) x.removeAttribute('href');
    });
  };

  // ---- Reading messages ----
  const seen = new Map();
  const authorsSeen = new Map();     // mid -> sender name, for every message seen (even outside the window)
  let minMid = Infinity;
  const grab = async batch => {
    const els = Array.from(document.querySelectorAll(MSG));
    for (let idx = 0; idx < els.length; idx++) {
      const m = els[idx];
      const mid = midOf(m);
      const author = (m.querySelector(AUTHOR)?.innerText || '').trim();
      if (mid) {
        if (author) authorsSeen.set(mid, author);
        minMid = Math.min(minMid, +mid);
        if (+mid < sinceMs || +mid > untilMs) continue;          // outside the date window
      }
      const tEl = m.querySelector('time');
      const time = tEl ? (tEl.getAttribute('datetime') || tEl.title || tEl.innerText) : '';
      const key = mid || (author + '|' + time + '|' + m.innerText.slice(0, 120));
      if (seen.has(key)) continue;

      const live = Array.from(m.querySelectorAll('img'));
      const clone = m.cloneNode(true);
      const cimgs = Array.from(clone.querySelectorAll('img'));
      for (let i = 0; i < cimgs.length; i++) {
        const li = live[i], ci = cimgs[i];
        const w = li ? (li.naturalWidth || li.width || 0) : 0;
        const isEmoji = li && (/emoji/i.test(li.getAttribute('itemtype') || '') || (w > 0 && w <= 40));
        if (isEmoji) { ci.replaceWith(document.createTextNode(li.getAttribute('alt') || '')); continue; }
        const src = li && (li.currentSrc || li.src);
        if (!src || src.startsWith('data:')) continue;
        const d = await toDataUrl(src);
        if (d) { ci.setAttribute('src', d); ci.removeAttribute('srcset'); imgOk++; }
        else { imgFail++; failedHosts.add(hostOf(src)); }
      }
      const bodyEl = clone.querySelector(BODY) || clone;
      clean(bodyEl);
      seen.set(key, { batch, idx, mid, author, time, el: bodyEl });
    }
  };

  // ---- Back loading ----
  // Walk UP one screen at a time (nothing is skipped even if Teams removes off-screen
  // messages), grabbing at every step. At the very top, wait until Teams loads older
  // messages (page height grows). Stop after 2 top-waits with nothing new, or when the
  // date/number limit is reached.
  const waitGrow = async (h0, ms) => {
    box.scrollTop = 40;            // nudge so a scroll event fires even if we are already at 0
    await sleep(150);
    box.scrollTop = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await sleep(300);
      if (box.scrollHeight !== h0) { await sleep(600); return true; }
    }
    return false;
  };
  const enough = () => (MAX && seen.size >= MAX) || (sinceMs && minMid < sinceMs);

  let batch = 0, noGrowth = 0, steps = 0, finishing = 0;
  await grab(++batch);
  while (box && noGrowth < 2 && steps < 20000) {
    if (enough() && finishing++ >= 2) break;      // two extra steps so the sender header just above the cut is seen
    steps++;
    if (box.scrollTop <= 1) {
      const h0 = box.scrollHeight;
      const grew = await waitGrow(h0, 8000);
      if (grew) {
        box.scrollTop = Math.max(box.scrollTop, box.scrollHeight - h0);   // land on the seam, then walk up
        await sleep(300);
      }
      await grab(++batch);
      noGrowth = grew ? 0 : noGrowth + 1;
    } else {
      box.scrollTop = Math.max(0, box.scrollTop - box.clientHeight * 0.8);
      await sleep(350);
      await grab(++batch);
    }
    if (steps % 5 === 0) console.log('messages collected: ' + seen.size);
  }

  // ---- Order, limit ----
  let rows = [...seen.values()];
  const haveTimes = rows.length > 0 && rows.every(r => r.mid);
  rows.sort(haveTimes ? (a, b) => a.mid - b.mid : (a, b) => (b.batch - a.batch) || (a.idx - b.idx));
  if (MAX && rows.length > MAX) rows = rows.slice(-MAX);          // keep the newest N
  if (!haveTimes && (CONFIG.since || CONFIG.until)) console.warn('No message timestamps found, so since/until could not be applied.');

  const title = document.title || 'Teams chat';
  const base = (CONFIG.fileName || title).replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80) || 'teams_chat';
  const range = haveTimes && rows.length ? new Date(+rows[0].mid).toLocaleString() + ' \u2192 ' + new Date(+rows[rows.length - 1].mid).toLocaleString() : 'timestamps unavailable';
  const today = new Date().toISOString().slice(0, 10);

  const authorTimeline = [...authorsSeen].map(([m, a]) => [+m, a]).sort((x, y) => x[0] - y[0]);
  const authorAt = ms => { let a = ''; for (const [m, n] of authorTimeline) { if (m <= ms) a = n; else break; } return a; };
  let lastAuthor = '';
  const rowInfo = rows.map(r => {
    if (r.author) lastAuthor = r.author;
    else if (!lastAuthor && r.mid) lastAuthor = authorAt(+r.mid);
    if (!lastAuthor) lastAuthor = 'Unknown sender';
    const d = haveTimes ? new Date(+r.mid) : null;
    return {
      r, author: lastAuthor,
      dayKey: d ? d.toLocaleDateString('en-CA') : '',
      dayLong: d ? d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '',
      stamp: d ? d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }) : r.time,
    };
  });

  // ---- Markdown ----
  const images = new Map();     // data URL -> { name, bytes }
  let unembedded = 0;
  const imgFile = dataUrl => {
    if (images.has(dataUrl)) return images.get(dataUrl).name;
    const comma = dataUrl.indexOf(',');
    const meta = dataUrl.slice(5, comma), payload = dataUrl.slice(comma + 1);
    const bytes = /;base64$/.test(meta) ? Uint8Array.from(atob(payload), c => c.charCodeAt(0)) : enc.encode(decodeURIComponent(payload));
    const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' })[meta.split(';')[0]] || 'bin';
    const name = 'images/img-' + String(images.size + 1).padStart(4, '0') + '.' + ext;
    images.set(dataUrl, { name, bytes });
    return name;
  };

  const BLOCK = new Set(['p', 'div', 'section', 'article', 'ul', 'ol', 'table', 'tbody', 'thead']);
  const toMd = root => {
    const walk = (n, inPre) => {
      if (n.nodeType === 3) return inPre ? n.nodeValue : n.nodeValue.replace(/\s+/g, ' ');
      if (n.nodeType !== 1) return '';
      const tag = n.tagName.toLowerCase();
      const kids = pre => Array.from(n.childNodes).map(c => walk(c, pre === undefined ? inPre : pre)).join('');
      switch (tag) {
        case 'br': return '\n';
        case 'hr': return '\n---\n';
        case 'img': {
          const src = n.getAttribute('src') || '';
          const alt = (n.getAttribute('alt') || 'image').replace(/[\[\]\n]/g, ' ').trim() || 'image';
          if (!src) return '';
          if (src.startsWith('data:')) return '\n![' + alt + '](' + imgFile(src) + ')\n';
          unembedded++;
          return '\n![' + alt + '](' + src + ')\n';
        }
        case 'strong': case 'b': { const t = kids().trim(); return t ? '**' + t + '**' : ''; }
        case 'em': case 'i': { const t = kids().trim(); return t ? '_' + t + '_' : ''; }
        case 's': case 'strike': case 'del': { const t = kids().trim(); return t ? '~~' + t + '~~' : ''; }
        case 'code': { const t = kids(true); return t ? '`' + t.replace(/`/g, "'") + '`' : ''; }
        case 'pre': return '\n```\n' + n.textContent.replace(/\n$/, '') + '\n```\n';
        case 'a': {
          const href = n.getAttribute('href') || '', t = kids().trim();
          if (!href) return t;
          return !t || t === href ? href : '[' + t + '](' + href + ')';
        }
        case 'li': {
          const p = n.parentElement, ordered = p && p.tagName.toLowerCase() === 'ol';
          const num = ordered ? Array.from(p.children).indexOf(n) + 1 : 0;
          return (ordered ? num + '. ' : '- ') + kids().trim().replace(/\n/g, '\n   ') + '\n';
        }
        case 'blockquote': return '\n' + kids().trim().split('\n').map(l => '> ' + l).join('\n') + '\n';
        case 'tr': {
          const cells = Array.from(n.children).map(c => walk(c, false).trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|'));
          const first = n.closest('table') && n.closest('table').querySelector('tr') === n;
          return '\n| ' + cells.join(' | ') + ' |' + (first ? '\n|' + cells.map(() => ' --- |').join('') : '') + '\n';
        }
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          return '\n' + '#'.repeat(+tag[1]) + ' ' + kids().trim() + '\n';
        default: { const out = kids(); return BLOCK.has(tag) ? '\n' + out + '\n' : out; }
      }
    };
    return walk(root, false).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  // ---- ZIP writer (uncompressed, standard format; opens with Windows Explorer / any unzip tool) ----
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const makeZip = list => {
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const chunks = [], central = [];
    let offset = 0;
    for (const f of list) {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true);
      chunks.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, list.length, true); end.setUint16(10, list.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  };

  // ---- Saving ----
  const download = (name, blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const writeToDir = async (name, data) => {
    const parts = name.split('/');
    let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
  };

  const saved = [];
  if (fmt === 'md' || fmt === 'both') {
    let md = '# ' + title + '\n\nExported: ' + today + ' | Messages: ' + rows.length + ' | Range: ' + range + '\n';
    let lastDay = null;
    for (const { r, author, dayKey, stamp } of rowInfo) {
      if (dayKey && dayKey !== lastDay) { md += '\n## ' + dayKey + '\n'; lastDay = dayKey; }
      md += '\n**' + author + '** \u00B7 ' + stamp + '\n' + toMd(r.el) + '\n';
    }
    const files = [{ name: base + '.md', data: enc.encode(md) }];
    images.forEach(v => files.push({ name: v.name, data: v.bytes }));
    if (dir) {
      for (const f of files) await writeToDir(f.name, f.data);
      saved.push('folder: ' + files.length + ' file(s)');
    } else if (files.length === 1) {
      download(base + '.md', new Blob([files[0].data], { type: 'text/markdown' }));
      saved.push(base + '.md');
    } else {
      download(base + '.zip', makeZip(files));
      saved.push(base + '.zip (chat + ' + images.size + ' image files)');
    }
  }

  if (fmt === 'html' || fmt === 'both') {
    const parts = rowInfo.map(({ r, author, dayKey, dayLong, stamp }, i) => {
      const head = dayKey && (i === 0 || rowInfo[i - 1].dayKey !== dayKey) ? '<h3>' + esc(dayLong) + '</h3>' : '';
      return head + '<div class="m"><div class="h"><b>' + esc(author) + '</b> <span>' + esc(stamp) + '</span></div>' + r.el.outerHTML + '</div>';
    });
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
      'body{font:15px/1.5 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#222;background:#fff}' +
      'h3{margin:1.5rem 0 .3rem;color:#555;font-size:14px;border-bottom:2px solid #ccc}' +
      '.m{border-bottom:1px solid #ddd;padding:.6rem 0}.h span{color:#777;font-size:12px;margin-left:.5rem}' +
      'img{max-width:100%;height:auto}blockquote{border-left:3px solid #aaa;margin:.4rem 0;padding-left:.8rem;color:#555}' +
      '@media(prefers-color-scheme:dark){body{background:#1b1b1b;color:#ddd}.m{border-color:#333}h3{color:#aaa;border-color:#444}}' +
      '</style></head><body><h1>' + esc(title) + '</h1><p>' + rows.length + ' messages (' + esc(range) + '), exported ' +
      today + '</p>' + parts.join('\n') + '</body></html>';
    if (dir) { await writeToDir(base + '.html', enc.encode(html)); saved.push(base + '.html (in folder)'); }
    else { download(base + '.html', new Blob([html], { type: 'text/html' })); saved.push(base + '.html'); }
  }

  console.log('DONE. Messages: ' + rows.length + ' | range: ' + range + ' | timestamps from message ids: ' + haveTimes +
    ' | images fetched: ' + imgOk + ' | not fetchable: ' + imgFail + ' | linked-only in markdown: ' + unembedded +
    (failedHosts.size ? ' | hosts that refused: ' + [...failedHosts].join(', ') : '') + ' | saved: ' + saved.join(', '));
})();
