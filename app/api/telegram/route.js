// API route ฝั่งเซิร์ฟเวอร์: ส่งแจ้งเตือนเข้า Telegram (โทเคนไม่หลุดไปที่เบราว์เซอร์)
const LOW_STOCK_LIMIT = 5; // เตือนเมื่อสต๊อกเหลือ <= 5

// กันชื่อสินค้าที่มีอักขระ < > & ทำให้ HTML ของ Telegram พัง
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ส่งข้อความ 1 ข้อความไปที่ Telegram
async function sendTelegram(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.ok;
}

export async function POST(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return Response.json({ ok: false, error: 'ยังไม่ได้ตั้งค่า Telegram' }, { status: 500 });
  }

  try {
    const { name, quantity, total, stockLeft, unit } = await request.json();
    const u = esc(unit || 'ชิ้น');
    const time = new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // งานที่ 1: แจ้งเตือน Order ใหม่
    const orderText =
      `🛍️ <b>มีรายการขายใหม่!</b>\n` +
      `- สินค้า: ${esc(name)}\n` +
      `- จำนวน: ${Number(quantity)} ${u}\n` +
      `- ราคารวม: ${Number(total).toLocaleString()} บาท\n` +
      `- สต๊อกคงเหลือปัจจุบัน: ${Number(stockLeft)} ${u}\n` +
      `- เวลา: ${time}`;
    const orderOk = await sendTelegram(token, chatId, orderText);

    // งานที่ 2: แจ้งเตือนสต๊อกเหลือน้อย (แยกอีก 1 ข้อความ)
    let lowOk = true;
    if (Number(stockLeft) <= LOW_STOCK_LIMIT) {
      const lowText =
        `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
        `- สินค้า: ${esc(name)}\n` +
        `- คงเหลือเพียง: ${Number(stockLeft)} ${u}\n` +
        `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;
      lowOk = await sendTelegram(token, chatId, lowText);
    }

    return Response.json({ ok: orderOk && lowOk });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
