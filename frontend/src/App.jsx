import React, { useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate, useParams } from 'react-router-dom'
import { api, setToken, getToken } from './services/api.js'

function Navbar({ user, onLogout }){
  return (
    <nav style={{display:'flex', gap:12, padding:12, borderBottom:'1px solid #ddd'}}>
      <Link to='/'>Events</Link>
      {user && <Link to='/my'>My Tickets</Link>}
      {user?.role === 'organizer' && <Link to='/organizer'>Organizer</Link>}
      <div style={{marginLeft:'auto'}}>
        {user ? (
          <button onClick={onLogout}>Logout ({user.email})</button>
        ) : (
          <>
            <Link to='/login'>Login</Link>{" | "}
            <Link to='/register'>Register</Link>
          </>
        )}
      </div>
    </nav>
  )
}

function Events(){
  const [events,setEvents]=useState([])
  useEffect(()=>{ api.get('/events').then(setEvents) },[])
  return (
    <div style={{padding:16}}>
      <h2>Upcoming Events</h2>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12}}>
        {events.map(e=> (
          <div key={e._id} style={{border:'1px solid #eee', padding:12, borderRadius:8}}>
            <h3>{e.title}</h3>
            <p>{new Date(e.date).toLocaleString()}</p>
            <p>Venue: {e.venue}</p>
            <p>₹ {e.price} | Left: {e.availableTickets}</p>
            <Link to={`/event/${e._id}`}>View</Link>
          </div>
        ))}
      </div>
    </div>
  )
}

function EventDetails(){
  const { id } = useParams()
  const [event,setEvent]=useState(null)
  const [quantity,setQuantity]=useState(1)
  const nav = useNavigate()
  useEffect(()=>{ api.get(`/events/${id}`).then(setEvent) },[id])
  const book = async ()=>{
    const res = await api.post('/bookings', { eventId: id, quantity })
    const booking = res.booking
    // create mock payment and confirm immediately
    await api.post('/payments/create-intent', { bookingId: booking._id })
    await api.post('/payments/confirm', { bookingId: booking._id })
    alert('Booking paid (mock). Check My Tickets.')
    nav('/my')
  }
  if(!event) return <div style={{padding:16}}>Loading...</div>
  return (
    <div style={{padding:16}}>
      <h2>{event.title}</h2>
      <p>{event.description}</p>
      <p><b>Date:</b> {new Date(event.date).toLocaleString()}</p>
      <p><b>Venue:</b> {event.venue}</p>
      <p><b>Price:</b> ₹ {event.price}</p>
      <p><b>Available:</b> {event.availableTickets}</p>
      <input type='number' min='1' value={quantity} onChange={e=>setQuantity(parseInt(e.target.value||1))} />
      <button onClick={book} style={{marginLeft:8}}>Book (Mock Pay)</button>
    </div>
  )
}

function Login({ setUser }){
  const nav = useNavigate()
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const submit = async (e)=>{
    e.preventDefault()
    const res = await api.post('/auth/login', { email, password })
    setToken(res.token)
    const me = await api.get('/auth/me')
    setUser(me.user)
    nav('/')
  }
  return (
    <form onSubmit={submit} style={{padding:16, display:'grid', gap:8, maxWidth:320}}>
      <h2>Login</h2>
      <input placeholder='Email' value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder='Password' type='password' value={password} onChange={e=>setPassword(e.target.value)} />
      <button>Login</button>
    </form>
  )
}

function Register(){
  const nav = useNavigate()
  const [form,setForm]=useState({ name:'', email:'', password:'', role:'user' })
  const submit = async (e)=>{
    e.preventDefault()
    await api.post('/auth/register', form)
    alert('Registered. Please login.')
    nav('/login')
  }
  return (
    <form onSubmit={submit} style={{padding:16, display:'grid', gap:8, maxWidth:360}}>
      <h2>Register</h2>
      <input placeholder='Name' value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
      <input placeholder='Email' value={form.email} onChange={e=>setForm({...form, email:e.target.value})} />
      <input placeholder='Password' type='password' value={form.password} onChange={e=>setForm({...form, password:e.target.value})} />
      <select value={form.role} onChange={e=>setForm({...form, role:e.target.value})}>
        <option value="user">User</option>
        <option value="organizer">Organizer</option>
      </select>
      <button>Create account</button>
    </form>
  )
}

function MyTickets(){
  const [items,setItems]=useState([])
  useEffect(()=>{ api.get('/bookings/me').then(setItems) },[])
  return (
    <div style={{padding:16}}>
      <h2>My Tickets</h2>
      {items.map(b => (
        <div key={b._id} style={{border:'1px solid #eee', padding:12, marginBottom:8, borderRadius:8}}>
          <div><b>Event:</b> {b.eventId?.title}</div>
          <div><b>Qty:</b> {b.quantity} | <b>Status:</b> {b.status} | <b>Amount:</b> ₹ {b.totalAmount}</div>
          <div><b>Codes:</b> {b.ticketCodes.join(", ")}</div>
        </div>
      ))}
    </div>
  )
}

function Organizer(){
  const [events,setEvents]=useState([])
  const [form,setForm]=useState({ title:'', description:'', date:'', venue:'', totalTickets:100, price:500 })
  const refresh = ()=> api.get('/events').then(setEvents)
  useEffect(refresh,[])
  const create = async (e)=>{
    e.preventDefault()
    const body = { ...form, totalTickets: Number(form.totalTickets), price: Number(form.price) }
    await api.post('/events', body)
    setForm({ title:'', description:'', date:'', venue:'', totalTickets:100, price:500 })
    refresh()
  }
  return (
    <div style={{padding:16}}>
      <h2>Organizer</h2>
      <form onSubmit={create} style={{display:'grid', gap:8, maxWidth:420}}>
        <input placeholder='Title' value={form.title} onChange={e=>setForm({...form, title:e.target.value})} />
        <textarea placeholder='Description' value={form.description} onChange={e=>setForm({...form, description:e.target.value})} />
        <input type='datetime-local' value={form.date} onChange={e=>setForm({...form, date:e.target.value})} />
        <input placeholder='Venue' value={form.venue} onChange={e=>setForm({...form, venue:e.target.value})} />
        <input type='number' placeholder='Total Tickets' value={form.totalTickets} onChange={e=>setForm({...form, totalTickets:e.target.value})} />
        <input type='number' placeholder='Price' value={form.price} onChange={e=>setForm({...form, price:e.target.value})} />
        <button>Create Event</button>
      </form>
      <h3 style={{marginTop:16}}>My/All Events</h3>
      <ul>
        {events.map(e => <li key={e._id}>{e.title} — {new Date(e.date).toLocaleString()}</li>)}
      </ul>
    </div>
  )
}

export default function App(){
  const [user,setUser]=useState(null)
  const nav = useNavigate()
  useEffect(()=>{
    const t = getToken()
    if (t) {
      api.get('/auth/me').then(res => setUser(res.user)).catch(()=>{})
    }
  },[])
  const logout = ()=>{
    setToken(null)
    setUser(null)
    nav('/')
  }
  return (
    <div>
      <Navbar user={user} onLogout={logout} />
      <Routes>
        <Route path='/' element={<Events/>} />
        <Route path='/event/:id' element={<EventDetails/>} />
        <Route path='/login' element={<Login setUser={setUser} />} />
        <Route path='/register' element={<Register/>} />
        <Route path='/my' element={<MyTickets/>} />
        <Route path='/organizer' element={<Organizer/>} />
      </Routes>
    </div>
  )
}
