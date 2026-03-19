import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = "info@likokogy.com";
const FROM = "Likokogy <noreply@likokogy.com>";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { order, customerEmail, customerName } = await req.json();

    const totalItems = (order.items || []).reduce((sum: number, item: any) => {
      const qty = Object.values(item.sizes || {}).reduce(
        (s: number, v: any) => s + (Number(v) || 0),
        0
      );
      return sum + qty;
    }, 0);

    const itemsRows = (order.items || [])
      .map((item: any, i: number) => {
        const qty = Object.values(item.sizes || {}).reduce(
          (s: number, v: any) => s + (Number(v) || 0),
          0
        );
        const sizesText = Object.entries(item.sizes || {})
          .filter(([, v]) => Number(v) > 0)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        return `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${i + 1}. ${item.style || "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${item.colors || "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${sizesText || "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${qty}</td>
        </tr>`;
      })
      .join("");

    const orderDate = new Date(order.created).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // ─── Customer email ───────────────────────────────────────────────────────
    const customerHtml = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
  <div style="background:#111;padding:24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:2px">LIKOKOGY</h1>
    <p style="color:#aaa;margin:8px 0 0;font-size:13px">Order Confirmation</p>
  </div>
  <div style="padding:32px 24px">
    <p>Dear ${customerName || "Customer"},</p>
    <p>Thank you — your order has been received and is now under review.</p>
    <div style="background:#f8f8f8;border-radius:8px;padding:16px;margin:24px 0">
      <p style="margin:0 0 8px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px">Order Summary</p>
      <p style="margin:4px 0"><strong>Order #${order.id}</strong></p>
      <p style="margin:4px 0;font-size:14px;color:#666">Date: ${orderDate}</p>
      <p style="margin:4px 0;font-size:14px;color:#666">Total pieces: ${totalItems}</p>
      ${order.notes ? `<p style="margin:12px 0 0;font-size:14px;color:#555;font-style:italic">"${order.notes}"</p>` : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:#f0f0f0">
          <th style="padding:8px;text-align:left">Item</th>
          <th style="padding:8px;text-align:left">Colors</th>
          <th style="padding:8px;text-align:left">Sizes</th>
          <th style="padding:8px;text-align:center">Qty</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <p style="margin-top:32px;color:#555">We will be in touch if we have any questions.</p>
    <p style="color:#555">— The Likokogy Team</p>
  </div>
  <div style="background:#f0f0f0;padding:16px;text-align:center;font-size:12px;color:#999">
    <p style="margin:0">info@likokogy.com</p>
  </div>
</div>`;

    // ─── Admin notification email ─────────────────────────────────────────────
    const adminHtml = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
  <h2 style="margin-bottom:4px">New Order #${order.id}</h2>
  <p style="margin:4px 0"><strong>Customer:</strong> ${customerName} (${order.owner})</p>
  ${customerEmail ? `<p style="margin:4px 0"><strong>Email:</strong> ${customerEmail}</p>` : ""}
  <p style="margin:4px 0"><strong>Date:</strong> ${orderDate}</p>
  <p style="margin:4px 0"><strong>Total pieces:</strong> ${totalItems}</p>
  ${order.notes ? `<p style="margin:4px 0"><strong>Notes:</strong> ${order.notes}</p>` : ""}
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
    <thead>
      <tr style="background:#f0f0f0">
        <th style="padding:8px;text-align:left">Item</th>
        <th style="padding:8px;text-align:left">Colors</th>
        <th style="padding:8px;text-align:left">Sizes</th>
        <th style="padding:8px;text-align:center">Qty</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>
</div>`;

    // ─── Send emails ──────────────────────────────────────────────────────────
    const sends: Promise<Response>[] = [];

    if (customerEmail) {
      sends.push(
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM,
            to: customerEmail,
            subject: `Order #${order.id} Confirmed — Likokogy`,
            html: customerHtml,
          }),
        })
      );
    }

    sends.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: ADMIN_EMAIL,
          subject: `New Order #${order.id} from ${customerName}`,
          html: adminHtml,
        }),
      })
    );

    await Promise.all(sends);

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
