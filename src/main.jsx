import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, BarChart3, Boxes, BriefcaseBusiness, CalendarDays, ChevronDown,
  CircleDollarSign, ClipboardList, FileClock, LogOut, Menu, PackagePlus,
  Plus, RefreshCw, Smartphone, Users, Wrench, X
} from 'lucide-react';
import { configured, supabase } from './supabase';
import './style.css';

const money = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const roleNames = { owner: 'Pemilik', cashier: 'Kasir', technician: 'Teknisi' };
const nav = [
  ['dashboard','Dashboard',BarChart3,['owner','cashier','technician']],
  ['sales','Penjualan',CircleDollarSign,['owner','cashier']],
  ['products','Stok barang',Boxes,['owner','cashier']],
  ['services','Servis HP',Wrench,['owner','cashier','technician']],
  ['purchases','Pembelian & retur',PackagePlus,['owner']],
  ['cash','Kas & pengeluaran',BriefcaseBusiness,['owner','cashier']],
  ['reports','Laporan harian',ClipboardList,['owner']],
  ['users','Pengguna',Users,['owner']]
];

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState({ products: [], sales: [], services: [], expenses: [], purchases: [], returns: [] });
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let live = true;
    async function load() {
      if (!session?.user) { setProfile(null); setLoading(false); return; }
      setLoading(true);
      const { data: p, error: pe } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (pe) setNotice(pe.message);
      if (!p) {
        setProfile(null);
        setNotice('Akun belum memiliki profil. Minta pemilik menambahkan akun ini di tabel profiles sesuai petunjuk README.');
        setLoading(false); return;
      }
      if (live) setProfile(p);
      const results = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('services').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('returns').select('*').order('created_at', { ascending: false }).limit(500)
      ]);
      if (live) {
        setData({ products: results[0].data || [], sales: results[1].data || [], services: results[2].data || [], expenses: results[3].data || [], purchases: results[4].data || [], returns: results[5].data || [] });
        const err = results.find(r => r.error);
        if (err) setNotice(err.error.message);
        setLoading(false);
      }
    }
    load();
    return () => { live = false; };
  }, [session, refresh]);

  const role = profile?.role;
  const allowedNav = nav.filter(n => n[3].includes(role));
  const allowedSales = useMemo(() => data.sales.filter(s => s.transaction_date === today()), [data.sales]);
  const todayServices = useMemo(() => data.services.filter(s => s.service_date === today()), [data.services]);
  const todayExpenses = useMemo(() => data.expenses.filter(s => s.expense_date === today()), [data.expenses]);
  const turnover = allowedSales.reduce((a,s)=>a+Number(s.total||0),0);
  const profit = allowedSales.reduce((a,s)=>a+Number(s.profit||0),0);
  const cashOut = todayExpenses.reduce((a,s)=>a+Number(s.amount||0),0);

  async function signIn(e) {
    e.preventDefault(); setBusy(true); setNotice('');
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('password') });
    if (error) setNotice(error.message);
    setBusy(false);
  }
  async function signOut() { await supabase.auth.signOut(); setPage('dashboard'); }

  async function submitForm(e) {
    e.preventDefault(); setBusy(true); setNotice('');
    const fd = new FormData(e.currentTarget);
    const v = Object.fromEntries(fd.entries());
    let error = null;
    try {
      if (modal === 'product') {
        const row = { name:v.name, category:v.category, sku:v.sku || null, imei:v.imei || null, stock:Number(v.stock), cost_price:Number(v.cost_price), sell_price:Number(v.sell_price), notes:v.notes || null };
        ({ error } = await supabase.from('products').insert(row));
      } else if (modal === 'sale') {
        const { data: result, error: e1 } = await supabase.rpc('record_sale', {
          p_product_id: v.product_id, p_quantity: Number(v.quantity), p_unit_price: Number(v.unit_price),
          p_payment_method: v.payment_method, p_customer_name: v.customer_name || null, p_note: v.note || null
        });
        error = e1;
      } else if (modal === 'service') {
        ({ error } = await supabase.from('services').insert({
          customer_name:v.customer_name, customer_phone:v.customer_phone || null, device:v.device,
          imei:v.imei || null, complaint:v.complaint, diagnosis:v.diagnosis || null,
          service_cost:Number(v.service_cost || 0), status:v.status, technician_name:v.technician_name || null, notes:v.notes || null
        }));
      } else if (modal === 'expense') {
        ({ error } = await supabase.from('expenses').insert({ category:v.category, description:v.description, amount:Number(v.amount), payment_method:v.payment_method, expense_date:v.expense_date || today() }));
      } else if (modal === 'purchase') {
        ({ error } = await supabase.rpc('record_purchase', {
          p_product_id:v.product_id, p_quantity:Number(v.quantity), p_unit_cost:Number(v.unit_cost), p_supplier:v.supplier || null, p_note:v.note || null
        }));
      } else if (modal === 'return') {
        ({ error } = await supabase.rpc('record_return', {
          p_product_id:v.product_id, p_quantity:Number(v.quantity), p_unit_refund:Number(v.unit_refund), p_reason:v.reason, p_supplier:v.supplier || null
        }));
      } else if (modal === 'service-update') {
        ({ error } = await supabase.from('services').update({ status:v.status, diagnosis:v.diagnosis || null, service_cost:Number(v.service_cost || 0), notes:v.notes || null }).eq('id', v.id));
      }
      if (error) throw error;
      setModal(null); setRefresh(x=>x+1); setNotice('Data berhasil disimpan.');
    } catch (err) { setNotice(err.message || 'Terjadi kesalahan saat menyimpan data.'); }
    setBusy(false);
  }

  if (!configured) return <Setup />;
  if (loading && !profile) return <div className="center"><div className="loader"/><p>Memuat SALIM PHONE…</p></div>;
  if (!session) return <Login onSubmit={signIn} busy={busy} notice={notice} />;
  if (!profile) return <div className="center"><div className="login-card"><h2>Akun belum disiapkan</h2><p>{notice}</p><button onClick={signOut} className="secondary">Keluar</button></div></div>;

  const titles = Object.fromEntries(nav.map(n=>[n[0],n[1]]));
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Smartphone size={24}/></div><div><strong>SALIM PHONE</strong><small>Manajemen Konter</small></div></div>
      <div className="shop-tag">WORKSPACE KONTER</div>
      <nav>{allowedNav.map(([id,label,Icon])=><button key={id} className={page===id?'nav-item active':'nav-item'} onClick={()=>setPage(id)}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="avatar">{(profile.full_name||session.user.email).slice(0,1).toUpperCase()}</div><div className="profile-mini"><strong>{profile.full_name || session.user.email}</strong><small>{roleNames[role] || role}</small></div><button className="icon-btn" title="Keluar" onClick={signOut}><LogOut size={18}/></button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">SALIM PHONE / {titles[page]}</div><h1>{titles[page]}</h1></div><div className="top-actions"><span className="date-chip"><CalendarDays size={16}/>{new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Jakarta'})}</span><button className="icon-btn" title="Muat ulang" onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={18}/></button></div></header>
      {notice && <div className="notice"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={16}/></button></div>}
      {page==='dashboard' && <Dashboard role={role} turnover={turnover} profit={profit} cashOut={cashOut} sales={allowedSales} services={todayServices} products={data.products} onNavigate={setPage} />}
      {page==='products' && <Products products={data.products} canAdd={role==='owner'} onAdd={()=>setModal('product')}/>}
      {page==='sales' && <Sales products={data.products} sales={data.sales} onAdd={()=>setModal('sale')}/>}
      {page==='services' && <Services services={data.services} role={role} onAdd={()=>setModal('service')} onUpdate={s=>setModal({type:'service-update',data:s})}/>}
      {page==='cash' && <Cash expenses={data.expenses} onAdd={()=>setModal('expense')}/>}
      {page==='purchases' && <Purchases products={data.products} purchases={data.purchases} returns={data.returns} onPurchase={()=>setModal('purchase')} onReturn={()=>setModal('return')}/>}
      {page==='reports' && <Reports sales={data.sales} services={data.services} expenses={data.expenses} purchases={data.purchases} returns={data.returns}/>}
      {page==='users' && <UsersPage user={profile} />}
    </main>
    {modal && <Modal modal={typeof modal==='string'?modal:modal.type} modalData={typeof modal==='object'?modal.data:null} products={data.products} busy={busy} onClose={()=>setModal(null)} onSubmit={submitForm} />}
  </div>;
}

function Setup(){return <div className="center"><div className="login-card"><div className="brand-icon"><Smartphone/></div><h1>SALIM PHONE</h1><h2>Konfigurasi belum selesai</h2><p>Tambahkan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> di file <code>.env</code>. Ikuti README untuk membuat database online.</p></div></div>}
function Login({onSubmit,busy,notice}){return <div className="login-wrap"><div className="login-card"><div className="brand-icon"><Smartphone size={26}/></div><div className="eyebrow">SISTEM OPERASIONAL KONTER</div><h1>SALIM PHONE</h1><p className="muted">Masuk untuk mengelola penjualan, servis, dan stok.</p>{notice&&<div className="notice">{notice}</div>}<form onSubmit={onSubmit} className="form-stack"><label>Email akun<input type="email" name="email" required placeholder="nama@email.com"/></label><label>Password<input type="password" name="password" required placeholder="Password akun"/></label><button disabled={busy} className="primary full">{busy?'Memproses…':'Masuk ke aplikasi'}</button></form><p className="tiny muted">Akun dibuat oleh pemilik melalui Supabase Authentication.</p></div></div>}
function Stat({label,value,sub,Icon,tint='blue'}){return <div className="stat-card"><div className={'stat-icon '+tint}><Icon size={20}/></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-sub">{sub}</div></div>}
function Dashboard({role,turnover,profit,cashOut,sales,services,products,onNavigate}){return <><div className="welcome"><div><h2>Ringkasan operasional</h2><p>Data berdasarkan transaksi hari ini (WIB).</p></div><span className="live-dot">● Data tersimpan online</span></div><div className="stats-grid"><Stat label="Omzet hari ini" value={money(turnover)} sub={`${sales.length} transaksi penjualan`} Icon={CircleDollarSign}/><Stat label="Laba kotor" value={money(profit)} sub="Dari penjualan yang tercatat" Icon={BarChart3} tint="green"/><Stat label="Pengeluaran" value={money(cashOut)} sub="Kas keluar hari ini" Icon={Activity} tint="orange"/><Stat label="Servis hari ini" value={services.length} sub="Tiket servis dibuat hari ini" Icon={Wrench} tint="purple"/></div><div className="content-grid"><section className="panel"><div className="panel-heading"><div><h3>Transaksi terbaru hari ini</h3><p>Penjualan tercatat</p></div><button className="text-btn" onClick={()=>onNavigate(role==='owner'?'reports':'sales')}>Lihat data <ChevronDown size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Produk</th><th>Total</th><th>Metode</th></tr></thead><tbody>{sales.slice(0,7).map(s=><tr key={s.id}><td>{new Date(s.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</td><td>{s.product_name_snapshot}</td><td>{money(s.total)}</td><td><span className="status-pill">{s.payment_method}</span></td></tr>)}{!sales.length&&<Empty col={4} text="Belum ada penjualan hari ini."/>}</tbody></table></div></section><section className="panel"><div className="panel-heading"><div><h3>Perlu diperhatikan</h3><p>Status stok barang</p></div><Boxes size={20}/></div>{products.filter(p=>Number(p.stock)<=3).slice(0,6).map(p=><div className="low-stock" key={p.id}><div className="product-dot"><Smartphone size={16}/></div><div className="grow"><strong>{p.name}</strong><small>{p.category||'Barang'}</small></div><span className={Number(p.stock)===0?'stock-zero':'stock-low'}>{p.stock} unit</span></div>)}{!products.some(p=>Number(p.stock)<=3)&&<p className="muted">Tidak ada stok kritis.</p>}<button className="secondary full" onClick={()=>onNavigate('products')}>Kelola stok barang</button></section></div></>}
function PageHeading({title,desc,action,children}){return <div className="page-heading"><div><h2>{title}</h2><p>{desc}</p></div><div className="heading-actions">{children}{action}</div></div>}
function Empty({col=1,text='Belum ada data.'}){return <tr><td colSpan={col} className="empty">{text}</td></tr>}
function Products({products,canAdd,onAdd}){return <><PageHeading title="Stok barang" desc="Pantau persediaan HP dan aksesori." action={canAdd&&<button className="primary" onClick={onAdd}><Plus size={17}/>Tambah barang</button>}/><div className="stats-grid compact"><Stat label="Jenis barang" value={products.length} sub="SKU terdaftar" Icon={Boxes}/><Stat label="Total unit" value={products.reduce((a,p)=>a+Number(p.stock),0)} sub="Seluruh stok" Icon={Smartphone}/><Stat label="Nilai modal stok" value={money(products.reduce((a,p)=>a+Number(p.stock)*Number(p.cost_price),0))} sub="Estimasi harga modal" Icon={CircleDollarSign}/></div><section className="panel"><div className="table-wrap"><table><thead><tr><th>Barang</th><th>Kategori</th><th>SKU / IMEI</th><th>Stok</th><th>Harga modal</th><th>Harga jual</th><th>Status</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><strong>{p.name}</strong>{p.notes&&<small className="subline">{p.notes}</small>}</td><td>{p.category}</td><td>{p.sku||p.imei||'—'}</td><td>{p.stock}</td><td>{money(p.cost_price)}</td><td>{money(p.sell_price)}</td><td><span className={'status-pill '+(p.stock<=0?'danger':p.stock<=3?'warning':'success')}>{p.stock<=0?'Habis':p.stock<=3?'Menipis':'Tersedia'}</span></td></tr>)}{!products.length&&<Empty col={7} text="Belum ada barang. Pemilik dapat menambahkan stok pertama."/>}</tbody></table></div></section></>}
function Sales({products,sales,onAdd}){return <><PageHeading title="Penjualan" desc="Catat transaksi dan pantau riwayat penjualan." action={<button className="primary" onClick={onAdd}><Plus size={17}/>Transaksi baru</button>}/><section className="panel"><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Barang</th><th>Qty</th><th>Total</th><th>Laba kotor</th><th>Pembayaran</th><th>Pencatat</th></tr></thead><tbody>{sales.map(s=><tr key={s.id}><td>{s.transaction_date}</td><td><strong>{s.product_name_snapshot}</strong>{s.customer_name&&<small className="subline">{s.customer_name}</small>}</td><td>{s.quantity}</td><td>{money(s.total)}</td><td className="green-text">{money(s.profit)}</td><td><span className="status-pill">{s.payment_method}</span></td><td>{s.created_by_name||'—'}</td></tr>)}{!sales.length&&<Empty col={7}/>}</tbody></table></div></section></>}
function Services({services,role,onAdd,onUpdate}){return <><PageHeading title="Servis HP" desc="Kelola tiket servis dari penerimaan sampai selesai." action={role!=='technician'&&<button className="primary" onClick={onAdd}><Plus size={17}/>Tiket servis baru</button>}/><section className="panel"><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Pelanggan</th><th>Perangkat</th><th>Keluhan</th><th>Biaya</th><th>Teknisi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{services.map(s=><tr key={s.id}><td>{s.service_date}</td><td><strong>{s.customer_name}</strong><small className="subline">{s.customer_phone||'—'}</small></td><td>{s.device}{s.imei&&<small className="subline">IMEI: {s.imei}</small>}</td><td>{s.complaint}</td><td>{money(s.service_cost)}</td><td>{s.technician_name||'Belum ditentukan'}</td><td><span className={'status-pill '+(s.status==='Selesai'?'success':s.status==='Dibatalkan'?'danger':'warning')}>{s.status}</span></td><td><button className="small-btn" onClick={()=>onUpdate(s)}>Ubah status</button></td></tr>)}{!services.length&&<Empty col={8}/>}</tbody></table></div></section></>}
function Cash({expenses,onAdd}){return <><PageHeading title="Kas & pengeluaran" desc="Catat biaya operasional dan kas keluar." action={<button className="primary" onClick={onAdd}><Plus size={17}/>Catat pengeluaran</button>}/><div className="stats-grid compact"><Stat label="Total pengeluaran" value={money(expenses.filter(e=>e.expense_date===today()).reduce((a,e)=>a+Number(e.amount),0))} sub="Hari ini" Icon={CircleDollarSign} tint="orange"/></div><section className="panel"><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Kategori</th><th>Deskripsi</th><th>Jumlah</th><th>Pembayaran</th><th>Pencatat</th></tr></thead><tbody>{expenses.map(e=><tr key={e.id}><td>{e.expense_date}</td><td>{e.category}</td><td>{e.description}</td><td>{money(e.amount)}</td><td>{e.payment_method}</td><td>{e.created_by_name||'—'}</td></tr>)}{!expenses.length&&<Empty col={6}/>}</tbody></table></div></section></>}
function Purchases({products,purchases,returns,onPurchase,onReturn}){return <><PageHeading title="Pembelian & retur" desc="Catat barang masuk dari supplier dan retur barang." action={<><button className="secondary" onClick={onReturn}>Retur barang</button><button className="primary" onClick={onPurchase}><Plus size={17}/>Pembelian baru</button></>}/><div className="content-grid"><section className="panel"><div className="panel-heading"><div><h3>Pembelian barang</h3><p>Riwayat barang masuk</p></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Barang</th><th>Qty</th><th>Harga modal/unit</th><th>Supplier</th></tr></thead><tbody>{purchases.map(p=><tr key={p.id}><td>{p.purchase_date}</td><td>{p.product_name_snapshot}</td><td>{p.quantity}</td><td>{money(p.unit_cost)}</td><td>{p.supplier||'—'}</td></tr>)}{!purchases.length&&<Empty col={5}/>}</tbody></table></div></section><section className="panel"><div className="panel-heading"><div><h3>Retur barang</h3><p>Riwayat retur ke supplier</p></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Barang</th><th>Qty</th><th>Alasan</th></tr></thead><tbody>{returns.map(r=><tr key={r.id}><td>{r.return_date}</td><td>{r.product_name_snapshot}</td><td>{r.quantity}</td><td>{r.reason}</td></tr>)}{!returns.length&&<Empty col={4}/>}</tbody></table></div></section></div></>}
function Reports({sales,services,expenses,purchases,returns}){const [date,setDate]=useState(today());const ds=sales.filter(x=>x.transaction_date===date), de=expenses.filter(x=>x.expense_date===date), dv=services.filter(x=>x.service_date===date), dp=purchases.filter(x=>x.purchase_date===date), dr=returns.filter(x=>x.return_date===date);const sum=(arr,k)=>arr.reduce((a,x)=>a+Number(x[k]||0),0);return <><PageHeading title="Laporan harian" desc="Pilih tanggal untuk melihat rekap aktivitas konter."/><div className="panel filter-panel"><label>Tanggal laporan<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="secondary" onClick={()=>{const rows=[['Kategori','Jumlah'],['Omzet',sum(ds,'total')],['Laba kotor',sum(ds,'profit')],['Pengeluaran',sum(de,'amount')],['Jumlah penjualan',ds.length],['Tiket servis',dv.length],['Pembelian',dp.length],['Retur',dr.length]];const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));a.download=`laporan-salim-phone-${date}.csv`;a.click();URL.revokeObjectURL(a.href)}}>Ekspor CSV</button></div><div className="stats-grid"><Stat label="Omzet" value={money(sum(ds,'total'))} sub={`${ds.length} transaksi`} Icon={CircleDollarSign}/><Stat label="Laba kotor" value={money(sum(ds,'profit'))} sub="Sebelum biaya operasional" Icon={BarChart3} tint="green"/><Stat label="Pengeluaran" value={money(sum(de,'amount'))} sub={`${de.length} catatan kas keluar`} Icon={Activity} tint="orange"/><Stat label="Servis dibuat" value={dv.length} sub={`${dp.length} pembelian · ${dr.length} retur`} Icon={Wrench} tint="purple"/></div><section className="panel"><div className="panel-heading"><div><h3>Penjualan pada {date}</h3><p>Rekap berdasarkan tanggal transaksi</p></div></div><div className="table-wrap"><table><thead><tr><th>Produk</th><th>Qty</th><th>Omzet</th><th>Laba kotor</th><th>Metode</th></tr></thead><tbody>{ds.map(s=><tr key={s.id}><td>{s.product_name_snapshot}</td><td>{s.quantity}</td><td>{money(s.total)}</td><td>{money(s.profit)}</td><td>{s.payment_method}</td></tr>)}{!ds.length&&<Empty col={5} text="Tidak ada transaksi penjualan pada tanggal ini."/>}</tbody></table></div></section></>}
function UsersPage({user}){return <><PageHeading title="Pengguna & akses" desc="Pengelolaan akun dilakukan melalui Supabase Authentication."/><section className="panel info-panel"><Users size={28}/><h3>Role pengguna</h3><p><strong>Pemilik:</strong> akses seluruh modul, laporan, pembelian, retur, dan penambahan stok.</p><p><strong>Kasir:</strong> penjualan, melihat stok, membuat tiket servis, dan mencatat pengeluaran.</p><p><strong>Teknisi:</strong> melihat dan memperbarui tiket servis.</p><div className="notice">Akun yang sedang masuk: {user.full_name || 'Pengguna'} ({roleNames[user.role] || user.role}). Untuk membuat akun, pemilik menambahkan user di Authentication lalu memasangkan profil/role di SQL Editor. Jangan memberikan service-role key kepada pengguna.</div></section></>}
function Field({label,name,type='text',required=true,placeholder,defaultValue,children,min,step}){return <label>{label}{children||<input name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue} min={min} step={step}/>}</label>}
function Modal({modal,modalData,products,busy,onClose,onSubmit}){const isUpdate=modal==='service-update';const title={product:'Tambah barang',sale:'Transaksi penjualan',service:'Tiket servis baru',expense:'Catat pengeluaran',purchase:'Pembelian barang',return:'Retur ke supplier','service-update':'Perbarui tiket servis'}[modal];return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><div><h2>{title}</h2><p>Data tersimpan di database online.</p></div><button className="icon-btn" onClick={onClose}><X/></button></div><form onSubmit={onSubmit} className="form-stack">
{modal==='product'&&<><Field label="Nama barang" name="name" placeholder="Contoh: iPhone 12 128GB"/><Field label="Kategori" name="category"><select name="category" required><option>HP</option><option>Aksesori</option><option>Sparepart</option><option>Lainnya</option></select></Field><Field label="SKU / kode barang" name="sku" required={false}/><Field label="IMEI (untuk unit HP)" name="imei" required={false}/><div className="form-row"><Field label="Stok awal" name="stock" type="number" min="0" defaultValue="1"/><Field label="Harga modal/unit" name="cost_price" type="number" min="0"/><Field label="Harga jual/unit" name="sell_price" type="number" min="0"/></div><Field label="Catatan" name="notes" required={false}/></>}
{modal==='sale'&&<><Field label="Barang" name="product_id"><select name="product_id" required>{products.filter(p=>p.stock>0).map(p=><option key={p.id} value={p.id}>{p.name} — stok {p.stock} — {money(p.sell_price)}</option>)}</select></Field><div className="form-row"><Field label="Jumlah" name="quantity" type="number" min="1" defaultValue="1"/><Field label="Harga jual/unit" name="unit_price" type="number" min="0"/></div><Field label="Nama pelanggan" name="customer_name" required={false}/><Field label="Metode pembayaran" name="payment_method"><select name="payment_method"><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>Debit</option><option>Tempo</option></select></Field><Field label="Catatan" name="note" required={false}/><p className="tiny muted">Harga jual diisi sesuai harga transaksi. Stok dan laba dihitung di database.</p></>}
{modal==='service'&&<><div className="form-row"><Field label="Nama pelanggan" name="customer_name"/><Field label="Nomor telepon" name="customer_phone" required={false}/></div><Field label="Tipe perangkat" name="device" placeholder="Contoh: Samsung A15"/><Field label="IMEI / serial" name="imei" required={false}/><Field label="Keluhan pelanggan" name="complaint" placeholder="Layar, baterai, software, dll."/><Field label="Diagnosis awal" name="diagnosis" required={false}/><div className="form-row"><Field label="Estimasi biaya (Rp)" name="service_cost" type="number" min="0" defaultValue="0"/><Field label="Teknisi" name="technician_name" required={false}/></div><Field label="Status" name="status"><select name="status"><option>Diterima</option><option>Dicek</option><option>Menunggu sparepart</option><option>Dikerjakan</option><option>Selesai</option><option>Diambil pelanggan</option><option>Dibatalkan</option></select></Field><Field label="Catatan" name="notes" required={false}/></>}
{modal==='service-update'&&<><input type="hidden" name="id" value={modalData.id}/><Field label="Status servis" name="status"><select name="status" defaultValue={modalData.status}>{['Diterima','Dicek','Menunggu sparepart','Dikerjakan','Selesai','Diambil pelanggan','Dibatalkan'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Diagnosis" name="diagnosis" required={false} defaultValue={modalData.diagnosis}/><Field label="Biaya servis (Rp)" name="service_cost" type="number" min="0" defaultValue={modalData.service_cost}/><Field label="Catatan" name="notes" required={false} defaultValue={modalData.notes}/></>}
{modal==='expense'&&<><Field label="Kategori" name="category"><select name="category"><option>Operasional</option><option>Transportasi</option><option>Makan</option><option>Sewa</option><option>Listrik / internet</option><option>Lainnya</option></select></Field><Field label="Deskripsi" name="description" placeholder="Contoh: beli perlengkapan servis"/><Field label="Jumlah (Rp)" name="amount" type="number" min="1"/><div className="form-row"><Field label="Tanggal" name="expense_date" type="date" defaultValue={today()}/><Field label="Metode pembayaran" name="payment_method"><select name="payment_method"><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>Debit</option></select></Field></div></>}
{modal==='purchase'&&<><Field label="Barang" name="product_id"><select name="product_id" required>{products.map(p=><option key={p.id} value={p.id}>{p.name} (stok {p.stock})</option>)}</select></Field><div className="form-row"><Field label="Jumlah masuk" name="quantity" type="number" min="1"/><Field label="Harga modal/unit" name="unit_cost" type="number" min="0"/></div><Field label="Supplier" name="supplier" required={false}/><Field label="Catatan" name="note" required={false}/></>}
{modal==='return'&&<><Field label="Barang" name="product_id"><select name="product_id" required>{products.map(p=><option key={p.id} value={p.id}>{p.name} (stok {p.stock})</option>)}</select></Field><div className="form-row"><Field label="Jumlah retur" name="quantity" type="number" min="1"/><Field label="Nilai refund/unit" name="unit_refund" type="number" min="0"/></div><Field label="Alasan retur" name="reason" placeholder="Rusak, salah barang, dll."/><Field label="Supplier" name="supplier" required={false}/></>}
<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Batal</button><button className="primary" disabled={busy}>{busy?'Menyimpan…':'Simpan data'}</button></div></form></div></div>}
createRoot(document.getElementById('root')).render(<App/>);