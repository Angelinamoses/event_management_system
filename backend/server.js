
const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;
const TICKET_PRICE = 499;
const EVENT_NAME = "Snow Fall Session";

// Required environment variables
const requiredEnv = [
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "APPS_SCRIPT_URL",
    "APPS_SCRIPT_TOKEN"
];

for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`Missing environment variable: ${key}`);
        process.exit(1);
    }
}

// Request logging
app.use((req, res, next) => {
    const startTime = Date.now();

    console.log(
        `[REQUEST] ${new Date().toISOString()} ${req.method} ${req.path}`
    );

    res.on("finish", () => {
        console.log(
            `[RESPONSE] ${req.method} ${req.path} | ${res.statusCode} | ${Date.now() - startTime}ms`
        );
    });

    next();
});

// CORS
app.use(cors({
    origin: [
        "https://angelinamoses.github.io",
        "http://localhost:5500"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));

// Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Verify a hexadecimal HMAC signature safely
function verifyHexSignature(receivedSignature, expectedSignature) {
    if (
        typeof receivedSignature !== "string" ||
        !/^[a-f0-9]{64}$/i.test(receivedSignature)
    ) {
        return false;
    }

    const received = Buffer.from(receivedSignature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    return (
        received.length === expected.length &&
        crypto.timingSafeEqual(received, expected)
    );
}

// Fetch and validate a captured Razorpay payment.
// This function is shared by Checkout and the webhook.
async function getVerifiedBooking(orderId, paymentId) {
    const [order, payment] = await Promise.all([
        razorpay.orders.fetch(orderId),
        razorpay.payments.fetch(paymentId)
    ]);

    console.log("[PAYMENT] Transaction checked:", {
        orderId: order.id,
        paymentId: payment.id,
        orderStatus: order.status,
        paymentStatus: payment.status
    });

    if (
        payment.order_id !== order.id ||
        payment.status !== "captured" ||
        payment.amount !== order.amount ||
        payment.currency !== order.currency ||
        order.status !== "paid"
    ) {
        throw new Error("Razorpay payment/order validation failed.");
    }

    const notes = order.notes || {};

    // Ignore payments that do not belong to this event.
    if (notes.event !== EVENT_NAME) {
        return null;
    }

    const quantity = Number(notes.quantity);

    const booking = {
        bookingId: order.receipt,
        name: notes.name,
        email: notes.email,
        phone: notes.phone,
        quantity,
        amount: order.amount / 100,
        paymentId: payment.id,
        paymentStatus: "PAID"
    };

    if (
        !booking.bookingId ||
        !booking.name ||
        !booking.email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email) ||
        !/^\d{10}$/.test(booking.phone || "") ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10 ||
        booking.amount !== TICKET_PRICE * quantity ||
        order.currency !== "INR"
    ) {
        throw new Error("Registration details could not be validated.");
    }

    return booking;
}

// Record booking in Google Sheets through Apps Script
async function recordBookingInSheet(booking) {
    console.log("[SHEETS] Sending booking:", booking.bookingId);

    const response = await fetch(process.env.APPS_SCRIPT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
            action: "recordBooking",
            apiToken: process.env.APPS_SCRIPT_TOKEN,
            booking
        })
    });

    const responseText = await response.text();

    let result;

    try {
        result = JSON.parse(responseText);
    } catch {
        throw new Error(
            `Apps Script returned an invalid response. HTTP ${response.status}`
        );
    }

    if (!response.ok || result.success !== true) {
        throw new Error(
            `Apps Script rejected booking: ${result.message || response.status}`
        );
    }

    console.log("[SHEETS] Booking recorded:", booking.bookingId);

    return result;
}

