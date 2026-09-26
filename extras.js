// The end panels, over the film: Explore the cost (what the film took to make, from making-of.js) and The team.
// film.js puts buttons() in the credits bar, gives an open panel the keyboard (isOpen) and calls close() on every chapter change.
// A panel is a modal <dialog> laid over the frame; the film, and the credits rolling behind it, keep running.
(function () {
  "use strict";
  const H = (window.HOLES = window.HOLES || {});

  const CSS = `
  .hx { position: fixed; inset: auto; margin: 0; padding: 0; border: 0; max-width: none; max-height: none; box-sizing: border-box;
    overflow: hidden auto; overscroll-behavior: contain; container-type: size;
    background: #000; color: var(--paper); font-family: var(--serif); line-height: 1.4;
    scrollbar-width: thin; scrollbar-color: rgba(243, 238, 228, .25) transparent;
    opacity: 0; transition: opacity .5s ease, overlay .5s allow-discrete, display .5s allow-discrete; }
  .hx[open] { opacity: 1; }
  @starting-style { .hx[open] { opacity: 0; } }
  .hx::backdrop { background: rgba(0, 0, 0, 0); transition: background-color .5s ease, overlay .5s allow-discrete, display .5s allow-discrete; }
  .hx[open]::backdrop { background: rgba(0, 0, 0, .6); }
  @starting-style { .hx[open]::backdrop { background: rgba(0, 0, 0, 0); } }
  /* more below: the bottom edge fades out while there is */
  .hx::after { content: ""; position: sticky; bottom: 0; display: block; height: 40px; margin-top: -40px; pointer-events: none;
    background: linear-gradient(rgba(0, 0, 0, 0), #000); }
  .hx :focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
  .hx:focus-visible { outline: 2px solid var(--gold); outline-offset: -6px; }   /* the scrolling panel itself takes focus, for arrow keys */

  .hx-top { position: sticky; top: 0; height: 0; z-index: 1; }
  .hx-close { position: absolute; top: clamp(12px, 1.5cqi, 22px); right: clamp(12px, 1.5cqi, 22px); padding: 7px 16px;
    font: 15px var(--serif); color: var(--paper); background: #000; border: 1px solid rgba(243, 238, 228, .38);
    border-radius: 2px; cursor: pointer; transition: border-color .25s, background-color .25s; }
  .hx-close:hover { border-color: var(--gold); background-color: rgba(217, 178, 106, .1); }

  .hx-body { box-sizing: border-box; max-width: 1180px; margin: 0 auto; padding: clamp(36px, 3.4cqi, 48px) clamp(20px, 5cqi, 72px) 56px; }
  .hx-head { text-align: center; }
  .hx-kicker { margin: 0; font-weight: 400; font-size: 13px; letter-spacing: .26em; text-transform: uppercase; color: var(--gold); }
  .hx-hero { margin: 8px 0 0; font-size: clamp(34px, 4.2cqi, 60px); line-height: 1.05; letter-spacing: -.015em; font-variant-numeric: lining-nums; }
  .hx-exact { margin: 8px 0 0; font-style: italic; font-size: 16px; color: var(--dim); font-variant-numeric: lining-nums; }
  .hx-lede, .hx-note, .hx-figs em, .hx-src, .hx-line { text-wrap: pretty; }

  .hx-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 40px clamp(36px, 6cqi, 88px); margin-top: clamp(28px, 2.8cqi, 40px); }
  .hx-h { margin: 0; font-weight: 400; font-size: 12.5px; letter-spacing: .22em; text-transform: uppercase; color: var(--dim); }
  .hx-lede { margin: 6px 0 18px; font-style: italic; font-size: 15px; line-height: 1.45; color: var(--dim); }
  .hx-bars { list-style: none; margin: 0; padding: 0; }
  .hx-bars li + li { margin-top: 15px; }
  /* name, then value and share; on a narrow line the value and share drop below the name, never splitting it */
  .hx-row { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 14px; margin: 0; font-size: 17px; }
  .hx-n { flex: 1 1 auto; }
  .hx-vp { display: flex; align-items: baseline; gap: 14px; margin-left: auto; white-space: nowrap; font-variant-numeric: lining-nums tabular-nums; }
  .hx-p { width: 4.3em; text-align: right; font-size: 14.5px; color: var(--dim); }
  .hx-bar { height: 5px; margin-top: 7px; background: rgba(243, 238, 228, .1); forced-color-adjust: none; }
  .hx-bar i { display: block; height: 100%; background: var(--gold); border-radius: 0 2.5px 2.5px 0; }
  .hx-note { margin: 6px 0 0; font-style: italic; font-size: 14px; line-height: 1.4; color: var(--dim); }

  .hx-sec { margin-top: clamp(36px, 4cqi, 52px); padding-top: clamp(28px, 3cqi, 36px); border-top: 1px solid rgba(243, 238, 228, .12); }
  .hx-figs { list-style: none; margin: 18px 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 26px clamp(24px, 3.5cqi, 48px); }
  .hx-figs b { display: block; font-weight: 400; font-size: clamp(28px, 2.7cqi, 38px); line-height: 1.1; font-variant-numeric: lining-nums; }
  .hx-figs small { font-size: .52em; color: var(--dim); }
  .hx-figs span { display: block; margin-top: 10px; font-size: 11.5px; letter-spacing: .13em; text-transform: uppercase; }
  .hx-figs em { display: block; margin-top: 6px; font-size: 14px; line-height: 1.45; color: var(--dim); }
  .hx-src { margin: clamp(36px, 4cqi, 52px) auto 0; max-width: 72ch; text-align: center; font-style: italic; font-size: 14px; line-height: 1.5; color: var(--dim); }

  .hx-team .hx-body { min-height: 100%; display: flex; flex-direction: column; justify-content: center; }
  .hx-cards { list-style: none; width: 100%; max-width: 940px; margin: clamp(28px, 3.6cqi, 48px) auto 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px clamp(24px, 4cqi, 56px); }
  .hx-card { position: relative; text-align: center; }
  .hx-card img { display: block; width: clamp(76px, 8cqi, 116px); height: auto; aspect-ratio: 1; margin: 0 auto 18px; border-radius: 50%; object-fit: cover;
    box-shadow: 0 0 0 1px rgba(243, 238, 228, .25); transition: box-shadow .3s; }
  .hx-card h3 { margin: 0; font-weight: 400; font-size: clamp(20px, 1.9cqi, 26px); }
  .hx-card p { margin: 4px 0 0; font-style: italic; font-size: 16px; color: var(--dim); }
  .hx-card a { display: inline-block; margin-top: 18px; padding: 8px 18px; font-size: 15px; color: var(--paper); text-decoration: none;
    border: 1px solid rgba(243, 238, 228, .38); border-radius: 2px; transition: border-color .25s, background-color .25s; }
  .hx-card a::after { content: ""; position: absolute; inset: 0; }   /* the whole card opens the profile */
  .hx-card:hover a, .hx-card a:focus-visible { border-color: var(--gold); background-color: rgba(217, 178, 106, .1); }
  .hx-card:hover img { box-shadow: 0 0 0 1px var(--gold); }
  .hx-line { margin: clamp(32px, 4cqi, 52px) auto 0; max-width: 60ch; text-align: center; font-style: italic; font-size: 16px; line-height: 1.5; color: var(--dim); }

  @container (max-width: 900px) { .hx-cols { grid-template-columns: minmax(0, 1fr); } }
  @container (max-width: 760px) { .hx-figs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @container (max-height: 480px) {   /* a short panel: the team still fits without scrolling */
    .hx-team .hx-body { padding-top: 24px; padding-bottom: 32px; }
    .hx-cards { margin-top: 16px; }
    .hx-card img { width: 60px; margin-bottom: 10px; }
    .hx-card a { margin-top: 10px; }
    .hx-line { margin-top: 18px; }
  }
  @container (max-width: 540px) {
    .hx-body { padding-top: 68px; }   /* clear of Close */
    .hx-cards { grid-template-columns: minmax(0, 1fr); gap: 22px; }
    .hx-card { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 18px; align-items: center; text-align: left; }
    .hx-card img { grid-row: span 3; width: 72px; margin: 0; }
    .hx-card a { justify-self: start; margin-top: 10px; }
  }
  @media (prefers-reduced-motion: reduce) { .hx, .hx::backdrop, .hx-close, .hx-card img, .hx-card a { transition: none; } }
  `;
  document.head.appendChild(document.createElement("style")).textContent = CSS;

  // ---------- numbers, in words ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const int = n => Math.round(n).toLocaleString("en-US");
  const words = n => n >= 9.995e8 ? (n / 1e9).toFixed(1) + " billion" : n >= 9.995e5 ? (n / 1e6).toFixed(1) + " million"
    : n >= 1e4 ? Math.round(n / 1e3) + " thousand" : int(n);                                   // 201567385 → 201.6 million
  const share = (v, all) => { const p = 100 * v / all; return (p >= .1 || !p ? p.toFixed(1) : p.toPrecision(1)) + "%"; };   // 0.0006%
  const hm = s => {                                                                           // 40545 → 11 h 16 min
    const m = Math.round(s / 60), h = Math.floor(m / 60), r = m % 60;
    return [h && `${h}<small> h</small>`, (r || !h) && `${r}<small> min</small>`].filter(Boolean).join(" ");
  };

  // ---------- Explore the cost: every number comes from making-of.js ----------
  function cost() {
    const d = H.makingOf, t = d.tokens, all = t.total;
    const bar = (name, v, note) => `<li><p class="hx-row"><span class="hx-n">${esc(name)}</span><span class="hx-vp"><span>${words(v)}</span>` +
      `<span class="hx-p">${share(v, all)}</span></span></p><div class="hx-bar" aria-hidden="true"><i data-w="${(100 * v / all).toFixed(4)}%"></i></div>` +
      (note ? `<p class="hx-note">${note}</p>` : "") + `</li>`;
    const fig = (value, label, note) => `<li><b>${value}</b><span>${label}</span>${note ? `<em>${note}</em>` : ""}</li>`;
    const day = s => s.split(", ")[0], at = s => day(d.start) === day(d.asOf) ? s.split(", ").pop() : s;   // "02:13 IST"
    return `
      <header class="hx-head">
        <h2 id="hx-title" class="hx-kicker">The cost of this film</h2>
        <p class="hx-hero">${words(all)} tokens</p>
        <p class="hx-exact">${int(all)} tokens, in ${int(t.calls)} calls to ${esc(d.model)}</p>
      </header>
      <div class="hx-cols">
        <section aria-labelledby="hx-what">
          <h3 id="hx-what" class="hx-h">What the tokens were</h3>
          <p class="hx-lede">Every call re-reads the conversation so far. That is most of them.</p>
          <ul class="hx-bars">
            ${bar("Re-read from cache", t.cache_read, "the model re-reading the conversation so far")}
            ${bar("Written to cache", t.cache_write, "new context, stored to be re-read: files, tool results, messages")}
            ${bar("Written by Claude", t.output, "every word of code, shader, copy and reasoning it produced")}
            ${bar("New input", t.input, "sent fresh, outside the cache")}
          </ul>
        </section>
        <section aria-labelledby="hx-who">
          <h3 id="hx-who" class="hx-h">Who used them</h3>
          <p class="hx-lede">The director, and the Claude agents it sent out to work in parallel.</p>
          <ul class="hx-bars">${d.parts.map(p => bar(p.name, p.total)).join("")}</ul>
        </section>
      </div>
      <section class="hx-sec" aria-labelledby="hx-time">
        <h3 id="hx-time" class="hx-h">Time</h3>
        <ul class="hx-figs">
          ${fig(hm(d.wallSeconds), "wall clock", `from the first message, with the reference video, at ${esc(at(d.start))}, to ${esc(at(d.asOf))}`)}
          ${fig(hm(d.activeSeconds), "the director at work", "active time in the main session")}
          ${fig(hm(d.agentSeconds), "the agents, added up", "they worked in parallel, so this can add up to more than the wall clock")}
          ${fig(hm(d.longestPauseSeconds), "the longest pause", "waiting for the usage limit to reset")}
        </ul>
      </section>
      <section class="hx-sec" aria-labelledby="hx-made">
        <h3 id="hx-made" class="hx-h">What was made</h3>
        <ul class="hx-figs">
          ${fig(int(d.code.lines), "lines of code")}
          ${fig(int(d.code.glslLines), "of them GLSL shader code")}
          ${fig(int(d.code.files), "files")}
          ${fig(int(d.code.commits), "commits")}
        </ul>
      </section>
      <p class="hx-src">Measured from the Claude Code session transcripts of this project: every model call by the director and its agents,
        from the first message to ${esc(d.asOf)}.</p>`;
  }

  // ---------- The team ----------
  const TEAM = [["Karthik", "l69d"], ["vikas kumawat", "vikaskumawat"], ["ATHUL VR", "Athullvr"]];
  function team() {
    return `
      <header class="hx-head"><h2 id="hx-title" class="hx-kicker">The team</h2></header>
      <ul class="hx-cards">${TEAM.map(([name, h]) => `
        <li class="hx-card">
          <img src="${AVATARS[h]}" alt="" width="96" height="96">
          <h3>${name}</h3>
          <p>@${h}</p>
          <a href="https://github.com/${h}" target="_blank" rel="noopener">View<span class="sr"> ${name}’s profile</span> on GitHub<span class="sr"> (opens in a new tab)</span></a>
        </li>`).join("")}
      </ul>
      <p class="hx-line">Made with Claude (Opus 5.5) and a team of Claude agents: the art media, the raid, the airfield, the score,
        a code review and a sound engineering pass.</p>`;
  }

  // ---------- the panel ----------
  let dlg = null, body = null, ctx = null, opener = null;
  function build() {
    dlg = document.createElement("dialog");
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "hx-title");
    dlg.setAttribute("closedby", "any");   // Esc, Close, or a click outside the panel
    dlg.innerHTML = `<div class="hx-top"><button type="button" class="hx-close">Close</button></div><div class="hx-body"></div>`;
    body = dlg.querySelector(".hx-body");
    dlg.querySelector(".hx-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => { if (opener && opener.isConnected) opener.focus({ preventScroll: true }); opener = null; });
    // anyone clicking, scrolling or keying through a panel is still here: hold off the booth's idle reset
    for (const type of ["pointerdown", "keydown", "wheel"]) dlg.addEventListener(type, () => ctx && ctx.touch(), { capture: true, passive: true });
    document.body.appendChild(dlg);
  }
  // exactly over the film; a frame too short to read in (a phone) gives the panel the whole screen
  function place() {
    const r = ctx.frame.getBoundingClientRect(), full = r.height < 380, s = dlg.style;
    s.left = full ? "0" : r.left + "px"; s.top = full ? "0" : r.top + "px";
    s.width = full ? "100%" : r.width + "px"; s.height = full ? "100%" : r.height + "px";
  }
  addEventListener("resize", () => requestAnimationFrame(() => { if (dlg && dlg.open) place(); }));   // after film.js lays out the frame
  function open(kind, el) {
    if (!dlg) build();
    opener = el;
    dlg.className = "hx hx-" + kind;
    body.innerHTML = kind === "cost" ? cost() : team();
    for (const i of body.querySelectorAll("[data-w]")) i.style.width = i.dataset.w;
    place();
    if (!dlg.open) dlg.showModal();   // one panel at a time: an open one just changes its contents
    dlg.scrollTop = 0;
  }

  H.extras = {
    buttons(c) {
      ctx = c;
      return [
        ...(H.makingOf ? [{ label: "Explore the cost", onClick: e => open("cost", e.currentTarget) }] : []),
        { label: "The team", onClick: e => open("team", e.currentTarget) },
      ];
    },
    isOpen: () => !!(dlg && dlg.open),
    close() { if (dlg && dlg.open) dlg.close(); },
  };

  // GitHub avatars, embedded: the film runs offline, and its Artifact version blocks outside images
  const AVATARS = {
    "l69d": "data:image/jpeg;base64,/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAMAAwAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AJrfmPH1qKRc7T6U62PLAetRXjmGEkdc4Fc5LGTNtn2gcEcVAeCanPzpG5HJFV58hWINUiGAq7ZcLVCElo1PqKvWpxTYDZvvmoZOAKmlPzmq8x4pgC8inqB3qBX+Sqd1rMFsNq/vHHYHgfjQCu9jRk4xTDJEAU8xQeyk81xV34iKXMjRsVJOWIOce1VDq8ksi3G8s+eCe1OxqqbO7kv7a1YiSQblGSo61nf8JKnnhWhwh7hua5GTU3uAJHTBc4yKqT3jxcbskNxzSKVNdT1GC6iuIhJE4ZSOtTNgY9xXnWn68sUDJIc5bOOa6Gx8UQzuscy4xxuFSS4NHSJjfgVZgOJJAT1Xt9aqIyEBkIYHBGDUyny5SSOooMy3j7oxk0OenSmxuDjNI5I78AUhkMp5Bqsybmz1PerExyaSJdwORznimIb5ZXjvisib72BnArbuCTJx9Ky7yHDlhgVUQNK3b5/rzUWpsfLUep6U6DIIPtUV8vyg1CGERIiVTzSyruzxwaacqqH0xVhguwHrkUEFSFdsYX0q1b8MagFSxN8x+lWMJSM9e9YV/r1vFK0SfMV4J7VL4kvVtbAjeUZ+hHt1rzW61ByditkdTirjG5cY33OsvfEu1NsJUg8E56GsK91VnhYqp809GrAeZmP48VLCXmUoAXY9AKrlRqklsRbs/M5JOe5q1FIZM4PGcKuOTVqz083ChWgy+QnIPGa1p9DjtQIY2BkHUgcd/wDP41LdjSMWzLlHlnbG+7Zz0/pVOZ8OXZSvfjpXQtoTlBPJMUk3fKp4J96g1HT4Y7Ngz/vBk885rPmRbg7HN/aDv3AVaju9jK6k4Hpx+dVPszmNnIAC+vercVs6xbGAyRkfQirdjFXudZo2sTQhfJHmK45VicCu7glaaNXZdpIzivJdLuTbz/Z3I5+5nsfSvStIu7Z44ooXJYR/OCehqHuRUXU10cL19OKPM3E1Exwob0pIzliPbvRYyJJOtNjfHHqaWTkg+1Rg4YY9aAEuJSl16jB4qnN8yZGTVq6GZwagZPlb2poC5FyeaS5XepGajjkVQ2SOTThJucjPGKgBJBtjHsBSqSUXPOBTrhh5Q46DmmRkHB/OmSwdcNUM0vkwyPkAhTjnv2qUMZG984pt1GEVS0e49QcdKtK5UY3OC1f+0dSVY41ll25JZvWuYuLG4t5P3qEE969IuJ2MTgIcng4HSsZ7GSSJnK557DpXQlZHQonHCyd5diKWI549K6a18OfYrS31BmaTfkME7cD+WaWO2VnLOhORwwH869E0O3W70n7EYwV/hY8AHvz/AJ6VnJ2NYQOC05ib5mTerc9PYfy613cOiWe+O4ePJU5CnnLep9asN4SjgcNEYyf4sgfoa17PSYIUdnO6XqGJzj2FZSd9TaMWjIl0KyveZy4kY4XZgY75NO1DwPaS6SEDKZQw2sWBC+ufU1uC1iLg7iCOnvUpt0TkSbQeCKixTPM/+Ect7bWkiuYxMo/euoxhF5wD2z0rkdegNlcOu3GTlCp6DPFev6vDOLeREKlH9utef65pcKzxC6I2upPy8ZoT1IlHQ4aWX99HP/Gfmb613Xg7WVkja2dS0gOVPoMdK4vVQI73y1GAmFo0nUptOuzJAzZIwcdxWjVzlkr6HszMNg96jjYhiKxvD15Nf28k1w7M2AE44C//AK/5VsJw4pGDVtCw5+VTUX8Q+tPY5QGmr6+9BIXAyQagJ4b3FTy4NQkcj0pjKzHczA+nH1FPjmCrnks2AMCo24IPrSW2FDE/3sfhWYmXn+bIPpTZWMaAAZ4phlG0Uksq8c9uaoQ+EHOBjr3rN1O4uYriQHgHABwePap3mBVxmsTVJroOnPyE5B3enrWsNzSm9RWv986Z+Rx1YdMe4q5CJJm3BQOMHb396yLCRbxngkXbOpwpxwRXQWMHlsBvPynoeP8AIrV7HTHctafp8cBHmJuTcG2E5Brqra4s7W32CNY17KBye9YscRfB4A68VchtgoViAyZxgcEVhLU6Yl6a8VwHjjfb70W920uFZcY647U/7PGiA/MR6VLbWqOeBgkfjWbtYtCyq4UMGBU9KpyzSBcA/gauXQCQcOMZ6VRI8wgYpDYzzWmjMbYDCsq+tUu4fK+V2AwUbAH51ryW7ZXGc9eRg1n3VkNwkAw1NMhxPHdd0qeHUJPM4ZmzjOf1qmsb2FyEm2bwBwDnH1rufEFtM8uJFBwflPt2rEW3s5CzzoI3ByQe9arY5pR1Oh8NX7R2FtbyqAjglX6dzXRDsa56zayljW1t5Q0kgO0ntnuPyroIo/LiRc5CjGakwqRsyx/ywH1qMdCTUi/6vFRg8GkYse4yKZjJX60/qBSgEOp9DQBlGQKg56HNIj5L4I5NVJ2K4X1606B8AjNSSy27HHFQyPlgM8UrSYbHHSqbzEkAdM81SAluH2ue3Fc9rWqMR5KbSqcn681q6hN5YZyDgLniuUuZftErA43sOw4raCNKa1Fh1RZMNu2zKeDXb6Je/wBrW6tInlzoPvqOHrzKO2YPgNg5xxXp2iQQWpHlAsY1GVZ+3r7mnJ2OumrnUWyb4gwI446VY3FABtOD7VDYyZUhlOD0qylpcPnlCh6c4P5Vi2dKQsV0ysMnj3q0b1jcAjGwDHFV5LOWNAWHNQmJwMgE1Ogya8mMkobnGPyqPzc47UnJX51PFSRopPBBosK5KbpzEE2gN2aqrmbo/wAynvitKOAFRuUMPTpUU8SRr8p/AHNJFXOe1G1ikhfcnPYgVy13p6XDBZIQMfxetdnfyIkZy2OM1xt/dTzP5UOQevqTWkEZTFsdGsLGRZY5CkinoW610FkjtAwbqG4HtXNQsjSKikbwgy2Rz/h9K6mxJRCGOTjg0SOaolYlUny6hB5IqUHAx+lQ/wARqTmZKDxT8ZAPvUKNVhcED60COXum2utNgf5h9eaS+HzgikgwBn2zRYhh5pNweeKQcsaYg+YmnR/fNMEF4hYkKcEqOa5i7tHt7sbiuScjFdjs8xzx2rB120MskSxp+8PetIy6G1Pc5i5udl84zuUHg+teh+Brm1u4ZopXZyBnyyMDnjOfx6VzGq+DtY0sol1aNvfB3KCe3T8O9dP4D0q6srqSedcQkFWTnn0PT2pTaaOummmdZFZXFqpMP7yIEn3UelaNhfDyyrykn0dcFfb6VPBNCsO0bt+eeaJLY3UICAAgkg+lZs7EXEnhe3P7wMwHANZ5uIHQsQRuOcY6VmotxbSMspOAeorRiMMi7sAnufSloJoeLcSRljyPWozYS8eU+X7DHX8asrLFGPlbpVq3ubd+ARmmS0VbWSVSUmiZWHHI4NNul3cgD8K13eKRMEjjuaoXAi/vigRzeopGIm3NjjvXn2t6nHZ2+1drHdgNtz/SvRdZtkkgIYAqeOvWqo0LQbyzuLWXTozcrGQhkYjc2Ox7HNPm5SJRbR5pp3ia2WVY5LXILfeU84rv7MI+2aN9ysvBryuHR3XW/sW9VYNjc3Az2r1bTbNLGzjiUk4HXPem2ck5NaMsPw1QMcOankznNV5R3FIwbCNv3mM1cjPIFUIgdw7VdjPzg+tIk5i6G47uSPSo4zzx6UzzjJ1xxT4iKCWIvU0qf6yiPmU+hFKpAuMejUwLsDYkIPpV/Q7SC58T6akyBg06A5+tZQfDjHvU8F49rqFrcRna0cqsD6EGmjSD1O98XSltSaKNgEC4Ix65/wAaqaLOtxK9s+0hl4IABH+c5qlq1wssPnDrhix9e4rn9L1J7XUEuUORuwwz2qOh6UTtGtfLkxggg8j0NWEkeNPlJDDoanupo5ZiyOGLAbsevr+NHlpwZFJGOoo3NUzNeX5y0qq4J7nBqMiEEtECh9M5rVexMibowJVPIyOapT2/l53Rsje4qSiiRLvLIu8d8dqoyX62l4CNy5PcZFdHaW8ZjaU5Vx2FVr+W1KkzW+9yMHKA5/GrTAbBqfnjCoFPeqt5LhWbJAAPU81n3E8cC5QeVg5HoKw9T1nzCyCQH6NiqsJlptQlmZLcSEx+bk5A5/wq1cXBW9kVmw+7dkDHFYukyC81KzgHA8zcfVsVvr4e1bVdSuCLfy33YjZjhaltXIZxviFvsHiQ6ilpugmwxV14Jxhsfjk12NsY2tYmiXajKGA9jzXQ+KvDFnD4c0+0uCHmQKjFerYGC35k/nWDHCLe3ihznYoXPrgYoOCtuJJ0qJ1yP1pbgcg5P51Gp55PanYwBMcDFWwCGH1qHaA49KmOPlxSEcTCpfJ7Zqcgo+0D3qaKJVz3JanSLlycZ+X0oJsVd21QR65oRstnvmo5GwSueAcU6PGW/SqsBOr5ellb5F9jUKn5qkZhsxVWKR2GlKL6xVFIkZOo9qpz+HUMp8qX7Pu65TcB/hWDaXEkTl43KsOhBqhrnjbW7JjHFJDtYffMeW/Xis3F30OynXWzPS1gmtEh8xldlUZYdGqydS2J8jHOc88143p3xE1xZPJuphMjgAF15XnOR/Kt2bxPdrM6xqjA/pSszojNS2PSIdbe3XnGOpwOlD+O7S1LLIqSj+4f615Jca1fXJYNIyoeynAqkJWZjudqLF6HpOo/EK0YOLa1SIHps5rkZ/F961x5q3L/AO4wBX8qz7WxFwATIMHknNSzaQCnmQJuC8Nn/CqsO5V1PxDcXUheSQL7J0rNF8GYHOafcWOd2PlIOCKz5IWiYA9O1Am2dVo+s2mhzRaldq0rc+VGv5Z/Cu58LfFCCe6uRNaT3BB/clVCAD35P9a8lj065v1RsgRjG0epr0fRtPNjYjeqCVuW2DgUrLc5qtVrQ39S1qfWbkTyoY0HCJmqUzc5pcAqD3pknXn0oONu+5BIOM1EBnvViQDy/wAKhVcsMGmSSBMuCT161YAwAO5qEHEwHap+SwBFIDneCpYevT0o6SdOq4pJOB8vHNOHOOKSEZd3ERJu9aEVhtyeSKsXj7pc/nTcfIp9K1WwDY1OcmnSrj8qlC8DFJOMNj2poCrHIVbjiq2p2a3lucqCydOKnIw1WLfng1LXUd7O5x1zpro8aJFI0i+o7Vvm3AmYJx04/CuitbZbi8gZhkA5b6DmkewQ3cmFG3eR+FJs7KDuc8sDhgM/OcAVct9J3KzPyT8v0Na1xaRxKZMYYkH8qt6aguHzj7xz+NK50kFvpbLANq4UdcVBPB5cisoK8nJB/Ku+g00LZ5AG4jmsrUdMHkFtmDnk0riPNtTBSQcjPfHesy5t5HtjIFJUHqK2dWiELtuB4JqfS7MXNpLE+cMMihgVfCllDdSl5Ax8oZA3EYOeDx9a79cYbA/KuY8KWf2aS/Qn51wPyNdKp9+ooOOt8Q8AYGaryEh8Z4qbkqAP51FKMS84zQYMJemeMVGvH506Q5XNNBA+oNMQSYLZqypztPfGaoSE7iQeKdHcYzjOcd6AMqYgDj1pEIwKJz8vWoI2y2M9qQiG4IDUK2VOPSmXfMmc9qLcEnBPtWi2GX1DCNQRjnjmmTIXcc1MqrsH6UgHzCkIoopEgytSOdroRwDxT5oCjb93fpimsjMhbBwDnkUPUZqaax3oR1PH58VchjBk4+o96raSPusOxBH51s2dp5lwqqRycVDZ2YbYz7u1MkLjHOODT/DUP+kqrjoa6O/039wXXGE4IH+fes/To/Kvd4XC5xSR0s663jAjA69qrX1oNroy4HQ+1a+mKG5JATGT9KTUYw0LEDknIOKCL6njPjixMWyVV4fg/WodBJLo46EAYrq/GNj5+jyHbyjBgfzrlNFQrAPrTKNQRfY9YkYH5Lhcg479/wDH8a0F+6O9Nlga4+zOwOEOP0qYJheRjmhHLX3uN7gelQSviTd6VID83rUMxAyTznnimczEMgZSRwM8VBkFd3FEjAqVBqqGPXNNIRYMuQ6nimoecAjmoi/PqT1pY8s45x702BRmfEdVYmww+tTz/cP1qqnX8agQXZy4PtSWxyeaJnyenSkt3yTirWwzVQZUUBPm3Z/CkgbKAe9SsmFzmpCwhOeKdGN8TCoydpBNW7WJnVgB1NMqxJpI+bb6f410iReVMHTK4bIxVTTdHmQF9oHXJNac5VQiqMlcZb1qGddGNkbKMssmxgAsi81z0K/vmU5BJ4rYgkJjjPePO76VBqsBjuo51ACv81Sje9zfsmAsYuRyNrH3qW8bdFtwcAA57EViwTtAQeo9KvXN4s8KKp5UVSehNtTnPEjhtOlH91QP1rjNKiMiqsQzzXXa4hbTbsjrs4rntDj+zzR7hgZB5ouWlodRd26TQxsuVZVByOnFUJ7dkRXKkBuauXN9BFHFvlUDBBwe/b+VXbEw6tZJEGyULbGz79KEzKcLo5ZuGxVeZs8dhWtfWZjmZcYdTyOhrIm6mqRxyjYqO4ZiRwM00rt/GkI6Gng7mA71ZFhAh6mpY1wiHnOaXogp/SIUrhYxXG9SKgCkLVgcik2E1A7ELD92Mrk1GvDYAxV54i0W0U2CzkkmVFQknoB3NWgSJrVSQK0YbZ5nCIhYnsK39D8F3dwizXCMiHkKeM/U9v512Npoem6cm6QeYR/CB8ufc96TNI02zjNO8IT32HfhR6V0UXh210yIKSNx5Pcn/AVqXOtCFdqKqL2ROtc/cXktxMzOTz27VLfY3jTS3J55VClIhgdM1lhg84jGT8wXP6mpy7PwOB0q1bWoQFiOB0zUGqHQP5EnI4H3h6irN8p+xKo5WPgfSsa/vhHeQoqfMW+bPHHTFbsWJLNkZgdoA47ikVYqqgMeKI42WRec5GKj8zypDGx4HQ+tSo4Zxjj600BQ1OMtYSx4yzcCuekgKybcEErgAV6A1iJIFd8MrYyBXLasiW+uSJHjagGPyzSKTOSuy6nBGCp5ra0K8FrAjknG7JGapalH85yuPM5rV0jT47ryoVGcDAx6571QmdS4sNdRVZgsuOJF4YVzGs6DfadulkQSQf8APVDkfj6VZuYnsbkqCVdDww4zWrp3iUAeVeIHUjBJGcj3pqRjOmnqcA0ZXtxUYDKwOPpXpV34f0nVojNYuIZD/COlchqGj3OnyEPH8ueGHQ1pc5pU3EzC+9cgYIHIpQ25OKdL93pUK4AIzg0mZn//2Q==",
    "vikaskumawat": "data:image/jpeg;base64,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",
    "Athullvr": "data:image/jpeg;base64,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",
  };
})();
