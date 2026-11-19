
const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());

app.use(cors({
  origin: [
    "https://angelinamoses.github.io",
    "http://localhost:5500"
  ],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const PORT = process.env.PORT || 3000;
const TICKET_PRICE = 499;

const requiredEnv = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "APPS_SCRIPT_URL",
  "APPS_SCRIPT_TOKEN"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.get("/", (req, res) => {
  res.send("Lunara Snow Fall payment backend is running.");
});

app.post("/api/create-order", async (req, res) => {
  try {
    const { name, email, phone, quantity } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof phone !== "string" ||
      !/^\d{10}$/.test(phone) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter valid registration details."
      });
    }

    const amount = TICKET_PRICE * quantity * 100;

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `snowfall_${Date.now()}`,
      notes: {
        event: "Snow Fall Session",
        eventDate: "2026-11-28",
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone,
        quantity: String(quantity)
      }
    });

    res.json({
      success: true,
      orderId: order.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency
    });

  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to create payment order."
    });
  }
});

app.post("/api/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    if (
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return res.status(400).json({
        verified: false,
        message: "Missing payment verification details."
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const actual = Buffer.from(razorpay_signature);
    const expected = Buffer.from(expectedSignature);

    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    ) {
      return res.status(400).json({
        verified: false,
        message: "Payment signature verification failed."
      });
    }

    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(razorpay_order_id),
      razorpay.payments.fetch(razorpay_payment_id)
    ]);

    if (
      payment.order_id !== order.id ||
      payment.status !== "captured" ||
      payment.amount !== order.amount ||
      payment.currency !== order.currency ||
      order.status !== "paid"
    ) {
      return res.status(400).json({
        verified: false,
        message: "Payment has not been confirmed."
      });
    }

    const notes = order.notes || {};

    const booking = {
      bookingId: order.receipt,
      name: notes.name,
      email: notes.email,
      phone: notes.phone,
      quantity: Number(notes.quantity),
      amount: order.amount / 100,
      paymentId: payment.id,
      paymentStatus: "PAID"
    };

    if (
      !booking.name ||
      !booking.email ||
      !booking.phone ||
      !Number.isInteger(booking.quantity) ||
      booking.quantity < 1 ||
      booking.amount !== TICKET_PRICE * booking.quantity
    ) {
      return res.status(400).json({
        verified: false,
        message: "Registration details could not be validated."
      });
    }

    const sheetResponse = await fetch(process.env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "recordBooking",
        apiToken: process.env.APPS_SCRIPT_TOKEN,
        booking
      })
    });

    const sheetResult = await sheetResponse.json();

    if (!sheetResponse.ok || sheetResult.success !== true) {
      console.error("Booking recording failed:", sheetResult);
      return res.status(502).json({
        verified: true,
        bookingConfirmed: false,
        message: "Payment received, but registration recording needs attention."
      });
    }

    res.json({
      verified: true,
      bookingConfirmed: true
    });

  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({
      verified: false,
      message: "Unable to complete payment verification."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Lunara backend running on port ${PORT}`);
});
