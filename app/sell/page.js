'use client';

import { useState, useEffect } from 'react';
// ไฟล์นี้อยู่ลึกกว่า app/page.js หนึ่งชั้น จึงต้องใช้ ../../
import { supabase } from '../../lib/supabaseClient';

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(''); // ข้อความยืนยันขายสำเร็จ

  // ดึงรายการสินค้าสำหรับ dropdown
  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });
    if (error) alert('โหลดสินค้าไม่สำเร็จ: ' + error.message);
    else setProducts(data);
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  // สินค้าที่เลือกอยู่ และยอดรวมที่คำนวณอัตโนมัติ (ราคา x จำนวน)
  const selected = products.find((p) => p.id === productId);
  const qty = Number(quantity);
  const total = selected && qty > 0 ? Number(selected.price) * qty : 0;

  async function handleSell(e) {
    e.preventDefault();
    setMessage('');

    if (!selected) return alert('กรุณาเลือกสินค้า');
    if (!Number.isInteger(qty) || qty < 1) return alert('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป');

    setSaving(true);

    // 1) ดึง stock ล่าสุดจากฐานข้อมูลก่อนขายทุกครั้ง (กันข้อมูลบนหน้าจอเก่า)
    const { data: fresh, error: freshError } = await supabase
      .from('products')
      .select('stock, price, name')
      .eq('id', selected.id)
      .single();
    if (freshError) {
      setSaving(false);
      return alert('ตรวจสอบสต็อกไม่สำเร็จ: ' + freshError.message);
    }

    // 2) ตรวจสอบว่าสต็อกพอหรือไม่
    if (fresh.stock < qty) {
      setSaving(false);
      loadProducts();
      return alert(`สต็อกไม่พอ! คงเหลือ ${fresh.stock} ${selected.unit}`);
    }

    // 3) บันทึกรายการขาย (sold_at ใช้ค่า default now() จากฐานข้อมูล)
    const { error: saleError } = await supabase.from('sales').insert({
      product_id: selected.id,
      product_name: fresh.name, // เก็บชื่อ ณ ตอนขายไว้
      quantity: qty,
      total_price: Number(fresh.price) * qty,
    });
    if (saleError) {
      setSaving(false);
      return alert('บันทึกการขายไม่สำเร็จ: ' + saleError.message);
    }

    // 4) ตัดสต็อก
    const { error: stockError } = await supabase
      .from('products')
      .update({ stock: fresh.stock - qty })
      .eq('id', selected.id);
    if (stockError) {
      setSaving(false);
      return alert('บันทึกการขายแล้ว แต่ตัดสต็อกไม่สำเร็จ: ' + stockError.message);
    }

    // 5) แจ้งสำเร็จ และรีเซ็ตฟอร์ม
    setMessage(
      `ขายสำเร็จ: ${fresh.name} x ${qty} ${selected.unit} รวม ${(Number(fresh.price) * qty).toLocaleString()} บาท`
    );
    setProductId('');
    setQuantity('1');
    setSaving(false);
    loadProducts(); // โหลดสต็อกใหม่
  }

  if (loading) return <p>กำลังโหลด...</p>;

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {/* ข้อความยืนยันขายสำเร็จ */}
      {message && (
        <div
          className="card"
          style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}
        >
          {message}
        </div>
      )}

      <form className="card" onSubmit={handleSell}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          {/* Dropdown เลือกสินค้า แสดงชื่อและราคา */}
          <label>
            สินค้า
            <select
              style={{ width: '100%' }}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              <option value="">-- เลือกสินค้า --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                  {p.name} - {Number(p.price).toLocaleString()} บาท
                  {p.stock <= 0 ? ' (หมด)' : ''}
                </option>
              ))}
            </select>
          </label>

          {selected && (
            <small>
              คงเหลือ {selected.stock} {selected.unit}
            </small>
          )}

          {/* จำนวนที่จะขาย */}
          <label>
            จำนวน
            <input
              style={{ width: '100%' }}
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>

          {/* ยอดรวมอัตโนมัติ */}
          <div style={{ fontSize: '1.3rem' }}>
            ยอดรวม: <strong>{total.toLocaleString()}</strong> บาท
          </div>

          <button type="submit" disabled={saving || !selected}>
            {saving ? 'กำลังบันทึก...' : 'ขาย'}
          </button>
        </div>
      </form>
    </div>
  );
}
