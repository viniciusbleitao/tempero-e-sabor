// api/send-order.js
//
// Função serverless do Vercel. Recebe os dados do pedido (JSON) enviados
// pelo site no momento em que o cliente clica em "Enviar pedido pelo
// WhatsApp", e dispara um e-mail formatado — pronto pra imprimir — pro
// restaurante. Roda em paralelo ao WhatsApp, sem travar nem depender dele.
//
// CONFIGURAÇÃO NECESSÁRIA (uma vez só):
//   1. Crie uma conta gratuita em https://resend.com (recomendo usar o
//      MESMO e-mail de destino abaixo, porque contas novas sem domínio
//      verificado só conseguem enviar para o próprio e-mail cadastrado).
//   2. Pegue a API key no painel do Resend.
//   3. No painel do Vercel: Project Settings → Environment Variables,
//      adicione:
//        RESEND_API_KEY   = a chave que você copiou
//        RESTAURANT_EMAIL = viniciusbleitao.usa@gmail.com (ou o e-mail real)
//   4. Coloque este arquivo na pasta /api do mesmo repositório do site
//      (crie a pasta "api" na raiz do repo, se ainda não existir) e faça
//      o commit — o Vercel detecta e publica a função sozinho.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const order = req.body;
    if (!order || !order.customer || !order.items || !order.items.length) {
      return res.status(400).json({ error: "Pedido inválido" });
    }

    const fmt = (n) => `$${Number(n).toFixed(2)}`;

    const itemsHtml = order.items
      .map(
        (it) => `
        <tr>
          <td style="padding:8px 0; border-bottom:1px solid #eee; vertical-align:top;">
            <div style="font-weight:700;">${it.qty}x ${escapeHtml(it.name)}</div>
            ${
              it.mods && it.mods.length
                ? `<div style="color:#666; font-size:12px; margin-top:2px;">${it.mods
                    .map(escapeHtml)
                    .join(" · ")}</div>`
                : ""
            }
          </td>
          <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right; white-space:nowrap; vertical-align:top;">
            ${fmt(it.lineTotal)}
          </td>
        </tr>`
      )
      .join("");

    const addressHtml =
      order.customer.fulfillment === "Entrega" && order.customer.endereco
        ? `<p style="margin:4px 0;"><b>Endereço:</b> ${escapeHtml(order.customer.endereco)}${
            order.customer.complemento ? " — " + escapeHtml(order.customer.complemento) : ""
          }</p>`
        : "";

    const deliveryFeeHtml = order.deliveryFee
      ? `<tr><td style="padding-top:10px;">Taxa de entrega (≈${order.deliveryMiles} mi)</td><td style="padding-top:10px; text-align:right;">${fmt(
          order.deliveryFee
        )}</td></tr>`
      : "";

    const html = `
      <meta charset="utf-8">
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color:#211C16;">
        <h2 style="margin:0 0 2px;">Tempero &amp; Sabor</h2>
        <p style="font-size:22px; font-weight:800; color:#D66E10; margin:0 0 18px;">Pedido #${escapeHtml(
          String(order.orderNumber)
        )}</p>

        <p style="margin:4px 0;"><b>Cliente:</b> ${escapeHtml(order.customer.nome)}</p>
        <p style="margin:4px 0;"><b>Telefone:</b> ${escapeHtml(order.customer.tel)}</p>
        <p style="margin:4px 0;"><b>Tipo:</b> ${escapeHtml(order.customer.fulfillment)}</p>
        ${addressHtml}

        <table style="width:100%; border-collapse:collapse; margin-top:18px; font-size:14px;">
          ${itemsHtml}
        </table>

        <table style="width:100%; margin-top:6px; font-size:14px;">
          ${deliveryFeeHtml}
          <tr>
            <td style="padding-top:12px; border-top:2px solid #211C16; font-size:18px; font-weight:800;">Total</td>
            <td style="padding-top:12px; border-top:2px solid #211C16; font-size:18px; font-weight:800; text-align:right;">${fmt(
              order.total
            )}</td>
          </tr>
        </table>

        <p style="margin-top:16px;"><b>Pagamento:</b> ${escapeHtml(order.payment)}</p>
        ${order.obs ? `<p style="margin:4px 0;"><b>Observações:</b> ${escapeHtml(order.obs)}</p>` : ""}

        <p style="margin-top:24px; font-size:12px; color:#999;">Pedido feito em ${new Date(
          order.date
        ).toLocaleString("pt-BR")} — envie este e-mail para impressão.</p>
      </div>`;

    const restaurantEmail = process.env.RESTAURANT_EMAIL || "viniciusbleitao.usa@gmail.com";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Pedidos Tempero & Sabor <onboarding@resend.dev>",
        to: [restaurantEmail],
        subject: `Novo Pedido #${order.orderNumber} — Tempero & Sabor`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error("Resend error:", detail);
      return res.status(502).json({ error: "Falha ao enviar e-mail", detail });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("send-order error:", err);
    return res.status(500).json({ error: "Erro interno", detail: String(err) });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
