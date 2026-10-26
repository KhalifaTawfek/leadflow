// Live demo tools: website security scan, website "reverse-engineer" (design
// system + tech stack), and domain/email health check.
//
// Everything that fetches a user-supplied URL goes through safeFetch(), which
// blocks private/loopback hosts on EVERY redirect hop (not just the first), caps
// the response size, and times out - so the tools can't be used for SSRF.

const net = require("net");
const tls = require("tls");
const dns = require("dns");
const dnsp = dns.promises;

const UA = "CloudHelm-Inspector/1.0 (+https://cloudhelm.eu)";

// ---------- SSRF guard ----------
function isPrivateIp(ip) {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}
async function assertPublicHost(host) {
  host = String(host || "").replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("blocked");
  const addrs = net.isIP(host) ? [host] : (await dnsp.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error("blocked");
}

function toUrl(raw) {
  raw = String(raw || "").trim();
  if (!raw) throw new Error("Enter a website, e.g. example.com");
  let url;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw); } catch { throw new Error("Enter a valid website, e.g. example.com"); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http/https URLs are supported.");
  return url;
}

async function readCapped(res, maxBytes) {
  if (!res.body || maxBytes <= 0) { try { await res.body?.cancel(); } catch {} return ""; }
  const reader = res.body.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { chunks.push(Buffer.from(value.subarray(0, value.length - (size - maxBytes)))); try { await reader.cancel(); } catch {} break; }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Fetch with manual redirects so every hop is re-checked against the SSRF guard.
async function safeFetch(rawUrl, { maxBytes = 1_500_000, timeoutMs = 8000 } = {}) {
  let current = rawUrl instanceof URL ? rawUrl : toUrl(rawUrl);
  const deadline = Date.now() + timeoutMs;
  for (let hop = 0; hop < 6; hop++) {
    if (!/^https?:$/.test(current.protocol)) throw new Error("Only http/https URLs are supported.");
    await assertPublicHost(current.hostname);
    const left = deadline - Date.now();
    if (left <= 0) { const e = new Error("timeout"); e.name = "TimeoutError"; throw e; }
    const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(left), headers: { "user-agent": UA, accept: "text/html,text/css,*/*;q=0.8" } });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      try { await res.body?.cancel(); } catch {}
      current = new URL(loc, current);
      continue;
    }
    const body = await readCapped(res, maxBytes);
    return { res, url: current.toString(), body };
  }
  throw new Error("Too many redirects.");
}

function friendlyError(e) {
  if (e.message === "blocked") return "That host isn't allowed.";
  if (e.name === "TimeoutError" || e.name === "AbortError") return "The site took too long to respond.";
  if (e.code === "ENOTFOUND" || /ENOTFOUND/.test(e.message)) return "That domain doesn't seem to exist.";
  if (/fetch failed/i.test(e.message)) return "Could not reach the site.";
  return e.message || "Could not reach the site.";
}

function headerMap(res) { const h = {}; res.headers.forEach((v, k) => { h[k] = v; }); return h; }
function securityHeaders(h) {
  return {
    "HSTS (Strict-Transport-Security)": !!h["strict-transport-security"],
    "X-Content-Type-Options": !!h["x-content-type-options"],
    "X-Frame-Options": !!h["x-frame-options"] || /frame-ancestors/i.test(h["content-security-policy"] || ""),
    "Content-Security-Policy": !!h["content-security-policy"]
  };
}
const isCloudflare = (h) => !!(h["cf-ray"] || String(h["server"] || "").toLowerCase().includes("cloudflare"));

// ---------- 1) Security scan ----------
async function probe(rawUrl) {
  const url = toUrl(rawUrl);
  const started = Date.now();
  const { res, url: finalUrl } = await safeFetch(url, { maxBytes: 0 });
  const h = headerMap(res);
  return {
    url: url.toString(), finalUrl, status: res.status, https: finalUrl.startsWith("https:"),
    responseMs: Date.now() - started, server: h["server"] || "unknown", cloudflare: isCloudflare(h),
    securityHeaders: securityHeaders(h)
  };
}

