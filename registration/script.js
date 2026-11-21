/* Snow Fall Session — Razorpay checkout client.
   IMPORTANT: The backend must create orders and verify signatures.
   Never place RAZORPAY_KEY_SECRET in this file. */
const TICKET_PRICE = 499;
const API_BASE_URL = "https://lunara-snow-fall-backend.onrender.com"; // Set to your deployed HTTPS backend URL, e.g. https://your-api.onrender.com

const form = document.getElementById("registrationForm");
const ticketSelect = document.getElementById("tickets");
const ticketPriceDisplay = document.getElementById("ticketPriceDisplay");
const subtotalDisplay = document.getElementById("subtotalDisplay");
const totalAmountDisplay = document.getElementById("totalAmountDisplay");
const discountRow = document.getElementById("discountRow");
const discountAmountDisplay = document.getElementById("discountAmountDisplay");
const crewDeal = document.getElementById("crewDeal");
const couponCodeInput = document.getElementById("couponCode");
const applyCouponButton = document.getElementById("applyCouponButton");
const couponStatus = document.getElementById("couponStatus");
const successSavingsMessage = document.getElementById("successSavingsMessage");
const statusEl = document.getElementById("formStatus");
const payButton = document.getElementById("payButton");
const payButtonText = document.getElementById("payButtonText");
const successScreen = document.getElementById("successScreen");
const errorScreen = document.getElementById("errorScreen");
const errorMessage = document.getElementById("paymentErrorMessage");
const retryButton = document.getElementById("retryPaymentButton");
let lastPayload = null;
let appliedCoupon = "";

const money = value => {
  const amount = Number(value);
  return "₹" + amount.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  });
};

function updateTotal() {
  const quantity = Number(ticketSelect.value) || 1;

  if (appliedCoupon && quantity !== 5) {
    appliedCoupon = "";
    applyCouponButton.textContent = "Apply";
    couponStatus.textContent = "SNOW15 applies to exactly 5 tickets. Select 5 tickets and apply the code again.";
    couponStatus.classList.remove("coupon-status--success");
    couponStatus.classList.add("coupon-status--error");
  }

  const subtotalPaise = TICKET_PRICE * quantity * 100;
  const discountPaise = appliedCoupon === "SNOW15" && quantity === 5
    ? Math.round(subtotalPaise * 0.15)
    : 0;
  const totalPaise = subtotalPaise - discountPaise;

  ticketPriceDisplay.textContent = money(TICKET_PRICE);
  subtotalDisplay.textContent = money(subtotalPaise / 100);
  discountRow.hidden = discountPaise === 0;
  discountAmountDisplay.textContent = "−" + money(discountPaise / 100);
  totalAmountDisplay.textContent = money(totalPaise / 100);
  crewDeal.classList.toggle("crew-deal--eligible", quantity === 5);

  if (!appliedCoupon) {
    couponStatus.classList.remove("coupon-status--success", "coupon-status--error");
    couponStatus.textContent = quantity === 5
      ? "Your 5-ticket booking qualifies. Enter SNOW15 to save 15%."
      : "Book exactly 5 tickets to unlock 15% off with SNOW15.";
  }
}

applyCouponButton.addEventListener("click", () => {
  const code = couponCodeInput.value.trim().toUpperCase();
  const quantity = Number(ticketSelect.value);

  couponStatus.classList.remove("coupon-status--success", "coupon-status--error");

  if (!code) {
    couponStatus.textContent = "Enter SNOW15 to apply your group offer.";
    couponStatus.classList.add("coupon-status--error");
    return;
  }

  if (code !== "SNOW15") {
    appliedCoupon = "";
    applyCouponButton.textContent = "Apply";
    updateTotal();
    couponStatus.textContent = "That code doesn't look right. Please check it and try again.";
    couponStatus.classList.add("coupon-status--error");
    return;
  }

  if (quantity !== 5) {
    appliedCoupon = "";
    applyCouponButton.textContent = "Apply";
    couponStatus.textContent = "SNOW15 is an exclusive offer for exactly 5 tickets.";
    couponStatus.classList.add("coupon-status--error");
    updateTotal();
    return;
  }

  appliedCoupon = "SNOW15";
  couponCodeInput.value = "SNOW15";
  applyCouponButton.textContent = "Applied ✓";
  const discountPaise = Math.round(TICKET_PRICE * quantity * 100 * 0.15);
  couponStatus.textContent = "SNOW15 applied. You save " + money(discountPaise / 100) + " on your crew booking.";
  couponStatus.classList.add("coupon-status--success");
  updateTotal();
});

couponCodeInput.addEventListener("input", () => {
  if (appliedCoupon && couponCodeInput.value.trim().toUpperCase() !== appliedCoupon) {
    appliedCoupon = "";
    applyCouponButton.textContent = "Apply";
    updateTotal();
  }
});

ticketSelect.addEventListener("change", updateTotal);
updateTotal();

