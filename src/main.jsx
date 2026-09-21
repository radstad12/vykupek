import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LogIn, LogOut, Plus, Trash2, Save, Calculator, ShieldCheck,
  Sparkles, Settings, RefreshCw, Pencil, X, Upload, Database
} from 'lucide-react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth'
import {
  collection, doc, getDocs, onSnapshot, query, orderBy,
  writeBatch, addDoc, updateDoc, deleteDoc, setDoc
} from 'firebase/firestore'
import {
  ref, uploadBytes, getDownloadURL
} from 'firebase/storage'
import { auth, db, storage } from './firebase'
import './styles.css'
import INITIAL_PRODUCTS from './initial-products.json'
import INITIAL_CATEGORIES from './initial-categories.json'

const LOGO = `${import.meta.env.BASE_URL}logo.png`

const DEFAULT_CATEGORIES = [
  { id:'cennosti', name:'Cennosti', icon:'💎' },
  { id:'zbrane', name:'Zbraně', icon:'🔫' },
  { id:'zahradnictvi', name:'Zahradnictví', icon:'🌿' },
  { id:'chemikalie', name:'Chemikálie', icon:'⚗️' },
  { id:'naradi', name:'Nářadí', icon:'🛠️' },
  { id:'karty', name:'Karty', icon:'🃏' },
  { id:'skryte', name:'Skryté', icon:'⭕' }
]

function normalizeProduct(p, index = 0) {
  return {
    id: String(p.id ?? crypto.randomUUID()),
    name: String(p.name ?? ''),
    category: String(p.category ?? 'Ostatní'),
    unit_price: Number(p.unit_price ?? p.price ?? 0),
    sale_price: p.sale_price === '' || p.sale_price == null ? null : Number(p.sale_price),
    image_url: p.image_url || p.image || '',
    active: p.active !== false,
    admin_item: p.admin_item === true,
    sort_order: Number(p.sort_order ?? index)
  }
}

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then(r => r.blob())
}

async function uploadProductImage(productId, image) {
  if (!image) return ''
  let blob = image
  if (typeof image === 'string') {
    if (!image.startsWith('data:')) return image
    blob = await dataUrlToBlob(image)
  }
  const extension = (blob.type || '').includes('jpeg') || (blob.type || '').includes('jpg') ? 'jpg' : 'png'
  const imageRef = ref(storage, `products/${productId}.${extension}`)
  await uploadBytes(imageRef, blob, { contentType: blob.type || 'image/png' })
  return getDownloadURL(imageRef)
}

function publicProduct(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    unit_price: Number(p.unit_price ?? 0),
    image_url: p.image_url || '',
    active: p.active !== false,
    admin_item: p.admin_item === true,
    sort_order: Number(p.sort_order ?? 0)
  }
}

async function saveProduct(product) {
  const normalized = normalizeProduct(product)
  const image_url = await uploadProductImage(normalized.id, normalized.image_url)
  const full = { ...normalized, image_url }
  const batch = writeBatch(db)
  batch.set(doc(db, 'products', normalized.id), {
    ...full,
    updated_at: new Date().toISOString()
  }, { merge: true })
  batch.set(doc(db, 'products_public', normalized.id), publicProduct(full), { merge: true })
  await batch.commit()
  return full
}

async function removeProduct(id) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'products', id))
  batch.delete(doc(db, 'products_public', id))
  await batch.commit()
}

