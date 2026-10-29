document.getElementById("year").textContent = new Date().getFullYear();

// In-page links scroll to their section without adding "#section" to the address,
// so a refresh starts at the top. Shared links that include a #section still open there.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
if (!location.hash) window.scrollTo(0, 0);
// Re-align shared #section links once images above them have loaded and shifted the layout.
else addEventListener("load", () => document.getElementById(location.hash.slice(1))?.scrollIntoView());
// Whether the latest interaction was a pointer (mouse, touch, pen) or the keyboard.
let usingPointer = false;
addEventListener("pointerdown", () => { usingPointer = true; }, true);
addEventListener("keydown", () => { usingPointer = false; }, true);
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const id = link.getAttribute("href").slice(1);
  const target = id === "top" ? null : document.getElementById(id);
  if (id !== "top" && !target) return;
  event.preventDefault();
  if (target) target.scrollIntoView();
  else window.scrollTo(0, 0);
  // After a mouse or tap click, let go of focus so a later key press (a screenshot shortcut,
  // say) doesn't draw a focus ring around the link. Keyboard users keep their focus.
  if (usingPointer) link.blur();
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
});

// The loading spinner is started (and restarted) from script: iOS Safari can leave a CSS
// animation frozen on an element that was just hidden and shown again.
const spin = (clip) => {
  const spinner = clip.querySelector(".ig-spinner");
  if (!spinner || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  spinner.getAnimations().forEach((animation) => animation.cancel());
  spinner.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 800, iterations: Infinity });
};
const stopSpin = (clip) => clip.querySelector(".ig-spinner")?.getAnimations().forEach((animation) => animation.cancel());

// Fade the Instagram embed in once it loads, so its white page never flashes,
// and fade out the loading placeholder at the same time.
// Browsers don't give an embedded frame keyboard-focus styling, so the video gets a focus ring
// only when it's reached with the Tab key (not when it's clicked or tapped). The frame fires no
// focus event of its own, so check what has focus right after each Tab press.
let tabbedAt = 0;
const frames = [...document.querySelectorAll(".ig-fade")];
const markFrameFocus = () => frames.forEach((frame) => {
  frame.parentElement.classList.toggle("kb-focus", document.activeElement === frame && performance.now() - tabbedAt < 500);
});
addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  tabbedAt = performance.now();
  setTimeout(markFrameFocus);
}, true);
addEventListener("blur", () => setTimeout(markFrameFocus));
addEventListener("focus", markFrameFocus);
document.addEventListener("focusin", markFrameFocus);
document.querySelectorAll(".ig-fade").forEach((frame) => {
  const clip = frame.parentElement;
  spin(clip);
  const fallback = clip.querySelector(".ig-fallback");
  frame.addEventListener("load", () => {
    frame.classList.add("loaded");
    clip.classList.add("loaded");
    fallback.hidden = true;
    setTimeout(() => stopSpin(clip), 500);
  });
  // A real embed sends this page messages as it renders; a blocked one never does (Chrome even
  // fires "load" for its own error page). If nothing has arrived 8 seconds after the embed
  // scrolls into view (an ad blocker or tracking protection can block Instagram), show the
  // cover photo again, without the spinner, as a link to the reel.
  let heard = false;
  addEventListener("message", (event) => { if (event.source === frame.contentWindow) heard = true; });
  new IntersectionObserver((entries, observer) => {
    if (!entries[0].isIntersecting) return;
    observer.disconnect();
    setTimeout(() => {
      if (heard) return;
      frame.classList.remove("loaded");
      clip.classList.remove("loaded");
      clip.classList.add("failed");
      stopSpin(clip);
      fallback.hidden = false;
    }, 8000);
  }).observe(clip);
});

// Photo sliders: arrows step through photos (wrapping around), swiping works natively,
// and the caption below fades to match the current photo.
document.querySelectorAll(".carousel").forEach((carousel) => {
  const track = carousel.querySelector(".carousel-track");
  const photos = [...track.children];
  const dots = carousel.querySelectorAll(".carousel-dots span");
  const captions = carousel.querySelectorAll(".carousel-captions p");
  let index = -1;
  const show = (i) => {
    const next = (i + photos.length) % photos.length;
    if (next === index) return;
    index = next;
    dots.forEach((dot, n) => dot.classList.toggle("active", n === index));
    captions.forEach((caption, n) => {
      caption.classList.toggle("active", n === index);
      caption.setAttribute("aria-hidden", String(n !== index));
    });
    fitCaption();
  };
  // The caption area eases to the current caption's height, and re-measures whenever a caption
  // changes size (Safari can run this before the stylesheet applies; fonts and resizes change it too).
  const captionBox = carousel.querySelector(".carousel-captions");
  const fitCaption = () => { captionBox.style.height = captions[index].offsetHeight + "px"; };
  const resized = new ResizeObserver(fitCaption);
  captions.forEach((caption) => resized.observe(caption));
  const go = (i) => {
    show(i);
    track.scrollTo({ left: index * track.clientWidth });
  };
  carousel.querySelector(".prev").addEventListener("click", () => go(index - 1));
  carousel.querySelector(".next").addEventListener("click", () => go(index + 1));
  // Keep the dots and caption in step when the slider is swiped by hand: they switch as soon
  // as the next photo is more than halfway in view, without waiting for the swipe to settle.
  // (show() ignores repeat calls for the same photo, so this fires once per change.)
  track.addEventListener("scroll", () => show(Math.round(track.scrollLeft / track.clientWidth)), { passive: true });
  // Load every photo in the slider shortly before it scrolls into view, so swiping never shows a blank frame.
  new IntersectionObserver((entries, observer) => {
    if (!entries[0].isIntersecting) return;
    photos.forEach((photo) => { photo.loading = "eager"; });
    observer.disconnect();
  }, { rootMargin: "600px 0px" }).observe(carousel);
  show(0);
});

// Contact form: sends messages through Web3Forms once an access key is set.
const form = document.querySelector(".contact-form");
if (form) {
  const status = form.querySelector(".form-status");
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    // "required" accepts a field holding only spaces, so make sure each one has real text.
    const blank = [...form.querySelectorAll("input[required], textarea[required]")].find((field) => !field.value.trim());
    if (blank) {
      blank.value = "";
      blank.reportValidity();
      return;
    }
    if (!form.elements.access_key.value) {
      status.textContent = "Preview only: this form isn't connected to an inbox yet.";
      return;
    }
    status.textContent = "Sending…";
    button.disabled = true;
    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || res.status);
      form.reset();
      status.textContent = "Thanks! Your message is on its way.";
    } catch {
      status.textContent = "Something went wrong. Please reach out on LinkedIn instead.";
    } finally {
      button.disabled = false;
    }
  });
}

// Blog posts: a short hyphenated word with a number in it ("GPT-2", "2-D") stays on one line,
// so it never splits at the hyphen. Code is left alone.
const keepWhole = (word) => /^[^-]{1,12}-[^-]{1,12}$/.test(word) && /\d/.test(word);
document.querySelectorAll(".post-dek, .post-body").forEach((root) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement.closest("pre, code") && node.data.split(/\s+/).some(keepWhole)) found.push(node);
  }
  found.forEach((node) => {
    const pieces = node.data.split(/(\s+)/).map((piece) => {
      if (!keepWhole(piece)) return piece;
      const span = document.createElement("span");
      span.className = "nowrap";
      span.textContent = piece;
      return span;
    });
    node.replaceWith(...pieces);
  });
});
