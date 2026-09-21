import React, {useEffect, useMemo, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {LogIn, LogOut, Plus, Trash2, Save, Calculator, ShieldCheck, Sparkles, Settings, RefreshCw} from 'lucide-react'
import {supabase} from './supabase'
import './styles.css'

const DEMO_PRODUCTS = [
  {id:'1',name:'Zlaté mince',category:'Zlato',active:true,sort_order:1},
  {id:'2',name:'Zlaté prsteny',category:'Šperky',active:true,sort_order:2},
  {id:'3',name:'Hodinky',category:'Hodinky',active:true,sort_order:3},
  {id:'4',name:'Klenoty',category:'Šperky',active:true,sort_order:4},
  {id:'5',name:'Zvláštní karty',category:'Sběratelské',active:true,sort_order:5},
  {id:'6',name:'Náhrdelníky',category:'Šperky',active:true,sort_order:6},
  {id:'7',name:'Autodíly',category:'Auto',active:true,sort_order:7},
  {id:'8',name:'Golfová hůl',category:'Sport',active:true,sort_order:8},
  {id:'9',name:'Kulečníkové tágo',category:'Sport',active:true,sort_order:9},
  {id:'10',name:'Jiné věci na domluvě',category:'Ostatní',active:true,sort_order:10}
]

const LOGO = `${import.meta.env.BASE_URL}logo.png`

function App(){
  const [admin,setAdmin]=useState(false)
  const [session,setSession]=useState(null)
  const [products,setProducts]=useState(DEMO_PRODUCTS)
  const [qty,setQty]=useState({})
  const [quote,setQuote]=useState(null)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  useEffect(()=>{
    if(!supabase){setLoading(false);return}
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>subscription.unsubscribe()
  },[])

  useEffect(()=>{loadProducts()},[session])
  const loadProducts=async()=>{
    setLoading(true)
    if(!supabase){setLoading(false);return}
    const fn=admin ? 'get_admin_products' : 'get_public_products'
    const {data,error}=await supabase.rpc(fn)
    if(!error && data) setProducts(data)
    setLoading(false)
  }

  const selected = useMemo(()=>products.map(p=>({product_id:p.id,quantity:Number(qty[p.id]||0)})).filter(x=>x.quantity>0),[products,qty])
  const localDemoTotal = selected.reduce((sum,x)=>sum + x.quantity * ({1:50,2:80,3:75,4:60,5:550,6:70,7:10,8:125,9:120,10:100}[x.product_id]||0),0)

  async function calculate(){
    if(!selected.length){setQuote(null);return}
    if(!supabase){setQuote({subtotal:localDemoTotal,bonus:0,total:localDemoTotal,demo:true});return}
    const {data,error}=await supabase.rpc('calculate_quote',{items:selected})
    if(error){setMessage(error.message);return}
    setQuote(data)
  }
  async function login(e){
    e.preventDefault(); setMessage('')
    if(!supabase){setMessage('Nejdřív nastav Supabase v .env.local.');return}
    const email=e.currentTarget.email.value, password=e.currentTarget.password.value
    const {error}=await supabase.auth.signInWithPassword({email,password})
    if(error)setMessage(error.message); else setAdmin(true)
  }
  async function logout(){await supabase?.auth.signOut();setAdmin(false);setSession(null)}

  return <div className="app">
    <header className="topbar"><div className="brand"><img src={LOGO}/><div><b>POINTO LLC</b><span>PAWNSHOP</span></div></div><div className="top-actions"><button className="ghost" onClick={()=>setAdmin(v=>!v)}>{admin?<><Calculator/> Veřejný kalkulátor</>:<><LogIn/> Administrace</>}</button>{admin&&session&&<button className="ghost" onClick={logout}><LogOut/> Odhlásit</button>}</div></header>

    {admin ? <Admin products={products} reload={loadProducts} session={session} login={login} message={message} setMessage={setMessage}/> : <Public products={products} qty={qty} setQty={setQty} calculate={calculate} quote={quote} loading={loading} message={message} selected={selected}/>} 
    <footer>© {new Date().getFullYear()} POINTO LLC · VŠE MÁ HODNOTU · Los Santos</footer>
  </div>
}

function Public({products,qty,setQty,calculate,quote,loading,message,selected}){
 return <main className="public"><section className="hero"><div className="hero-copy"><div className="eyebrow">RYCHLÝ VÝKUP · FAIR CENY · DISKRÉTNÍ JEDNÁNÍ</div><h1>Co nepotřebujete,<br/><em>my vykoupíme.</em></h1><p>Vyberte věci a zadejte počet kusů. Kalkulátor vám okamžitě spočítá orientační výkupní částku.</p></div><img className="hero-logo" src={LOGO}/></section>
 <section className="panel"><div className="section-title"><div><span>VÝKUPNÍ KATALOG</span><h2>Vyberte položky</h2></div><div className="secure"><ShieldCheck/> Ceny jsou zákazníkům skryté</div></div>
 {loading?<div className="loading"><RefreshCw className="spin"/> Načítám katalog…</div>:<div className="grid">{products.map(p=><div className="product" key={p.id}><div className="product-art">{p.category?.slice(0,2).toUpperCase()}</div><div className="product-info"><b>{p.name}</b><span>{p.category}</span></div><input type="number" min="0" max="999" value={qty[p.id]||''} placeholder="0" onChange={e=>setQty({...qty,[p.id]:Math.max(0,Math.min(999,Number(e.target.value)||0))})}/></div>)}</div>}
 <button className="calculate" onClick={calculate}><Calculator/> Spočítat výkup <span>{selected.length?`${selected.reduce((a,b)=>a+b.quantity,0)} ks`:''}</span></button>
 {message&&<div className="notice">{message}</div>}
 {quote&&<div className="quote"><div><span>ORIENTAČNÍ VÝKUP</span><strong>{Number(quote.total).toLocaleString('cs-CZ')} $</strong></div>{Number(quote.bonus)>0&&<div className="bonus"><Sparkles/> Bonus +{Number(quote.bonus).toLocaleString('cs-CZ')} $</div>}<small>Finální cena je potvrzena při osobním převzetí zboží. {quote.demo?'Demo režim — po připojení Supabase se ceny počítají z databáze.':''}</small></div>}
 </section></main>
}

function Admin({products,reload,session,login,message,setMessage}){
 const [form,setForm]=useState({name:'',category:'',unit_price:'',sort_order:0,active:true})
 const [bonus,setBonus]=useState({threshold:'1000',bonus_type:'percent',bonus_value:'5'})
 const [saving,setSaving]=useState(false)
 if(!session) return <main className="admin-login"><div className="login-card"><img src={LOGO}/><h2>Administrace</h2><p>Přihlášení pro správu výkupního katalogu.</p><form onSubmit={login}><input name="email" type="email" placeholder="E-mail" required/><input name="password" type="password" placeholder="Heslo" required/><button className="calculate"><LogIn/> Přihlásit se</button></form>{message&&<div className="notice">{message}</div>}</div></main>
 async function addProduct(e){e.preventDefault();if(!supabase)return;setSaving(true);const {error}=await supabase.from('products').insert({...form,unit_price:Number(form.unit_price),sort_order:Number(form.sort_order)});setSaving(false);if(error)setMessage(error.message);else{setForm({name:'',category:'',unit_price:'',sort_order:0,active:true});reload()}}
 async function deleteProduct(id){if(!confirm('Opravdu smazat položku?'))return;const {error}=await supabase.from('products').delete().eq('id',id);if(error)setMessage(error.message);else reload()}
 async function addBonus(e){e.preventDefault();const {error}=await supabase.from('bonuses').insert({threshold:Number(bonus.threshold),bonus_type:bonus.bonus_type,bonus_value:Number(bonus.bonus_value),active:true});if(error)setMessage(error.message);else setMessage('Bonus uložen.')}
 return <main className="admin"><div className="admin-head"><div><span>CONTROL PANEL</span><h1>Správa výkupu</h1></div><div className="admin-status"><ShieldCheck/> Přihlášen</div></div>
 <div className="admin-grid"><section className="panel"><div className="section-title"><div><span>CATALOG</span><h2>Nový produkt</h2></div><Settings/></div><form className="admin-form" onSubmit={addProduct}><input placeholder="Název produktu" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><input placeholder="Kategorie" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/><input type="number" min="0" placeholder="Výkupní cena / ks" value={form.unit_price} onChange={e=>setForm({...form,unit_price:e.target.value})} required/><input type="number" placeholder="Pořadí" value={form.sort_order} onChange={e=>setForm({...form,sort_order:e.target.value})}/><label><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Aktivní pro zákazníky</label><button className="calculate" disabled={saving}><Save/> {saving?'Ukládám…':'Přidat produkt'}</button></form></section>
 <section className="panel"><div className="section-title"><div><span>BONUSY</span><h2>Bonus za vyšší výkup</h2></div><Sparkles/></div><form className="admin-form" onSubmit={addBonus}><input type="number" min="0" placeholder="Prahová částka" value={bonus.threshold} onChange={e=>setBonus({...bonus,threshold:e.target.value})}/><select value={bonus.bonus_type} onChange={e=>setBonus({...bonus,bonus_type:e.target.value})}><option value="percent">Procenta</option><option value="fixed">Pevná částka</option></select><input type="number" min="0" step="0.01" placeholder="Hodnota bonusu" value={bonus.bonus_value} onChange={e=>setBonus({...bonus,bonus_value:e.target.value})}/><button className="calculate"><Plus/> Uložit bonus</button></form><p className="hint">Např. 1 000 $ → +5 %. Kalkulátor použije nejvyšší aktivní dosažený práh.</p></section></div>
 <section className="panel"><div className="section-title"><div><span>PRODUCTS</span><h2>Aktuální katalog</h2></div><button className="ghost" onClick={reload}><RefreshCw/> Obnovit</button></div><div className="table">{products.map(p=><div className="row" key={p.id}><div><b>{p.name}</b><span>{p.category}</span></div><strong>{Number(p.unit_price??0).toLocaleString('cs-CZ')} $</strong><span className={p.active?'active':'inactive'}>{p.active?'AKTIVNÍ':'SKRYTÉ'}</span><button className="icon" onClick={()=>deleteProduct(p.id)}><Trash2/></button></div>)}</div></section>
 {message&&<div className="notice">{message}</div>}</main>
}

createRoot(document.getElementById('root')).render(<App/>)
