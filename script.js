/* =======================================================================
   LUNARA — "THE NIGHT HAS ENDED" CLOSURE PAGE — SCRIPT.JS
   Structure:
     1. Starfield generation
     2. Reveal-on-load animation
   ======================================================================= */

/* -----------------------------------------------------------------------
   1. STARFIELD
   Scatters a handful of small twinkling dots across the background.
   Regenerated on load only — this is a quiet, static night sky, not an
   interactive effect.
------------------------------------------------------------------------ */
function createStarfield() {
  const starsContainer = document.getElementById("stars");
  if (!starsContainer) return;

  const STAR_COUNT = 60;

  for (let i = 0; i < STAR_COUNT; i++) {
    const star = document.createElement("span");
    star.className = "star";

    star.style.top = Math.random() * 100 + "%";
    star.style.left = Math.random() * 100 + "%";

    // Slight variation in size and animation timing so the twinkle
    // doesn't feel mechanical or synchronized.
    const size = 1 + Math.random() * 1.5;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.animationDelay = `${Math.random() * 4}s`;
    star.style.animationDuration = `${3 + Math.random() * 3}s`;

    starsContainer.appendChild(star);
  }
}

createStarfield();

/* -----------------------------------------------------------------------
   2. REVEAL ON LOAD
   Elements with .reveal fade/slide in once, in a gentle staggered
   sequence, rather than all appearing on scroll (there's only one
   screen's worth of content here).
------------------------------------------------------------------------ */
function revealOnLoad() {
  const revealEls = document.querySelectorAll(".reveal");
  revealEls.forEach((el, index) => {
    setTimeout(() => {
      el.classList.add("reveal--visible");
    }, 150 * index);
  });
}

window.addEventListener("DOMContentLoaded", revealOnLoad);