function setError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(id + "Error");
  input.closest(".field").classList.toggle("field--error", Boolean(message));
  error.textContent = message || "";
}
function validate() {
  const name = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.replace(/\D/g, "").replace(/^91/, "").replace(/^0/, "");
  const emailOK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneOK = /^[6-9]\d{9}$/.test(phone);
  setError("fullName", name.length >= 2 ? "" : "Please enter your full name.");
  setError("email", emailOK ? "" : "Please enter a valid email address.");
  setError("phone", phoneOK ? "" : "Enter a valid 10-digit Indian mobile number.");
  return name.length >= 2 && emailOK && phoneOK;
}
function showError(message) {
  form.hidden = true;
  successScreen.hidden = true;
  errorScreen.hidden = false;
  errorMessage.textContent = message;
}
function resetPaymentPanels() {
  form.hidden = false;
  successScreen.hidden = true;
  errorScreen.hidden = true;
  statusEl.textContent = "";
  payButton.disabled = false;
  payButtonText.textContent = "Continue to payment";
}
retryButton.addEventListener("click", resetPaymentPanels);

async function postJSON(path, data) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || result.error || "Payment service is temporarily unavailable.");
  return result;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  statusEl.textContent = "";
  if (!validate()) {
    statusEl.textContent = "Please correct the highlighted details.";
    return;
  }
  if (!API_BASE_URL) {
    statusEl.textContent = "Checkout is prepared, but the secure payment server URL has not been configured yet. No payment has been taken.";
    return;
  }
  if (!window.Razorpay) {
    showError("Razorpay Checkout could not load. Please check your internet connection and try again.");
    return;
  }

  lastPayload = {
    event: "Snow Fall Session",
    eventDate: "2026-11-28",
    name: document.getElementById("fullName").value.trim(),
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    quantity: Number(ticketSelect.value),
    couponCode: appliedCoupon
  };

  payButton.disabled = true;
  payButtonText.textContent = "Opening secure checkout…";
  try {
    // Backend must calculate amount from its own fixed ₹499 price, not trust client amount.
    const order = await postJSON("/api/create-order", lastPayload);
    if (!order.orderId || !order.keyId || !order.amount || order.currency !== "INR") {
      throw new Error("The payment server returned incomplete order details.");
    }

    const expectedSubtotalPaise = TICKET_PRICE * lastPayload.quantity * 100;
    const expectedDiscountPaise = lastPayload.couponCode === "SNOW15"
      ? Math.round(expectedSubtotalPaise * 0.15)
      : 0;
    if (Number(order.amount) !== expectedSubtotalPaise - expectedDiscountPaise) {
      throw new Error("The payment amount does not match your ticket and coupon selection. Please contact the event team.");
    }

    const checkout = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "Lunara",
      description: "Snow Fall Session · 28 November 2026",
      order_id: order.orderId,
      prefill: { name: lastPayload.name, email: lastPayload.email, contact: lastPayload.phone },
      theme: { color: "#13d9f3" },
      modal: {
        ondismiss: () => {
          if (payButton.disabled) {
            payButton.disabled = false;
            payButtonText.textContent = "Continue to payment";
            statusEl.textContent = "Checkout closed. No booking has been confirmed.";
          }
        }
      },
      handler: async payment => {
        try {
          statusEl.textContent = "Verifying your payment securely…";
          const verified = await postJSON("/api/verify-payment", {
            ...payment,
            registration: lastPayload
          });
          if (verified.verified === true && verified.bookingConfirmed === true) {
            form.hidden = true;
            errorScreen.hidden = true;
            successScreen.hidden = false;
            if (lastPayload.couponCode === "SNOW15") {
              const savedPaise = Math.round(TICKET_PRICE * 5 * 100 * 0.15);
              successSavingsMessage.textContent = "Crew deal unlocked! SNOW15 saved you " + money(savedPaise / 100) + ".";
              successSavingsMessage.hidden = false;
            } else {
              successSavingsMessage.hidden = true;
            }
          } else {
            throw new Error("Payment could not be verified. Please contact the event team before trying again.");
          }
        } catch (verificationError) {
          showError(verificationError.message || "Payment verification failed. If money was deducted, please contact the event team before paying again.");
        } finally {
          payButton.disabled = false;
          payButtonText.textContent = "Continue to payment";
        }
      }
    });
    checkout.on("payment.failed", response => {
      const description = response?.error?.description || "The payment was declined or interrupted.";
      showError(`${description} If money was deducted, please check the transaction status before retrying.`);
      payButton.disabled = false;
      payButtonText.textContent = "Continue to payment";
    });
    checkout.open();
  } catch (error) {
    payButton.disabled = false;
    payButtonText.textContent = "Continue to payment";
    statusEl.textContent = error.message || "Unable to start checkout. Please try again.";
  }
});

// Lightweight snowfall canvas. Respects reduced-motion preferences.
(() => {
  const canvas = document.getElementById("snowCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let flakes = [], width = 0, height = 0, frame;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    flakes = Array.from({ length: Math.min(85, Math.floor(width / 12)) }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      r: Math.random() * 1.8 + .35, speed: Math.random() * .55 + .18,
      drift: (Math.random() - .5) * .35, alpha: Math.random() * .55 + .18
    }));
    if (reduceMotion) draw();
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (const f of flakes) {
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(218,243,255,${f.alpha})`; ctx.fill();
      if (!reduceMotion) {
        f.y += f.speed; f.x += f.drift;
        if (f.y > height + 4) { f.y = -4; f.x = Math.random() * width; }
        if (f.x < -4) f.x = width + 4;
        if (f.x > width + 4) f.x = -4;
      }
    }
    if (!reduceMotion) frame = requestAnimationFrame(draw);
  }
  window.addEventListener("resize", resize);
  resize();
  if (!reduceMotion) draw();
  window.addEventListener("pagehide", () => cancelAnimationFrame(frame));
})();