async function migrateLocalStorageIfNeeded(setMessage) {
  const existing = await getDocs(collection(db, 'products'))
  if (!existing.empty) return { migrated: false, count: existing.size }

  const rawProducts = localStorage.getItem('pointo_products_v2')
  const rawCategories = localStorage.getItem('pointo_categories_v1')
  if (!rawProducts && !rawCategories) return { migrated: false, count: 0 }

  let products = INITIAL_PRODUCTS
  let categories = INITIAL_CATEGORIES?.length ? INITIAL_CATEGORIES : DEFAULT_CATEGORIES
  try {
    if (rawProducts) products = JSON.parse(rawProducts)
  } catch {}
  try {
    if (rawCategories) categories = JSON.parse(rawCategories)
  } catch {}

  const categorySnapshot = await getDocs(collection(db, 'categories'))
  if (categorySnapshot.empty) {
    for (const c of categories) {
      const id = String(c.id ?? crypto.randomUUID())
      await setDoc(doc(db, 'categories', id), {
        id, name: String(c.name ?? ''), icon: String(c.icon ?? '📦')
      }, { merge: true })
    }
  }

  for (const c of categories) {
    const id = String(c.id ?? crypto.randomUUID())
    await setDoc(doc(db, 'categories', id), {
      id, name: String(c.name ?? ''), icon: String(c.icon ?? '📦')
    }, { merge: true })
  }

  let count = 0
  for (let i = 0; i < products.length; i++) {
    const p = normalizeProduct(products[i], i)
    if (!p.name) continue
    try {
      await saveProduct(p)
      count++
    } catch (err) {
      console.error('Migration image/product error', p.id, err)
      const fallback = { ...p, image_url: String(p.image_url || '').startsWith('data:') ? '' : p.image_url }
      await saveProduct(fallback)
      count++
    }
  }

  localStorage.setItem('pointo_firebase_migrated_v1', new Date().toISOString())
  setMessage(`Katalog převeden do Firebase: ${count} produktů.`)
  return { migrated: true, count }
}