// IMPORTANT: Webhook route must be BEFORE express.json().
// Razorpay signature verification requires the original raw body.
app.post(
    "/api/razorpay-webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        try {
            const signature = req.get("x-razorpay-signature");

            if (!Buffer.isBuffer(req.body)) {
                return res.status(400).json({
                    received: false,
                    message: "Invalid webhook body."
                });
            }

            const expectedSignature = crypto
                .createHmac(
                    "sha256",
                    process.env.RAZORPAY_WEBHOOK_SECRET
                )
                .update(req.body)
                .digest("hex");

            if (!verifyHexSignature(signature, expectedSignature)) {
                console.error("[WEBHOOK] Signature verification failed.");

                return res.status(401).json({
                    received: false,
                    message: "Invalid webhook signature."
                });
            }

            // Parse only AFTER validating the raw body.
            const event = JSON.parse(req.body.toString("utf8"));

            console.log("[WEBHOOK] Verified event:", event.event);

            // We subscribe to payment.captured.
            if (event.event !== "payment.captured") {
                return res.status(200).json({
                    received: true,
                    ignored: true
                });
            }

            const payment = event.payload?.payment?.entity;

            if (!payment?.id || !payment?.order_id) {
                return res.status(400).json({
                    received: false,
                    message: "Payment details missing."
                });
            }

            // Verify with Razorpay's API before recording.
            const booking = await getVerifiedBooking(
                payment.order_id,
                payment.id
            );

            if (!booking) {
                return res.status(200).json({
                    received: true,
                    ignored: true
                });
            }

            await recordBookingInSheet(booking);

            console.log(
                "[WEBHOOK] Booking recovery successful:",
                booking.bookingId
            );

            return res.status(200).json({
                received: true,
                bookingRecorded: true
            });

        } catch (error) {
            console.error("[WEBHOOK] Processing failed:", error.message);

            // Non-2xx lets Razorpay retry delivery.
            return res.status(500).json({
                received: false,
                message: "Webhook processing failed."
            });
        }
    }
);

// Parse normal API JSON after the webhook route.
app.use(express.json({ limit: "100kb" }));

// Health check
app.get("/", (req, res) => {
    res.send("Lunara Snow Fall payment backend is running.");
});

// CREATE ORDER
app.post("/api/create-order", async (req, res) => {
    try {
        const { name, email, phone, quantity } = req.body;

        const cleanName = typeof name === "string" ? name.trim() : "";
        const cleanEmail = typeof email === "string"
            ? email.trim().toLowerCase()
            : "";
        const cleanPhone = typeof phone === "string" ? phone.trim() : "";

        if (
            !cleanName ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
            !/^\d{10}$/.test(cleanPhone) ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 10
        ) {
            return res.status(400).json({
                success: false,
                message: "Please enter valid registration details."
            });
        }

        const order = await razorpay.orders.create({
            amount: TICKET_PRICE * quantity * 100,
            currency: "INR",
            receipt: `snowfall_${Date.now()}`,
            notes: {
                event: EVENT_NAME,
                eventDate: "2026-11-28",
                name: cleanName,
                email: cleanEmail,
                phone: cleanPhone,
                quantity: String(quantity)
            }
        });

        console.log("[ORDER] Created:", order.id);

        return res.json({
            success: true,
            orderId: order.id,
            keyId: process.env.RAZORPAY_KEY_ID,
            amount: order.amount,
            currency: order.currency
        });

    } catch (error) {
        console.error("[ORDER] Creation failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to create payment order."
        });
    }
});

// CHECKOUT PAYMENT VERIFICATION
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

        if (!verifyHexSignature(razorpay_signature, expectedSignature)) {
            return res.status(400).json({
                verified: false,
                message: "Payment signature verification failed."
            });
        }

        console.log("[VERIFY] Checkout signature verified.");

        const booking = await getVerifiedBooking(
            razorpay_order_id,
            razorpay_payment_id
        );

        if (!booking) {
            return res.status(400).json({
                verified: false,
                message: "This payment does not belong to this event."
            });
        }

        await recordBookingInSheet(booking);

        return res.json({
            verified: true,
            bookingConfirmed: true
        });

    } catch (error) {
        console.error("[VERIFY] Failed:", error.message);

        return res.status(502).json({
            verified: false,
            bookingConfirmed: false,
            message: "Payment received or verification pending. Please do not pay again."
        });
    }
});

// Handle unexpected errors
app.use((error, req, res, next) => {
    console.error("[SERVER] Unexpected error:", error.message);

    if (res.headersSent) {
        return next(error);
    }

    return res.status(error.status || 500).json({
        success: false,
        message: "An unexpected server error occurred."
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Lunara backend running on port ${PORT}`);
});
