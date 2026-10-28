// Only the GPT-2 small post loads this. Each word-similarity drawing swings its cyan arrow from the angle before training to the angle
// after, once it scrolls into view, with the second word's label riding on the arrow and the angle
// counting down; a tap replays it. With reduced motion (or no script) the drawings stay as written in
// the page: the trained angle.
const simPairs = [...document.querySelectorAll(".sim-pair[data-before]")];
if (simPairs.length && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const toDegrees = (cosine) => (Math.acos(cosine) * 180) / Math.PI;
  const draw = (pair, degrees) => {
    const line = pair.querySelector(".sim-after");
    const ox = +line.getAttribute("x1"), oy = +line.getAttribute("y1");
    const at = (angle, length) => {
      const t = (angle * Math.PI) / 180;
      return [ox + length * Math.cos(t), oy - length * Math.sin(t)];
    };
    const [tx, ty] = at(degrees, pair.simLength);
    const [cx, cy] = at(degrees, pair.simRadius);
    const [lx, ly] = at(degrees / 2, pair.simRadius + 13);
    line.setAttribute("x2", tx.toFixed(1));
    line.setAttribute("y2", ty.toFixed(1));
    pair.querySelector(".sim-arc").setAttribute("d", `M${ox + pair.simRadius},${oy} A${pair.simRadius},${pair.simRadius} 0 0 0 ${cx.toFixed(1)},${cy.toFixed(1)}`);
    const word = pair.querySelector(".sim-label-second");
    word.setAttribute("x", (tx + 6).toFixed(1));
    word.setAttribute("y", (ty + 3).toFixed(1));
    const angle = pair.querySelector(".sim-label-angle");
    angle.setAttribute("x", lx.toFixed(1));
    angle.setAttribute("y", ly.toFixed(1));
    angle.textContent = `${Math.round(degrees)}°`;
  };
  const play = (pair, delay = 0) => {
    const from = toDegrees(+pair.dataset.before), to = toDegrees(+pair.dataset.after);
    draw(pair, from);
    const start = performance.now() + delay;
    const step = (now) => {
      const progress = Math.min(1, Math.max(0, (now - start) / 1600));
      draw(pair, from + (to - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const watcher = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    watcher.unobserve(entry.target);
    play(entry.target, simPairs.indexOf(entry.target) * 200);
  }), { threshold: 0.6 });
  simPairs.forEach((pair) => {
    const line = pair.querySelector(".sim-after");
    pair.simLength = Math.hypot(line.getAttribute("x2") - line.getAttribute("x1"), line.getAttribute("y2") - line.getAttribute("y1"));
    pair.simRadius = +pair.querySelector(".sim-arc").getAttribute("d").match(/A([\d.]+)/)[1];
    draw(pair, toDegrees(+pair.dataset.before));
    pair.classList.add("sim-replay");
    pair.addEventListener("click", () => play(pair));
    watcher.observe(pair);
  });
  const caption = simPairs[0].closest("figure")?.querySelector("figcaption");
  if (caption) caption.append(" Tap a drawing to replay it.");
}
