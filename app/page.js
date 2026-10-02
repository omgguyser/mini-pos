'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// หน่วยเริ่มต้นที่ให้เลือก (เพิ่มได้ตามต้องการ)
const DEFAULT_UNITS = ['ชิ้น', 'ขวด', 'ถุง', 'กล่อง', 'แพ็ค', 'ชุด', 'unit'];

// ค่าเริ่มต้นของฟอร์ม
const emptyForm = { sku: '', name: '', price: '', stock: '', unit: '' };

// ส่งแจ้งเตือนไป Telegram ผ่าน API route (ถ้าล้มเหลว การซื้อยังสำเร็จตามปกติ)
async function notifyTelegram(payload) {
  try {
    const res = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn('ส่ง Telegram ไม่สำเร็จ:', res.status);
  } catch (err) {
    console.warn('ส่ง Telegram ไม่สำเร็จ:', err);
  }
}

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);         // ฟอร์มเพิ่มสินค้า
  const [editingId, setEditingId] = useState(null);    // id ของแถวที่กำลังแก้ไข
  const [editForm, setEditForm] = useState(emptyForm); // ข้อมูลที่กำลังแก้ไข
  const [buyingId, setBuyingId] = useState(null);      // id สินค้าที่กำลังบันทึกการซื้อ
  const [message, setMessage] = useState('');          // ข้อความยืนยันการซื้อ

  // รายการหน่วยที่ให้เลือก = ค่าเริ่มต้น + หน่วยที่มีอยู่แล้วในสินค้า (ไม่ซ้ำ)
  const unitOptions = [
    ...new Set([...DEFAULT_UNITS, ...products.map((p) => p.unit).filter(Boolean)]),
  ];

  // ดึงสินค้าทั้งหมดจาก Supabase
  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) alert('โหลดข้อมูลไม่สำเร็จ: ' + error.message);
    else setProducts(data);
    setLoading(false);
  }

  // โหลดข้อมูลครั้งแรกตอนเปิดหน้า
  useEffect(() => {
    loadProducts();
  }, []);

  // เพิ่มสินค้าใหม่
  async function handleAdd(e) {
    e.preventDefault();
    const { error } = await supabase.from('products').insert({
      sku: form.sku.trim(),
      name: form.name.trim(),
      price: Number(form.price),
      stock: Number(form.stock),
      unit: form.unit.trim() || 'ชิ้น',
    });
    if (error) {
      alert('เพิ่มสินค้าไม่สำเร็จ: ' + error.message);
      return;
    }
    setForm(emptyForm);
    loadProducts();
  }

  // เมื่อเลือกชื่อสินค้าที่มีอยู่แล้ว ให้เติมราคาและหน่วยให้อัตโนมัติ
  function handleNameChange(e) {
    const value = e.target.value;
    const match = products.find((p) => p.name === value);
    if (match) {
      setForm({ ...form, name: match.name, price: String(match.price), unit: match.unit });
    } else {
      setForm({ ...form, name: value });
    }
  }

  // ซื้อสินค้า 1 ชิ้นต่อการกด 1 ครั้ง: บันทึกลง sales, หักสต็อก 1, แล้วแจ้ง Telegram
  async function handleBuy(p) {
    setMessage('');
    const qty = 1; // ล็อกจำนวนที่ซื้อไว้ที่ 1

    setBuyingId(p.id);

    // 1) ดึงข้อมูลล่าสุดจากฐานข้อมูล (กันข้อมูลบนหน้าจอเก่า)
    const { data: fresh, error: freshError } = await supabase
      .from('products')
      .select('stock, price, name')
      .eq('id', p.id)
      .single();
    if (freshError) {
      setBuyingId(null);
      alert('ตรวจสอบสต็อกไม่สำเร็จ: ' + freshError.message);
      return;
    }

    // 2) ตรวจสอบว่ายังมีของเหลือหรือไม่
    if (fresh.stock < qty) {
      setBuyingId(null);
      loadProducts();
      alert('สินค้าหมดแล้ว');
      return;
    }

    // 3) บันทึกรายการขาย
    const total = Number(fresh.price) * qty;
    const { error: saleError } = await supabase.from('sales').insert({
      product_id: p.id,
      product_name: fresh.name,
      quantity: qty,
      total_price: total,
    });
    if (saleError) {
      setBuyingId(null);
      alert('บันทึกการซื้อไม่สำเร็จ: ' + saleError.message);
      return;
    }

    // 4) ตัดสต็อกลง 1
    const stockAfter = fresh.stock - qty;
    const { error: stockError } = await supabase
      .from('products')
      .update({ stock: stockAfter })
      .eq('id', p.id);
    if (stockError) {
      setBuyingId(null);
      alert('บันทึกการซื้อแล้ว แต่ตัดสต็อกไม่สำเร็จ: ' + stockError.message);
      return;
    }

    // 5) แจ้งเตือน Telegram หลังตัดสต็อกสำเร็จ
    // ไม่ใส่ await: ไม่ต้องรอ Telegram ก่อนแจ้งผลในหน้าเว็บ
    notifyTelegram({
      name: fresh.name,
      quantity: qty,
      total,
      stockLeft: stockAfter,
      unit: p.unit,
    });

    // 6) แจ้งสำเร็จ และโหลดสต็อกใหม่
    setMessage(`ซื้อสำเร็จ: ${fresh.name} 1 ${p.unit} ราคา ${total.toLocaleString()} บาท`);
    setBuyingId(null);
    loadProducts();
  }

  // เริ่มแก้ไข: คัดลอกข้อมูลของแถวนั้นไปใส่ editForm
  function startEdit(p) {
    setEditingId(p.id);
    setEditForm({
      sku: p.sku,
      name: p.name,
      price: String(p.price),
      stock: String(p.stock),
      unit: p.unit,
    });
  }

  // บันทึกการแก้ไข
  async function handleSave(id) {
    const { error } = await supabase
      .from('products')
      .update({
        sku: editForm.sku.trim(),
        name: editForm.name.trim(),
        price: Number(editForm.price),
        stock: Number(editForm.stock),
        unit: editForm.unit.trim() || 'ชิ้น',
      })
      .eq('id', id);
    if (error) {
      alert('แก้ไขไม่สำเร็จ: ' + error.message);
      return;
    }
    setEditingId(null);
    loadProducts();
  }

  // ลบสินค้า
  async function handleDelete(p) {
    if (!confirm(`ลบสินค้า "${p.name}" ใช่หรือไม่?`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) {
      // สินค้าที่เคยมีประวัติการขายแล้ว จะลบไม่ได้ เพราะ sales อ้างอิงอยู่ (FK)
      alert('ลบไม่สำเร็จ: ' + error.message);
      return;
    }
    loadProducts();
  }

  return (
    <div>
      <h1>รายการสินค้า</h1>

      {/* รายการหน่วยที่ใช้ร่วมกันทั้งฟอร์มเพิ่มและแถวแก้ไข */}
      <datalist id="unit-list">
        {unitOptions.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      {/* รายชื่อสินค้าที่มีอยู่แล้ว สำหรับเลือกในช่องชื่อสินค้า */}
      <datalist id="product-list">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>

      {/* ข้อความยืนยันการซื้อสำเร็จ */}
      {message && (
        <div
          className="card"
          style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}
        >
          {message}
        </div>
      )}

      {/* ฟอร์มเพิ่มสินค้าใหม่ */}
      <form className="card" onSubmit={handleAdd}>
        <h2>เพิ่มสินค้าใหม่</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="SKU"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            required
          />
          <input
            list="product-list"
            placeholder="ชื่อสินค้า (คลิกเพื่อเลือก)"
            value={form.name}
            onChange={handleNameChange}
            required
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="ราคา"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
          <input
            type="number"
            min="0"
            placeholder="คงเหลือ"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            required
          />
          <input
            list="unit-list"
            placeholder="หน่วย (คลิกเพื่อเลือก)"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
          <button type="submit">เพิ่มสินค้า</button>
        </div>
      </form>

      {/* ตารางสินค้า */}
      {loading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>ชื่อสินค้า</th>
              <th>ราคา</th>
              <th>คงเหลือ</th>
              <th>หน่วย</th>
              <th>ซื้อ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={7}>ยังไม่มีสินค้า</td>
              </tr>
            )}
            {products.map((p) =>
              editingId === p.id ? (
                // แถวโหมดแก้ไข
                <tr key={p.id}>
                  <td>
                    <input
                      style={{ width: 110 }}
                      value={editForm.sku}
                      onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 90 }}
                      value={editForm.price}
                      onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 80 }}
                      value={editForm.stock}
                      onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      list="unit-list"
                      style={{ width: 90 }}
                      value={editForm.unit}
                      onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    />
                  </td>
                  <td></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => handleSave(p.id)}>บันทึก</button>{' '}
                    <button
                      style={{ background: '#6b7280' }}
                      onClick={() => setEditingId(null)}
                    >
                      ยกเลิก
                    </button>
                  </td>
                </tr>
              ) : (
                // แถวโหมดแสดงผลปกติ
                <tr key={p.id}>
                  <td>{p.sku}</td>
                  <td>{p.name}</td>
                  <td>{Number(p.price).toLocaleString()}</td>
                  <td>{p.stock}</td>
                  <td>{p.unit}</td>
                  {/* ปุ่มซื้อ: กดครั้งละ 1 ชิ้น */}
                  <td>
                    <button
                      style={{ background: '#16a34a' }}
                      onClick={() => handleBuy(p)}
                      disabled={p.stock <= 0 || buyingId === p.id}
                    >
                      {p.stock <= 0 ? 'หมด' : buyingId === p.id ? '...' : 'ซื้อ 1'}
                    </button>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(p)}>แก้ไข</button>{' '}
                    <button
                      style={{ background: '#dc2626' }}
                      onClick={() => handleDelete(p)}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