function App() {
  const [session, setSession] = useState(null)
  const [adminMode, setAdminMode] = useState(false)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [bonuses, setBonuses] = useState([])
  const [qty, setQty] = useState({})
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [migrationDone, setMigrationDone] = useState(false)

  useEffect(() => onAuthStateChanged(auth, setSession), [])

  useEffect(() => {
    const productCollection = session ? 'products' : 'products_public'
    const unsubProducts = onSnapshot(
      query(collection(db, productCollection), orderBy('sort_order')),
      snap => {
        setProducts(snap.docs.map(d => normalizeProduct({ id:d.id, ...d.data() })))
        setLoading(false)
      },
      err => { console.error(err); setMessage('Firebase: nepodařilo se načíst katalog.'); setLoading(false) }
    )
    const unsubCategories = onSnapshot(
      collection(db, 'categories'),
      snap => setCategories(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
      () => {}
    )
    const unsubBonuses = onSnapshot(
      collection(db, 'bonuses'),
      snap => setBonuses(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
      () => {}
    )
    return () => { unsubProducts(); unsubCategories(); unsubBonuses() }
  }, [session])

  useEffect(() => {
    if (!session || migrationDone) return
    migrateLocalStorageIfNeeded(setMessage)
      .then(() => setMigrationDone(true))
      .catch(err => { console.error(err); setMessage(`Migrace selhala: ${err.message}`); setMigrationDone(true) })
  }, [session, migrationDone])

  const publicProducts = useMemo(
    () => products.filter(p => p.active && !p.admin_item),
    [products]
  )

  const selected = useMemo(
    () => publicProducts
      .map(p => ({ product_id:p.id, quantity:Number(qty[p.id] || 0), price:Number(p.unit_price || 0) }))
      .filter(x => x.quantity > 0),
    [publicProducts, qty]
  )

  function calculate() {
    if (!selected.length) { setQuote(null); return }
    const subtotal = selected.reduce((sum, x) => sum + x.quantity * x.price, 0)
    const activeBonuses = bonuses
      .filter(b => b.active !== false && Number(b.threshold) <= subtotal)
      .sort((a,b) => Number(b.threshold)-Number(a.threshold) || Number(b.priority||0)-Number(a.priority||0))
    const b = activeBonuses[0]
    let bonus = 0
    if (b) bonus = b.bonus_type === 'percent'
      ? Math.round(subtotal * Number(b.bonus_value) / 100 * 100) / 100
      : Number(b.bonus_value)
    setQuote({ subtotal, bonus, total: subtotal + bonus })
  }

  async function login(e) {
    e.preventDefault()
    setMessage('')
    const email = e.currentTarget.email.value.trim()
    const password = e.currentTarget.password.value
    try {
      await signInWithEmailAndPassword(auth, email, password)
      setAdminMode(true)
      setMessage('')
    } catch (err) {
      setMessage(err.message)
    }
  }

  async function logout() {
    await signOut(auth)
    setAdminMode(false)
    setMessage('')
  }

  return <div className="app">
    <header className="topbar">
      <div className="brand">
        <img src={LOGO}/>
        <div><b>POINTO LLC</b><span>PAWNSHOP</span></div>
      </div>
      <div className="top-actions">
        <button className="ghost" onClick={() => setAdminMode(v => !v)}>
          {adminMode ? <><Calculator/> Veřejný katalog</> : <><LogIn/> Administrace</>}
        </button>
        {adminMode && session && <button className="ghost" onClick={logout}><LogOut/> Odhlásit</button>}
      </div>
    </header>

    {adminMode
      ? <Admin session={session} login={login} products={products} categories={categories} reloadMessage={setMessage} message={message}/>
      : <Public products={publicProducts} qty={qty} setQty={setQty} calculate={calculate} quote={quote} loading={loading} message={message} selected={selected}/>
    }
    <footer>© {new Date().getFullYear()} POINTO LLC · VŠE MÁ HODNOTU · Los Santos</footer>
  </div>
}

function Public({products, qty, setQty, calculate, quote, loading, message, selected}) {
  return <main className="public">
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow">RYCHLÝ VÝKUP · FAIR CENY · DISKRÉTNÍ JEDNÁNÍ</div>
        <h1>Co nepotřebujete,<br/><em>my vykoupíme.</em></h1>
        <p>Vyberte věci a zadejte počet kusů. Kalkulátor vám okamžitě spočítá orientační výkupní částku.</p>
      </div>
      <img className="hero-logo" src={LOGO}/>
    </section>
    <section className="panel">
      <div className="section-title">
        <div><span>VÝKUPNÍ KATALOG</span><h2>Vyberte položky</h2></div>
        <div className="secure"><ShieldCheck/> Ceny jsou zákazníkům skryté</div>
      </div>
      {loading ? <div className="loading"><RefreshCw className="spin"/> Načítám katalog…</div> :
      <div className="grid">{products.map(p =>
        <div className="product" key={p.id}>
          <div className="product-art">
            {p.image_url ? <img src={p.image_url} alt="" loading="lazy"/> : p.category?.slice(0,2).toUpperCase()}
          </div>
          <div className="product-info"><b>{p.name}</b><span>{p.category}</span></div>
          <input type="number" min="0" max="999" value={qty[p.id]||''} placeholder="0"
            onChange={e => setQty({...qty,[p.id]:Math.max(0,Math.min(999,Number(e.target.value)||0))})}/>
        </div>
      )}</div>}
      <button className="calculate" onClick={calculate}><Calculator/> Spočítat výkup <span>{selected.length ? `${selected.reduce((a,b)=>a+b.quantity,0)} ks` : ''}</span></button>
      {message && <div className="notice">{message}</div>}
      {quote && <div className="quote">
        <div><span>ORIENTAČNÍ VÝKUP</span><strong>{Number(quote.total).toLocaleString('cs-CZ')} $</strong></div>
        {Number(quote.bonus)>0 && <div className="bonus"><Sparkles/> Bonus +{Number(quote.bonus).toLocaleString('cs-CZ')} $</div>}
        <small>Finální cena je potvrzena při osobním převzetí zboží.</small>
      </div>}
    </section>
  </main>
}

function Admin({session, login, products, categories, reloadMessage, message}) {
  const [form, setForm] = useState({
    id:null, name:'', category:'', unit_price:'', sale_price:'', sort_order:0,
    active:true, admin_item:false, image_url:''
  })
  const [bonus, setBonus] = useState({threshold:'1000', bonus_type:'percent', bonus_value:'5'})
  const [categoryForm, setCategoryForm] = useState({name:'',icon:'📦'})
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState(null)

  if (!session) return <main className="admin-login"><div className="login-card">
    <img src={LOGO}/><h2>Administrace</h2>
    <p>Přihlášení pro správu výkupního katalogu.</p>
    <form onSubmit={login}>
      <input name="email" type="email" placeholder="E-mail" required/>
      <input name="password" type="password" placeholder="Heslo" required/>
      <button className="calculate"><LogIn/> Přihlásit se</button>
    </form>
    {message && <div className="notice">{message}</div>}
  </div></main>

  async function addOrUpdateProduct(e) {
    e.preventDefault()
    setSaving(true)
    reloadMessage('')
    try {
      const id = form.id || crypto.randomUUID()
      let image = form.image_url
      if (imageFile) {
        image = await uploadProductImage(id, imageFile)
      }
      const p = normalizeProduct({...form, id, image_url:image})
      await saveProduct(p)
      setForm({id:null,name:'',category:categories[0]?.name||'',unit_price:'',sale_price:'',sort_order:products.length,active:true,admin_item:false,image_url:''})
      setImageFile(null)
      document.querySelector('#product-image')?.form?.reset()
      reloadMessage(form.id ? 'Produkt upraven.' : 'Produkt přidán do Firebase.')
    } catch (err) {
      console.error(err)
      reloadMessage(`Chyba: ${err.message}`)
    } finally { setSaving(false) }
  }

  function editProduct(p) {
    setForm({
      id:p.id, name:p.name, category:p.category || '', unit_price:p.unit_price ?? '',
      sale_price:p.sale_price ?? '', sort_order:p.sort_order ?? 0,
      active:p.active !== false, admin_item:p.admin_item === true, image_url:p.image_url || ''
    })
    setImageFile(null)
    window.scrollTo({top:0, behavior:'smooth'})
  }

  async function deleteProduct(id) {
    if (!confirm('Opravdu smazat položku?')) return
    try { await removeProduct(id); reloadMessage('Produkt smazán.') }
    catch (err) { reloadMessage(`Chyba: ${err.message}`) }
  }

  async function addBonus(e) {
    e.preventDefault()
    try {
      await addDoc(collection(db,'bonuses'), {
        threshold:Number(bonus.threshold), bonus_type:bonus.bonus_type,
        bonus_value:Number(bonus.bonus_value), active:true, priority:0
      })
      reloadMessage('Bonus uložen.')
    } catch (err) { reloadMessage(`Chyba: ${err.message}`) }
  }

  async function addCategory(e) {
    e.preventDefault()
    const name=categoryForm.name.trim()
    if(!name)return
    const id=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || crypto.randomUUID()
    try {
      await setDoc(doc(db,'categories',id), {id,name,icon:categoryForm.icon||'📦'})
      setCategoryForm({name:'',icon:'📦'})
      reloadMessage('Kategorie uložena.')
    } catch(err) { reloadMessage(`Chyba: ${err.message}`) }
  }

  async function deleteCategory(id) {
    if(!confirm('Smazat kategorii?'))return
    try { await deleteDoc(doc(db,'categories',id)); reloadMessage('Kategorie smazána.') }
    catch(err){reloadMessage(`Chyba: ${err.message}`)}
  }

  return <main className="admin">
    <div className="admin-head">
      <div><span>CONTROL PANEL</span><h1>Správa výkupu</h1></div>
      <div className="admin-status"><ShieldCheck/> Firebase připojen</div>
    </div>

    <div className="admin-grid">
      <section className="panel">
        <div className="section-title"><div><span>CATALOG</span><h2>{form.id?'Upravit produkt':'Nový produkt'}</h2></div><Settings/></div>
        <form className="admin-form" onSubmit={addOrUpdateProduct}>
          <input placeholder="Název produktu" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/>
          <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
            <option value="">Kategorie</option>
            {categories.map(c=><option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
          </select>
          <input type="number" min="0" step="0.01" placeholder="Výkupní cena / ks" value={form.unit_price} onChange={e=>setForm({...form,unit_price:e.target.value})} required/>
          <input type="number" min="0" step="0.01" placeholder="Prodejní cena (interní)" value={form.sale_price} onChange={e=>setForm({...form,sale_price:e.target.value})}/>
          <input type="number" placeholder="Pořadí" value={form.sort_order} onChange={e=>setForm({...form,sort_order:e.target.value})}/>
          <label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Aktivní pro zákazníky</label>
          <label className="check"><input type="checkbox" checked={form.admin_item} onChange={e=>setForm({...form,admin_item:e.target.checked})}/> Jen pro administraci</label>
          <label className="file-label" htmlFor="product-image"><Upload/> Fotka produktu</label>
          <input id="product-image" type="file" accept="image/*" onChange={e=>setImageFile(e.target.files?.[0]||null)}/>
          {form.image_url && <img className="admin-preview" src={form.image_url} alt="Náhled"/>}
          <div className="form-actions">
            <button className="calculate" disabled={saving}><Save/> {saving?'Ukládám…':form.id?'Uložit změny':'Přidat produkt'}</button>
            {form.id && <button type="button" className="ghost" onClick={()=>setForm({id:null,name:'',category:categories[0]?.name||'',unit_price:'',sale_price:'',sort_order:products.length,active:true,admin_item:false,image_url:''})}><X/> Zrušit</button>}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-title"><div><span>CATEGORIES</span><h2>Kategorie</h2></div><Database/></div>
        <form className="admin-form" onSubmit={addCategory}>
          <input placeholder="Název kategorie" value={categoryForm.name} onChange={e=>setCategoryForm({...categoryForm,name:e.target.value})}/>
          <input placeholder="Ikona" value={categoryForm.icon} onChange={e=>setCategoryForm({...categoryForm,icon:e.target.value})}/>
          <button className="calculate"><Plus/> Přidat kategorii</button>
        </form>
        <div className="table">
          {categories.map(c=><div className="row" key={c.id}><div><b>{c.icon} {c.name}</b><span>{c.id}</span></div><button className="icon" onClick={()=>deleteCategory(c.id)}><Trash2/></button></div>)}
        </div>
      </section>
    </div>

    <section className="panel">
      <div className="section-title"><div><span>BONUSY</span><h2>Bonus za vyšší výkup</h2></div><Sparkles/></div>
      <form className="admin-form" onSubmit={addBonus}>
        <input type="number" min="0" placeholder="Prahová částka" value={bonus.threshold} onChange={e=>setBonus({...bonus,threshold:e.target.value})}/>
        <select value={bonus.bonus_type} onChange={e=>setBonus({...bonus,bonus_type:e.target.value})}><option value="percent">Procenta</option><option value="fixed">Pevná částka</option></select>
        <input type="number" min="0" step="0.01" placeholder="Hodnota bonusu" value={bonus.bonus_value} onChange={e=>setBonus({...bonus,bonus_value:e.target.value})}/>
        <button className="calculate"><Plus/> Uložit bonus</button>
      </form>
    </section>

    <section className="panel">
      <div className="section-title"><div><span>PRODUCTS · REALTIME</span><h2>Aktuální katalog</h2></div><span className="secure"><RefreshCw/> Aktualizuje se automaticky</span></div>
      <div className="table">
        {products.map(p=><div className="row" key={p.id}>
          <div className="row-main">
            {p.image_url && <img className="row-thumb" src={p.image_url} alt=""/>}
            <div><b>{p.name}</b><span>{p.category}{p.admin_item?' · ADMIN':''}</span></div>
          </div>
          <strong>{Number(p.unit_price??0).toLocaleString('cs-CZ')} $</strong>
          {p.sale_price != null && <span>{Number(p.sale_price).toLocaleString('cs-CZ')} $ prodej</span>}
          <span className={p.active?'active':'inactive'}>{p.active?'AKTIVNÍ':'SKRYTÉ'}</span>
          <button className="icon" onClick={()=>editProduct(p)}><Pencil/></button>
          <button className="icon" onClick={()=>deleteProduct(p.id)}><Trash2/></button>
        </div>)}
      </div>
    </section>

    {message && <div className="notice">{message}</div>}
  </main>
}

createRoot(document.getElementById('root')).render(<App/>)
