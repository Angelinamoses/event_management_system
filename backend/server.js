
const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;
const TICKET_PRICE = 499;

// Required environment variables
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

// Request logging
app.use((req, res, next) => {
    const startTime = Date.now();

    console.log(
        `[REQUEST] ${new Date().toISOString()} ${req.method} ${req.path}`
    );

    res.on("finish", () => {
        console.log(
            `[RESPONSE] ${req.method} ${req.path} | Status: ${res.statusCode} | ${Date.now() - startTime}ms`
        );
    });

    next();
});

// CORS configuration
app.use(cors({
    origin: [
        "https://angelinamoses.github.io",
        "http://localhost:5500"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "100kb" }));

// Razorpay initialization
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Health check
app.get("/", (req, res) => {
    res.send("Lunara Snow Fall payment backend is running.");
});

// CREATE PAYMENT ORDER
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

        const amount = TICKET_PRICE * quantity * 100;

        const order = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: `snowfall_${Date.now()}`,
            notes: {
                event: "Snow Fall Session",
                eventDate: "2026-11-28",
                name: cleanName,
                email: cleanEmail,
                phone: cleanPhone,
                quantity: String(quantity)
            }
        });

        console.log("[ORDER] Created successfully:", order.id);

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

// VERIFY PAYMENT
app.post("/api/verify-payment", async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        console.log("[VERIFY] Received payment verification request.");

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

        // Verify Razorpay signature
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
            console.error("[VERIFY] Signature verification failed.");

            return res.status(400).json({
                verified: false,
                message: "Payment signature verification failed."
            });
        }

        console.log("[VERIFY] Signature verified.");

        // Fetch order and payment directly from Razorpay
        const [order, payment] = await Promise.all([
            razorpay.orders.fetch(razorpay_order_id),
            razorpay.payments.fetch(razorpay_payment_id)
        ]);

        console.log("[VERIFY] Razorpay transaction status:", {
            orderStatus: order.status,
            paymentStatus: payment.status,
            orderId: order.id,
            paymentId: payment.id
        });

        // Confirm payment details
        if (
            payment.order_id !== order.id ||
            payment.status !== "captured" ||
            payment.amount !== order.amount ||
            payment.currency !== order.currency ||
            order.status !== "paid"
        ) {
            console.error("[VERIFY] Payment/order validation failed.");

            return res.status(400).json({
                verified: false,
                message: "Payment has not been confirmed."
            });
        }

        console.log("[VERIFY] Payment successfully validated.");

        // Extract registration information from Razorpay order notes
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
            !booking.bookingId ||
            !booking.name ||
            !booking.email ||
            !booking.phone ||
            !/^\d{10}$/.test(booking.phone) ||
            !Number.isInteger(booking.quantity) ||
            booking.quantity < 1 ||
            booking.quantity > 10 ||
            booking.amount !== TICKET_PRICE * booking.quantity
        ) {
            console.error("[VERIFY] Registration details are invalid.");

            return res.status(400).json({
                verified: false,
                message: "Registration details could not be validated."
            });
        }

        // Send confirmed booking to Google Apps Script
        console.log("[SHEETS] Sending booking to Google Apps Script.");

        const sheetResponse = await fetch(process.env.APPS_SCRIPT_URL, {
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

        const responseText = await sheetResponse.text();

        let sheetResult;

        try {
            sheetResult = JSON.parse(responseText);
        } catch (parseError) {
            console.error("[SHEETS] Invalid response:", {
                status: sheetResponse.status,
                response: responseText.slice(0, 300)
            });

            return res.status(502).json({
                verified: true,
                bookingConfirmed: false,
                message: "Payment received, but registration recording needs attention."
            });
        }

        if (!sheetResponse.ok || sheetResult.success !== true) {
            console.error("[SHEETS] Booking recording failed:", {
                status: sheetResponse.status,
                message: sheetResult.message
            });

            return res.status(502).json({
                verified: true,
                bookingConfirmed: false,
                message: "Payment received, but registration recording needs attention."
            });
        }

        console.log("[SHEETS] Booking successfully recorded:", booking.bookingId);

        return res.json({
            verified: true,
            bookingConfirmed: true
        });

    } catch (error) {
        console.error("[VERIFY] Payment verification error:", error);

        return res.status(500).json({
            verified: false,
            message: "Unable to complete payment verification."
        });
    }
});

// Handle unexpected errors, including invalid JSON
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
