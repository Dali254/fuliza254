/* =====================================================================
   One Express app that runs everywhere:
     - cPanel "Setup Node.js App"  (set this file as the startup file)
     - A normal server / your laptop:  node app.js
     - Vercel (via api/index.js, which just re-exports this app)

   Requires Node 18 or newer (for the built-in fetch). In cPanel's
   "Setup Node.js App", pick Node 18+ from the version dropdown.
   ===================================================================== */

const express = require("express");
const { PLANS, SETTINGS, findPlan } = require("/lib/plans");
const { setStatus, getStatus } = require("/lib/store");

const app = express();

/* Read a JSON body in a way that works both on a normal server (where we
   read the raw stream) and on Vercel (where req.body is already parsed). */
function readJson(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let data = "";
    req.on("data", function (c) { data += c; });
    req.on("end", function () {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); }
    });
    req.on("error", function () { resolve({}); });
  });
}

/* --- Plans for the page --- */
app.get("/api/plans", function (req, res) {
  res.json({ plans: PLANS, settings: SETTINGS });
});

/* --- Start an M-Pesa STK push --- */
app.post("/api/pay", async function (req, res) {
  const body = await readJson(req);
  const cows = body.cows;
  const phone_number = body.phone_number;
  const external_reference = body.external_reference;
  const customer_name = body.customer_name;

  // Price comes from the server, not the browser — can't be tampered with.
  const plan = findPlan(cows);
  if (!plan || !phone_number || !external_reference) {
    return res.status(400).json({ success: false, error: "Invalid plan, phone number, or reference." });
  }

  const auth        = process.env.PAYHERO_AUTH;
  const channelId   = Number(process.env.PAYHERO_CHANNEL_ID);
  const callbackUrl = process.env.PAYHERO_CALLBACK_URL;
  if (!auth || !channelId || !callbackUrl) {
    return res.status(500).json({ success: false, error: "Payment is not configured on the server yet." });
  }

  await setStatus(external_reference, { status: "PENDING" });

  try {
    const r = await fetch("https://backend.payhero.co.ke/api/v2/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": auth },
      body: JSON.stringify({
        amount: plan.fee,
        phone_number: phone_number,
        channel_id: channelId,
        provider: "m-pesa",
        external_reference: external_reference,
        customer_name: customer_name || "Farmer",
        callback_url: callbackUrl,
      }),
    });

    const data = await r.json().catch(function () { return {}; });

    if (data && data.CheckoutRequestID) {
      await setStatus(external_reference, { status: "PENDING", CheckoutRequestID: data.CheckoutRequestID });
    }
    if (!r.ok || data.success === false) {
      await setStatus(external_reference, { status: "FAILED", desc: data.error || "Rejected by PayHero." });
    }
    return res.status(r.status).json(data);
  } catch (e) {
    await setStatus(external_reference, { status: "FAILED", desc: "Could not reach PayHero." });
    return res.status(502).json({ success: false, error: "Could not reach PayHero." });
  }
});

/* --- PayHero posts the result here --- */
app.post("/api/callback", async function (req, res) {
  const body = await readJson(req);
  const r = (body && body.response) || {};
  const ref = r.ExternalReference;
  if (ref) {
    await setStatus(ref, {
      status: r.Status || (r.ResultCode === 0 ? "Success" : "Failed"),
      resultCode: r.ResultCode,
      receipt: r.MpesaReceiptNumber || null,
      phone: r.Phone || null,
      amount: r.Amount || null,
      desc: r.ResultDesc || null,
    }, 60 * 60 * 24);
  }
  res.json({ ok: true });
});

/* --- The page polls this --- */
app.get("/api/status", async function (req, res) {
  const ref = req.query.ref;
  if (!ref) return res.status(400).json({ status: "UNKNOWN" });
  const data = await getStatus(ref);
  res.json(data || { status: "UNKNOWN" });
});

/* --- Serve index.html and assets (used on cPanel / a normal server;
       on Vercel the static file is served by the platform). --- */
app.use(express.static(__dirname));

module.exports = app;

/* Start a listener when run directly (cPanel Passenger and `node app.js`).
   When required by Vercel's api/index.js this block is skipped. */
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, function () {
    console.log("Fertilizer app running on port " + PORT);
  });
}
