/* ==========================================================================
   CONFIGURATION — edit these values
   ========================================================================== */

const CONFIG = {
  // Path to the background audio file (relative to index.html).
  audio: {
    src: "audio.mp3",
    volume: 0.8,      // 0 – 1
    loop: true,       // after the logo, restart the song + messages together
    fadeInMs: 2500,   // gentle volume fade-in when playback starts
  },

  // The sentences, shown one after another (any number works).
  messages: [
    "សួស្ដី កូន ៗ 👋",
    "ត្រៀមខ្លួនហើយឬនៅ​​📚",
    "កំុសេដហើយកំុភ័យប្រើត្រូវ date ប្រាប់គេផង 💬",
    "ថាបងត្រូវប្រលងយក Top 💪",
    "ចាំចប់បងនាំអូនទៅ Buffe 🍣🍗🍰",
    "អូខេណា បើអូនទំនេរ 👉👈",
    "សារេសារង់មកគាំទ្រ 🎉",
    "មកជម្រាបសួរ cher បង 🙏",
  ],

  // Text shown under the glowing orb at the very end ("" to hide it).
  endingText: "សំណាងល្អ",

  // Timing, in milliseconds.
  timing: {
    startDelay: 1200,   // pause before the first sentence
    enter: 1400,        // fade-in duration of each word
    stagger: 90,        // delay between consecutive words
    display: 3200,      // how long a sentence stays fully visible
    exit: 1000,         // fade-out duration
    gap: 500,           // pause between sentences
    endingHold: 10000,  // how long the logo stays before the song + messages restart
    endingFadeOut: 1500, // fade-out of the logo before replaying
    autoplayTimeout: 2500, // show "Tap to Begin" if audio hasn't started by then
  },
};

/* ==========================================================================
   Implementation
   ========================================================================== */