// ---------- 2) Website reverse-engineer ----------
function hex2(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"); }
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + hex2(f(0) * 255) + hex2(f(8) * 255) + hex2(f(4) * 255);
}
function colorInfo(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const s = max === min ? 0 : (l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min));
  return { light: l, sat: s };
}
// Pull every colour out of a blob of CSS/HTML and count how often each appears.
function extractColors(css) {
  const counts = new Map();
  const add = (hex) => { hex = hex.toLowerCase(); counts.set(hex, (counts.get(hex) || 0) + 1); };
  for (const m of css.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi)) {
    let v = m[1];
    if (v.length === 3 || v.length === 4) v = v.slice(0, 3).split("").map((c) => c + c).join("");
    if (v.length === 8) { if (v.slice(6) === "00") continue; v = v.slice(0, 6); }
    add("#" + v);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)/gi)) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) continue;
    add("#" + hex2(+m[1]) + hex2(+m[2]) + hex2(+m[3]));
  }
  for (const m of css.matchAll(/hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)/gi)) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) continue;
    add(hslToHex(+m[1], +m[2], +m[3]));
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([hex, count]) => {
    const { light, sat } = colorInfo(hex);
    const role = sat > 0.3 && light > 0.12 && light < 0.9 ? "accent" : (light < 0.25 ? "dark" : (light > 0.85 ? "light" : "neutral"));
    return { hex, count, role };
  });
}
const GENERIC_FONTS = new Set(["sans-serif", "serif", "monospace", "cursive", "fantasy", "inherit", "initial", "unset", "system-ui", "-apple-system", "blinkmacsystemfont", "ui-sans-serif", "ui-serif", "ui-monospace", "emoji", "math", "revert"]);
function extractFonts(css) {
  const counts = new Map();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{<>]+)/gi)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^['"]|['"]$/g, "").replace(/\s*!important$/i, "").trim();
      if (!name || name.startsWith("var(") || GENERIC_FONTS.has(name.toLowerCase()) || name.length > 40) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
      break; // only the first real family of each declaration
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count }));
}
function topValues(css, re, limit) {
  const counts = new Map();
  for (const m of css.matchAll(re)) {
    const v = m[1].trim().replace(/\s+/g, " ").replace(/\s*!important$/i, "");
    if (!v || v.length > 40 || /var\(/.test(v)) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value, count]) => ({ value, count }));
}
// CSS custom properties that hold colours = the site's design tokens.
function extractTokens(css) {
  const out = []; const seen = new Set();
  for (const m of css.matchAll(/(--[\w-]{2,40})\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/gi)) {
    if (seen.has(m[1])) continue; seen.add(m[1]);
    const c = extractColors(m[2])[0];
    if (c) out.push({ name: m[1], value: m[2].trim(), hex: c.hex });
    if (out.length >= 16) break;
  }
  return out;
}
function metaContent(html, key) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const k = (tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (k && k.toLowerCase() === key) return ((tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1] || "").trim();
  }
  return "";
}
function linkHrefs(html, relWord) {
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = ((tag.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || "").toLowerCase();
    const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (href && rel.split(/\s+/).includes(relWord)) out.push(href);
  }
  return out;
}
function detectTech(html, css, h) {
  const t = new Set();
  const has = (re) => re.test(html);
  const gen = metaContent(html, "generator");
  if (has(/wp-content|wp-includes/i) || /wordpress/i.test(gen)) t.add("WordPress");
  if (has(/cdn\.shopify\.com|Shopify\.theme/)) t.add("Shopify");
  if (has(/static\.wixstatic\.com|wix\.com/i)) t.add("Wix");
  if (has(/squarespace(-cdn)?\.com/i)) t.add("Squarespace");
  if (has(/data-wf-page|website-files\.com|webflow/i)) t.add("Webflow");
  if (has(/__NEXT_DATA__|\/_next\//)) t.add("Next.js");
  if (has(/__NUXT__|\/_nuxt\//)) t.add("Nuxt");
  if (has(/___gatsby/)) t.add("Gatsby");
  if (has(/astro-island|data-astro-/)) t.add("Astro");
  if (has(/__sveltekit|svelte-[a-z0-9]{5,}/)) t.add("Svelte");
  if (has(/ng-version=/)) t.add("Angular");
  if (has(/data-v-[0-9a-f]{6,}/)) t.add("Vue");
  if (has(/data-reactroot|react-dom/i) && !t.has("Next.js") && !t.has("Gatsby")) t.add("React");
  if (/--tw-/.test(css)) t.add("Tailwind CSS");
  if (has(/bootstrap(\.min)?\.(css|js)/i) || /\.btn-primary\b[\s\S]{0,400}\.navbar\b/.test(css)) t.add("Bootstrap");
  if (has(/jquery[.-][\d.]*(min\.)?js|jquery\.min\.js/i)) t.add("jQuery");
  if (has(/fonts\.googleapis\.com/)) t.add("Google Fonts");
  if (has(/use\.typekit\.net/)) t.add("Adobe Fonts");
  if (has(/font-?awesome/i)) t.add("Font Awesome");
  if (has(/googletagmanager\.com|gtag\(/)) t.add("Google Analytics / GTM");
  if (has(/connect\.facebook\.net/)) t.add("Meta Pixel");
  if (has(/static\.hotjar\.com/)) t.add("Hotjar");
  if (has(/js\.stripe\.com/)) t.add("Stripe");
  if (has(/widget\.intercom\.io|intercomcdn/)) t.add("Intercom");
  if (has(/client\.crisp\.chat/)) t.add("Crisp chat");
  if (has(/js\.hs-scripts\.com|hubspot/i)) t.add("HubSpot");
  if (has(/google\.com\/recaptcha|hcaptcha\.com/)) t.add("CAPTCHA");
  if (has(/cloudflareinsights|cdn-cgi\//) || isCloudflare(h)) t.add("Cloudflare");
  if (h["x-vercel-id"] || /vercel/i.test(h["server"] || "")) t.add("Vercel");
  if (h["x-nf-request-id"] || /netlify/i.test(h["server"] || "")) t.add("Netlify");
  const server = String(h["server"] || "").toLowerCase();
  if (server.includes("nginx")) t.add("Nginx");
  if (server.includes("apache")) t.add("Apache");
  if (server.includes("litespeed")) t.add("LiteSpeed");
  if (/^(php|express)/i.test(h["x-powered-by"] || "")) t.add(String(h["x-powered-by"]).split("/")[0]);
  return [...t];
}

// CSS keywords and zero values say nothing about the design, so leave them out.
const notKeyword = (v) => !/^(inherit|initial|unset|revert|auto|none|0|0px)$/i.test(v.value);

async function analyzeSite(rawUrl) {
  const url = toUrl(rawUrl);
  const started = Date.now();
  const { res, url: finalUrl, body: html } = await safeFetch(url, { maxBytes: 1_500_000, timeoutMs: 9000 });
  const ms = Date.now() - started;
  const h = headerMap(res);
  if (!/html/i.test(h["content-type"] || "") && !/<html|<head|<body/i.test(html.slice(0, 2000))) {
    throw new Error("That address didn't return a web page.");
  }
  const base = new URL(finalUrl);

  // Inline CSS + up to 6 linked stylesheets (each size- and time-capped).
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n")
    + "\n" + [...html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(";");
  const sheetUrls = [...new Set(linkHrefs(html, "stylesheet").map((u) => { try { return new URL(u, base).toString(); } catch { return null; } }).filter(Boolean))].slice(0, 6);
  const sheets = await Promise.allSettled(sheetUrls.map((u) => safeFetch(u, { maxBytes: 700_000, timeoutMs: 6000 })));
  const external = sheets.filter((s) => s.status === "fulfilled").map((s) => s.value.body);
  const css = inline + "\n" + external.join("\n");

  const googleFonts = [];
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>\s]+)/gi)) {
    for (const p of m[1].replace(/&amp;/g, "&").split("&")) {
      if (!p.startsWith("family=")) continue;
      for (const fam of decodeURIComponent(p.slice(7)).split("|")) googleFonts.push(fam.split(":")[0].replace(/\+/g, " "));
    }
  }
  const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").replace(/\s+/g, " ").trim().slice(0, 140);
  const iconHref = linkHrefs(html, "icon")[0] || linkHrefs(html, "apple-touch-icon")[0] || "/favicon.ico";
  let favicon = ""; try { favicon = new URL(iconHref, base).toString(); } catch {}
  if (favicon.startsWith("data:")) favicon = "";

  const fonts = extractFonts(css);
  for (const g of googleFonts) if (!fonts.some((f) => f.name.toLowerCase() === g.toLowerCase())) fonts.push({ name: g, count: 1 });

  return {
    url: url.toString(), finalUrl, status: res.status, responseMs: ms,
    sizeKB: Math.round(Buffer.byteLength(html) / 1024), cssKB: Math.round(Buffer.byteLength(css) / 1024),
    title, description: metaContent(html, "description").slice(0, 220) || metaContent(html, "og:description").slice(0, 220),
    themeColor: metaContent(html, "theme-color"), favicon, lang: ((html.match(/<html[^>]*\blang\s*=\s*["']([^"']+)/i) || [])[1] || ""),
    colors: extractColors(css + "\n" + (metaContent(html, "theme-color") || "")),
    tokens: extractTokens(css),
    fonts: fonts.slice(0, 6),
    radii: topValues(css, /border-radius\s*:\s*([^;}{]+)/gi, 12).filter(notKeyword).slice(0, 6),
    fontSizes: topValues(css, /font-size\s*:\s*([^;}{]+)/gi, 12).filter(notKeyword).slice(0, 6),
    tech: detectTech(html, css, h),
    counts: {
      scripts: (html.match(/<script\b/gi) || []).length,
      stylesheets: sheetUrls.length,
      images: (html.match(/<img\b/gi) || []).length,
      links: (html.match(/<a\b/gi) || []).length
    },
    https: finalUrl.startsWith("https:"), cloudflare: isCloudflare(h), server: h["server"] || "",
    securityHeaders: securityHeaders(h)
  };
}

// ---------- 3) Domain & email health ----------
const resolver = new dnsp.Resolver({ timeout: 4000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8"]);
const safe = (p) => p.catch(() => []);

function certInfo(host) {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 6000 }, () => {
      const c = sock.getPeerCertificate();
      const validTo = c && c.valid_to ? new Date(c.valid_to) : null;
      resolve({
        ok: sock.authorized, error: sock.authorized ? "" : String(sock.authorizationError || ""),
        issuer: (c && c.issuer && (c.issuer.O || c.issuer.CN)) || "",
        validTo: validTo ? validTo.toISOString() : "",
        daysLeft: validTo ? Math.floor((validTo - Date.now()) / 86400000) : null
      });
      sock.end();
    });
    sock.on("timeout", () => { sock.destroy(); resolve({ ok: false, error: "timeout" }); });
    sock.on("error", (e) => resolve({ ok: false, error: e.code || e.message }));
  });
}

async function domainCheck(raw) {
  let domain = String(raw || "").trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#:]/)[0].replace(/\.$/, "");
  if (!/^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error("Enter a domain like example.com");

  const [a, aaaa, ns, mx, txt, dmarcTxt] = await Promise.all([
    safe(resolver.resolve4(domain)), safe(resolver.resolve6(domain)), safe(resolver.resolveNs(domain)),
    safe(resolver.resolveMx(domain)), safe(resolver.resolveTxt(domain)), safe(resolver.resolveTxt("_dmarc." + domain))
  ]);
  if (!a.length && !aaaa.length && !ns.length && !mx.length) throw new Error("That domain doesn't seem to exist.");

  const flat = (rows) => rows.map((r) => r.join(""));
  const spf = flat(txt).find((t) => /^v=spf1/i.test(t)) || "";
  const dmarc = flat(dmarcTxt).find((t) => /^v=DMARC1/i.test(t)) || "";
  const dmarcPolicy = ((dmarc.match(/\bp=([a-z]+)/i) || [])[1] || "").toLowerCase();

  let ssl = { ok: false, error: "no web server" };
  if (a.length || aaaa.length) {
    try { await assertPublicHost(domain); ssl = await certInfo(domain); } catch (e) { ssl = { ok: false, error: e.message === "blocked" ? "blocked" : (e.code || e.message) }; }
  }
  const nsText = ns.join(" ").toLowerCase();
  const dnsHost = nsText.includes("cloudflare") ? "Cloudflare" : nsText.includes("awsdns") ? "AWS Route 53" : nsText.includes("googledomains") || nsText.includes("google") ? "Google" : nsText.includes("domaincontrol") ? "GoDaddy" : nsText.includes("registrar-servers") ? "Namecheap" : "";

  const checks = [
    { label: "Website resolves", ok: a.length + aaaa.length > 0, detail: a.length ? a.slice(0, 3).join(", ") : "No A/AAAA record" },
    { label: "Valid HTTPS certificate", ok: !!ssl.ok, detail: ssl.ok ? `${ssl.issuer || "Unknown issuer"} · expires in ${ssl.daysLeft} days` : `Problem: ${ssl.error || "unknown"}` },
    { label: "Can receive email (MX)", ok: mx.length > 0, detail: mx.length ? mx.sort((x, y) => x.priority - y.priority).slice(0, 3).map((m) => m.exchange).join(", ") : "No MX records, so email to this domain bounces" },
    { label: "SPF (stops spoofed mail)", ok: !!spf, detail: spf ? spf.slice(0, 120) : "No SPF record found" },
    { label: "DMARC policy", ok: !!dmarc && dmarcPolicy !== "none", detail: dmarc ? `p=${dmarcPolicy || "?"}${dmarcPolicy === "none" ? " (monitor only)" : ""}` : "No DMARC record found" }
  ];
  if (ssl.ok && ssl.daysLeft !== null && ssl.daysLeft < 14) checks[1] = { ...checks[1], ok: false, detail: `Expires in ${ssl.daysLeft} days, renew soon` };

  const tips = [];
  if (!mx.length) tips.push("Add MX records so people can email you (Cloudflare Email Routing is free, or use Google Workspace).");
  if (!spf) tips.push("Add an SPF record so your emails don't land in spam.");
  if (!dmarc) tips.push("Add a DMARC record to stop others spoofing your domain.");
  else if (dmarcPolicy === "none") tips.push("Move DMARC from p=none to p=quarantine once mail is flowing correctly.");
  if (!ssl.ok && (a.length || aaaa.length)) tips.push("Fix the HTTPS certificate so browsers don't show a security warning.");

  return {
    domain, a, aaaa, ns, dnsHost, mx: mx.map((m) => ({ exchange: m.exchange, priority: m.priority })),
    spf, dmarc, dmarcPolicy, ssl, checks, tips,
    score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100)
  };
}

module.exports = { isPrivateIp, assertPublicHost, safeFetch, probe, analyzeSite, domainCheck, friendlyError };
