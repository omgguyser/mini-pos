// API route ฝั่งเซิร์ฟเวอร์: ส่งแจ้งเตือนเข้า Telegram (โทเคนไม่หลุดไปที่เบราว์เซอร์)
// เรียกได้ทั้งจากหน้า mini-pos และจากเว็บ Landing Page (เปิด CORS ไว้)
const LOW_STOCK_LIMIT = 5; // เตือนเมื่อสต๊อกเหลือ <= 5

// CORS: อนุญาตให้เว็บ Landing Page (โดเมนอื่น) เรียก API นี้ได้
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ตอบกลับพร้อมหัว CORS
const reply = (body, status = 200) =>
  Response.json(body, { status, headers: CORS });

// เบราว์เซอร์จะส่ง OPTIONS มาถามก่อน (preflight) ต้องตอบรับไว้
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// กันข้อความที่มีอักขระ < > & ทำให้ HTML ของ Telegram พัง
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ส่งข้อความ 1 ข้อความไปที่ Telegram และ log ข้อผิดพลาดจริงจาก Telegram
async function sendTelegram(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    console.error('Telegram error:', res.status, await res.text());
  }
  return res.ok;
}

export async function POST(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) console.error('Missing env: TELEGRAM_BOT_TOKEN');
  if (!chatId) console.error('Missing env: TELEGRAM_CHAT_ID');
  if (!token || !chatId) {
    return reply({ ok: false, error: 'ยังไม่ได้ตั้งค่า Telegram' }, 500);
  }

  try {
    const { name, quantity, total, stockLeft, unit, customer, contact, note } =
      await request.json();
    const u = esc(unit || 'ชิ้น');
    const time = new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // ถ้ามีชื่อผู้สมัคร (มาจาก Landing Page) ให้ใช้หัวข้อและบรรทัดของผู้สมัคร
    const isApplication = Boolean(customer);
    const title = isApplication ? '📝 <b>มีผู้สมัครใหม่!</b>' : '🛍️ <b>มีรายการขายใหม่!</b>';

    let orderText =
      `${title}\n` +
      `- สินค้า: ${esc(name)}\n` +
      `- จำนวน: ${Number(quantity)} ${u}\n` +
      `- ราคารวม: ${Number(total).toLocaleString()} บาท\n` +
      `- สต๊อกคงเหลือปัจจุบัน: ${Number(stockLeft)} ${u}\n`;
    if (isApplication) {
      orderText += `- ผู้สมัคร: ${esc(customer)}\n`;
      if (contact) orderText += `- ติดต่อ: ${esc(contact)}\n`;
      if (note) orderText += `- หมายเหตุ: ${esc(note)}\n`;
    }
    orderText += `- เวลา: ${time}`;
    const orderOk = await sendTelegram(token, chatId, orderText);

    // แจ้งเตือนสต๊อกเหลือน้อย (แยกอีก 1 ข้อความ)
    let lowOk = true;
    if (Number(stockLeft) <= LOW_STOCK_LIMIT) {
      const lowText =
        `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
        `- สินค้า: ${esc(name)}\n` +
        `- คงเหลือเพียง: ${Number(stockLeft)} ${u}\n` +
        `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;
      lowOk = await sendTelegram(token, chatId, lowText);
    }

    return reply({ ok: orderOk && lowOk });
  } catch (err) {
    console.error('Telegram route error:', err);
    return reply({ ok: false, error: String(err) }, 500);
  }
}
