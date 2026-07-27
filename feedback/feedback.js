/* =======================================================================
   LUNARA FEEDBACK PORTAL — SCRIPT.JS
   Structure:
     1. Configuration
     2. DOM references
     3. iOS viewport-height fix (--vh custom property)
     4. URL parameter personalization (name / email)
     5. Device detection (submittedFrom)
     6. Star rating widget
     7. Form validation
     8. Submit flow (loading -> success / error)
     9. Reveal-on-load animation
   ======================================================================= */

/* -----------------------------------------------------------------------
   1. CONFIGURATION
------------------------------------------------------------------------ */
const BACKEND_URL =
  "https://script.google.com/macros/s/AKfycbyObwRcTNEr7yPYl9GKPpYMnXOLb9M0t81-GcUDrnaGAgKF7QZIWZO2SToEsPlEctk8Mw/exec";

/* -----------------------------------------------------------------------
   2. DOM REFERENCES
------------------------------------------------------------------------ */
const welcomeMessage   = document.getElementById("welcomeMessage");
const identityLine     = document.getElementById("identityLine");

const feedbackForm     = document.getElementById("feedbackForm");
const formCard         = document.getElementById("formCard");
const successCard      = document.getElementById("successCard");
const errorCard        = document.getElementById("errorCard");

const starRating        = document.getElementById("starRating");
const stars              = Array.from(starRating.querySelectorAll(".star"));
const ratingError        = document.getElementById("ratingError");

const favoriteSongInput        = document.getElementById("favoriteSong");
const favoritePerformanceInput = document.getElementById("favoritePerformance");
const suggestionsInput         = document.getElementById("suggestions");
const messageToTeamInput       = document.getElementById("messageToTeam");

const submitBtn        = document.getElementById("submitBtn");
const submitBtnText    = document.getElementById("submitBtnText");
const submitSpinner    = document.getElementById("submitSpinner");

const retryBtn         = document.getElementById("retryBtn");

/* -----------------------------------------------------------------------
   3. iOS VIEWPORT-HEIGHT FIX
   iOS Safari's address bar shrinks/grows the viewport, which makes
   `100vh` jump around whenever it happens. Modern browsers support
   `100dvh` (already used in style.css as the primary rule), but this
   sets a `--vh` custom property as a fallback for older WebKit/Safari
   versions that don't understand dvh yet.
------------------------------------------------------------------------ */
function setViewportHeightVar() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}

setViewportHeightVar();
window.addEventListener("resize", setViewportHeightVar);
window.addEventListener("orientationchange", setViewportHeightVar);

/* -----------------------------------------------------------------------
   4. URL PARAMETER PERSONALIZATION
   Reads ?name= and ?email= from the URL. Neither is ever rendered as
   an editable form field — they're captured here and sent straight to
   the backend alongside the rest of the answers.
------------------------------------------------------------------------ */
const urlParams   = new URLSearchParams(window.location.search);
const attendeeName  = (urlParams.get("name") || "").trim();
const attendeeEmail = (urlParams.get("email") || "").trim();

if (attendeeName) {
  // "John Doe" -> "Welcome, John!" (first name only, for a friendlier greeting)
  const firstName = attendeeName.split(" ")[0];
  welcomeMessage.textContent = `Welcome, ${firstName}!`;
  welcomeMessage.hidden = false;
}

// Visible (read-only) confirmation of who the feedback will be
// submitted as. Shown whenever we have a name and/or email — never
// editable, and never rendered as an actual form field.
if (attendeeName || attendeeEmail) {
  identityLine.innerHTML = "";

  const label = document.createTextNode("Submitting as ");
  identityLine.appendChild(label);

  if (attendeeName) {
    const nameEl = document.createElement("strong");
    nameEl.textContent = attendeeName;
    identityLine.appendChild(nameEl);
  }

  if (attendeeEmail) {
    if (attendeeName) identityLine.appendChild(document.createTextNode(" · "));
    const emailEl = document.createElement("strong");
    emailEl.textContent = attendeeEmail;
    identityLine.appendChild(emailEl);
  }

  identityLine.hidden = false;
}

/* -----------------------------------------------------------------------
   5. DEVICE DETECTION
   Best-effort classification into Desktop / Mobile / Tablet, combining
   user-agent hints with a screen-width fallback for browsers (like
   modern iPadOS Safari) that report a desktop-class user agent.
------------------------------------------------------------------------ */
function detectDevice() {
  const ua = navigator.userAgent || "";

  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isTabletUA = /Tablet|PlayBook|Nexus 7|Nexus 10/i.test(ua) || isIpad;
  const isMobileUA = /Mobi|Android(?!.*Tablet)|iPhone|iPod|Windows Phone|BlackBerry/i.test(ua);

  if (isTabletUA) return "Tablet";
  if (isMobileUA) return "Mobile";

  // Fallback for user agents that don't clearly say either way:
  // classify by viewport width.
  const width = window.innerWidth;
  if (width <= 767) return "Mobile";
  if (width <= 1024) return "Tablet";
  return "Desktop";
}

/* -----------------------------------------------------------------------
   6. STAR RATING WIDGET
   Click sets the rating; hover previews it; keyboard users can tab to
   a star and use Enter/Space to select it (native <button> behavior).
------------------------------------------------------------------------ */
let currentRating = 0;