(() => {
  "use strict";

  const root = document.documentElement;
  const messageEl = document.getElementById("message");
  const finaleTextEl = document.getElementById("finale-text");
  const beginBtn = document.getElementById("begin");
  const canvas = document.getElementById("particles");

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const { timing } = CONFIG;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // Keep CSS transition timings in sync with the config.
  root.style.setProperty("--enter-ms", `${timing.enter}ms`);
  root.style.setProperty("--exit-ms", `${timing.exit}ms`);
  root.style.setProperty("--stagger-ms", `${timing.stagger}ms`);
  root.style.setProperty("--ending-fade-ms", `${timing.endingFadeOut}ms`);

  /* ---------- Audio ---------- */

  const audio = new Audio();
  audio.src = CONFIG.audio.src;
  audio.loop = true; // in case the song is shorter than the messages; playSequence() rewinds it each round
  audio.preload = "auto";
  audio.volume = 0;

  function fadeOutAudio(duration) {
    const from = audio.volume;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(Math.max((now - start) / duration, 0), 1);
      audio.volume = from * (1 - t);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function fadeInAudio() {
    const target = Math.min(Math.max(CONFIG.audio.volume, 0), 1);
    const duration = reducedMotionQuery.matches ? 0 : CONFIG.audio.fadeInMs;
    if (duration <= 0) {
      audio.volume = target;
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(Math.max((now - start) / duration, 0), 1);
      audio.volume = target * t;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Resolves to "playing", "blocked" (autoplay policy) or "unavailable" (missing/unsupported file).
  function tryPlay() {
    let playAttempt;
    try {
      playAttempt = audio.play();
    } catch {
      return Promise.resolve("unavailable");
    }
    if (!playAttempt) return Promise.resolve("playing"); // very old browsers

    const attempt = playAttempt
      .then(() => "playing")
      .catch((err) => (err && err.name === "NotAllowedError" ? "blocked" : "unavailable"));

    // If the file is slow to load, don't leave the viewer staring at a blank screen.
    const timeout = wait(timing.autoplayTimeout).then(() => "blocked");
    return Promise.race([attempt, timeout]);
  }

  /* ---------- Messages ---------- */

  // Khmer has no spaces between words, so use the browser's word segmenter when available.
  const segmenter = window.Intl && Intl.Segmenter
    ? new Intl.Segmenter(document.documentElement.lang || undefined, { granularity: "word" })
    : null;

  function splitWords(text) {
    const pieces = segmenter
      ? Array.from(segmenter.segment(text.trim()), (s) => s.segment)
      : text.trim().split(/(\s+)/);
    const parts = [];
    for (const piece of pieces) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) parts.push({ space: true });
      else parts.push({ text: piece });
    }
    return parts;
  }

  function renderMessage(text) {
    const inner = document.createElement("span");
    inner.className = "message__inner";

    let index = 0;
    splitWords(text).forEach((part) => {
      if (part.space) {
        inner.appendChild(document.createTextNode(" "));
        return;
      }
      const span = document.createElement("span");
      span.className = "word";
      span.style.setProperty("--i", index++);
      span.textContent = part.text;
      inner.appendChild(span);
    });

    messageEl.replaceChildren(inner);
    return inner.querySelectorAll(".word").length;
  }

  async function showMessage(text) {
    const wordCount = renderMessage(text);
    const reduced = reducedMotionQuery.matches;
    const staggerIn = reduced ? 0 : wordCount * timing.stagger;
    const staggerOut = reduced ? 0 : wordCount * (timing.stagger / 3);

    messageEl.classList.remove("is-leaving");
    await nextFrame();
    messageEl.classList.add("is-visible");

    await wait(timing.enter + staggerIn + timing.display);

    messageEl.classList.add("is-leaving");
    await wait(timing.exit + staggerOut);

    messageEl.classList.remove("is-visible", "is-leaving");
    messageEl.replaceChildren();
  }

  async function playSequence() {
    await wait(timing.startDelay);

    // Replay forever: messages → logo → fade out (with the music) → song + messages again.
    for (;;) {
      for (const text of CONFIG.messages) {
        await showMessage(text);
        await wait(timing.gap);
      }

      finaleTextEl.textContent = CONFIG.endingText || "";
      finaleTextEl.hidden = !CONFIG.endingText;
      document.body.classList.add("is-ending");
      particles.celebrate();

      await wait(timing.endingHold);
      if (!CONFIG.audio.loop) return; // stay on the logo for good

      const musicPlaying = !audio.paused && !audio.error;
      document.body.classList.add("is-ending-out");
      particles.calm();
      if (musicPlaying) fadeOutAudio(timing.endingFadeOut);
      await wait(timing.endingFadeOut);

      document.body.classList.remove("is-ending", "is-ending-out");
      if (musicPlaying) {
        audio.currentTime = 0;
        fadeInAudio();
      }
      await wait(timing.startDelay);
    }
  }

  /* ---------- Particles ---------- */

  const particles = (() => {
    const ctx = canvas.getContext("2d");
    const palette = ["255, 217, 160", "255, 122, 184", "124, 92, 255", "79, 209, 255", "244, 238, 230"];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let items = [];
    let rafId = 0;
    let burst = 0; // 0 → 1 glow boost for the finale

    function create() {
      const radius = Math.random() * 1.6 + 0.4;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: radius,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(Math.random() * 0.25 + 0.05) * (radius / 1.5),
        alpha: Math.random() * 0.5 + 0.2,
        twinkle: Math.random() * Math.PI * 2,
        color: palette[(Math.random() * palette.length) | 0],
      };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = Math.round(Math.min(110, Math.max(35, (width * height) / 14000)));
      while (items.length < target) items.push(create());
      items.length = target;
      items.forEach((p) => {
        if (p.x > width) p.x = Math.random() * width;
        if (p.y > height) p.y = Math.random() * height;
      });

      if (reducedMotionQuery.matches) draw(0);
    }

    function draw(dt) {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;

      for (const p of items) {
        if (dt) {
          p.x += p.vx * dt * (1 + burst * 0.6);
          p.y += p.vy * dt * (1 + burst * 0.6);
          p.twinkle += 0.03 * dt;

          if (p.y < -10) { p.y = height + 10; p.x = Math.random() * width; }
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
        }

        // Particles near the centre get a little brighter during the finale.
        const dist = Math.hypot(p.x - cx, p.y - cy) / Math.hypot(cx, cy);
        const boost = burst * (1 - dist) * 0.6;
        const a = Math.min(1, p.alpha * (0.65 + 0.35 * Math.sin(p.twinkle)) + boost);
        const glow = p.r * (4 + burst * 3);

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
        g.addColorStop(0, `rgba(${p.color}, ${a})`);
        g.addColorStop(0.3, `rgba(${p.color}, ${a * 0.35})`);
        g.addColorStop(1, `rgba(${p.color}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function start() {
      resize();
      if (reducedMotionQuery.matches) return;

      let last = performance.now();
      const loop = (now) => {
        const dt = Math.min(now - last, 50) / 16.67; // normalised to ~60fps frames
        last = now;
        draw(dt);
        rafId = requestAnimationFrame(loop);
      };
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
    }

    function stop() {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }

    function celebrate() {
      if (reducedMotionQuery.matches) return;
      const begin = performance.now();
      const ramp = (now) => {
        burst = Math.min((now - begin) / 2500, 1);
        if (burst < 1) requestAnimationFrame(ramp);
      };
      requestAnimationFrame(ramp);
    }

    function calm() {
      burst = 0;
    }

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    });

    reducedMotionQuery.addEventListener?.("change", () => {
      stop();
      start();
    });

    return { start, celebrate, calm };
  })();

  /* ---------- Startup ---------- */

  let started = false;

  function begin() {
    if (started) return;
    started = true;
    // Fade in now, or as soon as a slow-loading file actually starts playing.
    if (!audio.paused) fadeInAudio();
    else audio.addEventListener("playing", fadeInAudio, { once: true });
    document.body.classList.add("is-started");
    particles.start();
    playSequence();
  }

  async function onBeginClick() {
    beginBtn.removeEventListener("click", onBeginClick);
    beginBtn.classList.add("is-leaving");

    // Must be called synchronously inside the click for mobile Safari.
    await tryPlay();

    await wait(reducedMotionQuery.matches ? 200 : 800);
    beginBtn.hidden = true;
    begin();
  }

  async function init() {
    const result = await tryPlay();

    if (result === "blocked") {
      beginBtn.hidden = false;
      beginBtn.addEventListener("click", onBeginClick);
      beginBtn.focus({ preventScroll: true });
      return;
    }

    // "playing", or "unavailable" (no audio file) — run the experience either way.
    begin();
  }

  init();
})();
