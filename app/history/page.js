'use client';

import { useState, useEffect } from 'react';
// ไฟล์นี้อยู่ใน app/history/ จึงต้องใช้ ../../
import { supabase } from '../../lib/supabaseClient';

export default function HistoryPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  // ดึงรายการขายทั้งหมด เรียงจากล่าสุดไปเก่าสุด
  async function loadSales() {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('sold_at', { ascending: false });
    if (error) alert('โหลดประวัติการขายไม่สำเร็จ: ' + error.message);
    else setSales(data);
    setLoading(false);
  }

  useEffect(() => {
    loadSales();
  }, []);

  // ยอดขายรวมทั้งหมด (sum ของ total_price)
  const grandTotal = sales.reduce((sum, s) => sum + Number(s.total_price), 0);

  // จัดรูปแบบวันเวลาเป็นแบบไทย
  function formatDate(iso) {
    return new Date(iso).toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  if (loading) return <p>กำลังโหลด...</p>;

  return (
    <div>
      <h1>ประวัติการขาย</h1>

      {/* ยอดขายรวมด้านบนตาราง */}
      <div className="card" style={{ fontSize: '1.3rem' }}>
        ยอดขายรวมทั้งหมด: <strong>{grandTotal.toLocaleString()}</strong> บาท
        <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
          จาก {sales.length} รายการ
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>วันเวลาที่ขาย</th>
            <th>ชื่อสินค้า</th>
            <th>จำนวน</th>
            <th>ยอดรวม (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {sales.length === 0 && (
            <tr>
              <td colSpan={4}>ยังไม่มีรายการขาย</td>
            </tr>
          )}
          {sales.map((s) => (
            <tr key={s.id}>
              <td>{formatDate(s.sold_at)}</td>
              <td>{s.product_name}</td>
              <td>{s.quantity}</td>
              <td>{Number(s.total_price).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