function paintStars(uptoValue, className) {
  stars.forEach((star) => {
    const value = Number(star.dataset.value);
    star.classList.toggle(className, value <= uptoValue);
  });
}

function setRating(value) {
  currentRating = value;
  stars.forEach((star) => {
    const value_ = Number(star.dataset.value);
    star.classList.toggle("is-active", value_ <= value);
    star.setAttribute("aria-checked", value_ === value ? "true" : "false");
  });
  clearFieldError(starRating, ratingError);
}

stars.forEach((star) => {
  star.addEventListener("click", () => setRating(Number(star.dataset.value)));

  star.addEventListener("mouseenter", () => {
    paintStars(Number(star.dataset.value), "is-hover");
  });

  star.addEventListener("mouseleave", () => {
    stars.forEach((s) => s.classList.remove("is-hover"));
  });
});

/* -----------------------------------------------------------------------
   7. FORM VALIDATION
------------------------------------------------------------------------ */
function setFieldError(wrapperTriggerEl, errorEl, message) {
  const fieldWrapper = wrapperTriggerEl.closest(".field");
  if (fieldWrapper) fieldWrapper.classList.toggle("field--error", Boolean(message));
  errorEl.textContent = message || "";
}

function clearFieldError(wrapperTriggerEl, errorEl) {
  setFieldError(wrapperTriggerEl, errorEl, "");
}

function validateRating() {
  if (currentRating < 1) {
    setFieldError(starRating, ratingError, "Please choose a star rating.");
    return false;
  }
  clearFieldError(starRating, ratingError);
  return true;
}

function validateTextField(inputEl, errorEl, message) {
  const errorElResolved = document.getElementById(errorEl);
  if (!inputEl.value.trim()) {
    setFieldError(inputEl, errorElResolved, message);
    return false;
  }
  setFieldError(inputEl, errorElResolved, "");
  return true;
}

function validateRadioGroup(name, errorElId, message) {
  const errorEl = document.getElementById(errorElId);
  const checked = feedbackForm.querySelector(`input[name="${name}"]:checked`);
  const wrapper = document.querySelector(`input[name="${name}"]`).closest(".field");

  if (!checked) {
    wrapper.classList.add("field--error");
    errorEl.textContent = message;
    return false;
  }
  wrapper.classList.remove("field--error");
  errorEl.textContent = "";
  return true;
}

function validateForm() {
  const validRating      = validateRating();
  const validSong         = validateTextField(favoriteSongInput, "favoriteSongError", "Please tell us your favorite song.");
  const validPerformance  = validateTextField(favoritePerformanceInput, "favoritePerformanceError", "Please tell us your favorite performance.");
  const validSuggestions  = validateTextField(suggestionsInput, "suggestionsError", "Please share a suggestion.");
  const validAttendAgain  = validateRadioGroup("attendAgain", "attendAgainError", "Please choose an option.");
  const validRecommend    = validateRadioGroup("recommend", "recommendError", "Please choose an option.");

  return validRating && validSong && validPerformance && validSuggestions && validAttendAgain && validRecommend;
}

/* -----------------------------------------------------------------------
   8. SUBMIT FLOW
------------------------------------------------------------------------ */
function setSubmitLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitSpinner.hidden = !isLoading;
  submitBtnText.textContent = isLoading ? "Submitting..." : "Submit Feedback";
}

function showCard(cardToShow) {
  [formCard, successCard, errorCard].forEach((card) => {
    card.hidden = card !== cardToShow;
  });
}

async function submitFeedback() {
  const attendAgainChecked = feedbackForm.querySelector('input[name="attendAgain"]:checked');
  const recommendChecked   = feedbackForm.querySelector('input[name="recommend"]:checked');

  // Field order matches the exact JSON contract the backend expects.
  const payload = {
    name: attendeeName,
    email: attendeeEmail,
    rating: String(currentRating),
    favoritePerformance: favoritePerformanceInput.value.trim(),
    favoriteSong: favoriteSongInput.value.trim(),
    suggestions: suggestionsInput.value.trim(),
    attendAgain: attendAgainChecked ? attendAgainChecked.value : "",
    recommend: recommendChecked ? recommendChecked.value : "",
    submittedFrom: detectDevice(),
    messageToTeam: messageToTeamInput.value.trim()
  };

  setSubmitLoading(true);

  try {
    // No custom headers are set on purpose: adding e.g. a JSON
    // Content-Type header here would trigger a CORS preflight (OPTIONS)
    // request that Apps Script Web Apps don't handle. Leaving the
    // request headers untouched keeps this a "simple request".
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status ${response.status}`);
    }

    showCard(successCard);
  } catch (err) {
    console.error("Feedback submission failed:", err);
    showCard(errorCard);
  } finally {
    setSubmitLoading(false);
  }
}

feedbackForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!validateForm()) {
    return;
  }

  submitFeedback();
});

retryBtn.addEventListener("click", () => {
  showCard(formCard);
});

/* -----------------------------------------------------------------------
   9. REVEAL ON LOAD
------------------------------------------------------------------------ */
function revealOnLoad() {
  document.querySelectorAll(".reveal").forEach((el, index) => {
    setTimeout(() => {
      el.classList.add("reveal--visible");
    }, 120 * index);
  });
}

window.addEventListener("DOMContentLoaded", revealOnLoad);