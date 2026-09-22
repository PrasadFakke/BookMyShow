const API_URL = 'http://localhost:3000/api';

// ---------- ELEMENTS ----------
const loginPage   = document.getElementById('loginPage');
const dashboard   = document.getElementById('dashboardPage');
const loginForm   = document.getElementById('loginForm');
const bookForm    = document.getElementById('bookForm');
const logoutBtn   = document.getElementById('logoutBtn');
const fetchReport = document.getElementById('fetchReport');

const loginError = document.getElementById('loginError');
const bookError  = document.getElementById('bookError');

const moviesList      = document.getElementById('moviesList');
const myBookings      = document.getElementById('myBookings');
const schedulesList   = document.getElementById('schedulesList');
const bookingsReport  = document.getElementById('bookingsReport');

// ---------- AUTH HELPERS ----------
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
    };
}
function getUserIdFromToken() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.id;
    } catch (e) { return null; }
}

// ---------- PAGE SWITCH ----------
function showLogin() {
    loginPage.classList.remove('hidden');
    dashboard.classList.add('hidden');
}
function showDashboard() {
    loginPage.classList.add('hidden');
    dashboard.classList.remove('hidden');
    loadMovies();
    loadMyBookings();
    loadSchedules();
}

// ---------- LOGIN ----------
loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('token', data.token);
            checkAuth();
        } else {
            loginError.textContent = data.message || 'Login failed';
        }
    } catch (err) {
        loginError.textContent = 'Server error';
    }
});

// ---------- LOGOUT ----------
logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        showLogin();
        loginForm.reset();
        loginError.textContent = '';
    }
});

// ---------- CHECK AUTH ----------
function checkAuth() {
    if (localStorage.getItem('token') && getUserIdFromToken()) {
        showDashboard();
    } else {
        showLogin();
    }
}

// ---------- MOVIES ----------
const imageMap = {
  "Inception": "Inception.jpg",
  "The Matrix": "Matrix.jpg",
  "Interstellar": "Interstellar.jpg"
};

async function loadMovies() {
  try {
    const res = await fetch(`${API_URL}/movies`, { headers: getAuthHeaders() });
    const movies = await res.json();

    moviesList.innerHTML = movies.map(m => `
      <div class="movie-card">
        <img src="${imageMap[m.Mo_Title]}" alt="${m.Mo_Title}">
        <h3>${m.Mo_Title}</h3>
        <p>${m.Mo_Desc} | ⭐ ${m.Mo_Stars} | ⏱ ${m.Duration} min</p>
      </div>
    `).join('');
  } catch (err) {
    moviesList.innerHTML = '<li>Error loading movies</li>';
  }
}


// Tab switching logic
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Remove active from all
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    // Add to clicked
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});




// ---------- MY BOOKINGS ----------
async function loadMyBookings() {
    const cuId = getUserIdFromToken();
    if (!cuId) return;
    try {
        const res = await fetch(`${API_URL}/bookings/customer/${cuId}`, { headers: getAuthHeaders() });
        const bookings = await res.json();
        myBookings.innerHTML = bookings.length ? bookings.map(b => `
            <li>
                Booking ID: ${b.Bo_ID} | Schedule: ${b.Sch_ID} | Seats: ${b.Seats_Booked}
                <br><small>${new Date(b.Booking_Date).toLocaleString()}</small>
                <button class="deleteBtn" onclick="deleteBooking(${b.Bo_ID})">Delete</button>
            </li>
        `).join('') : '<li>No bookings yet</li>';
    } catch (err) {
        myBookings.innerHTML = '<li>Error loading bookings</li>';
    }
}

// ---------- DELETE BOOKING ----------
window.deleteBooking = async (boId) => {
    if (!confirm('Delete this booking?')) return;
    const cuId = getUserIdFromToken();
    try {
        const res = await fetch(`${API_URL}/bookings/${boId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (res.ok) {
            alert('Booking deleted');
            loadMyBookings();
        } else {
            const err = await res.json();
            alert(err.message || 'Delete failed');
        }
    } catch (err) {
        alert('Server error');
    }
};

async function loadSchedules() {
    try {
        const res = await fetch(`${API_URL}/schedules`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Failed to load');
        const schedules = await res.json();

        if (schedules.length === 0) {
            schedulesList.innerHTML = '<li style="text-align:center; color:#777;">No shows available</li>';
            return;
        }

        schedulesList.innerHTML = schedules.map(s => {
            const seatsLeft = s.seatsLeft ?? 0;
            const isFull = seatsLeft <= 0;
            const canBook = seatsLeft > 0;

            return `
                <li style="display:flex; justify-content:space-between; align-items:center; background:#f9f9f9; padding:14px; margin:8px 0; border-radius:8px; border-left:4px solid ${isFull ? '#dc3545' : '#28a745'};">
                    <div>
                       <strong>${s.movieTitle}</strong> at <strong>${s.cinemaName}</strong>
<small> (${s.cinemaLocation}, ${s.cinemaName.split(' ')[0]})</small><br>
                        <small style="color:#555;">
                            Cinema ${s.cinemaId} • ${new Date(s.Show_Time).toLocaleString()} • ₹${s.Price}
                        </small><br>
                        <strong style="color:${isFull ? '#e74c3c' : '#27ae60'}; font-size:1em;">
                            ${isFull ? 'SOLD OUT' : `${seatsLeft} / ${s.capacity} seats available`}
                        </strong>
                    </div>
                    <button 
                        ${!canBook ? 'disabled style="background:#ccc; cursor:not-allowed;"' : ''}
                        onclick="selectSchedule(${s.Sch_ID}, ${seatsLeft}, ${s.Price})"
                        style="padding:8px 16px; font-weight:bold; border-radius:6px;">
                        ${isFull ? 'Full' : 'Book Now'}
                    </button>
                </li>
            `;
        }).join('');
    } catch (err) {
        console.error(err);
        schedulesList.innerHTML = '<li style="color:red; text-align:center;">Error loading shows</li>';
    }
}
window.selectSchedule = (schId, maxSeats, price) => {
    const scheduleInput = document.getElementById('scheduleId');
    const seatsInput = document.getElementById('seats');

    scheduleInput.value = schId;
    seatsInput.value = '';
    seatsInput.focus();
    seatsInput.setAttribute('max', maxSeats);
    seatsInput.setAttribute('placeholder', `Max: ${maxSeats} seats`);
    seatsInput.setAttribute('min', '1');

    // Store price in a hidden field or data attribute
    const bookForm = document.getElementById('bookForm');
    bookForm.dataset.price = price;

    document.getElementById('bookError').textContent = '';
};

bookForm.addEventListener('submit', async e => {
    e.preventDefault();

    const schId = parseInt(document.getElementById('scheduleId').value);
    const seats = parseInt(document.getElementById('seats').value);
    const mode = document.getElementById('paymentMode').value;
    const cuId = getUserIdFromToken();

    if (!cuId) { alert('Session expired'); showLogin(); return; }
    if (!schId || !seats || !mode) {
        bookError.textContent = 'Please fill all fields';
        return;
    }

    // === VALIDATE SCHEDULE EXISTS ===
    try {
        const res = await fetch(`${API_URL}/schedules`, { headers: getAuthHeaders() });
        const schedules = await res.json();

        const schedule = schedules.find(s => s.Sch_ID === schId);
        if (!schedule) {
            bookError.textContent = `Schedule ID ${schId} not found!`;
            return;
        }

        const maxSeats = schedule.seatsLeft;
        const price = schedule.Price;

        if (seats > maxSeats) {
            bookError.textContent = `Only ${maxSeats} seats available!`;
            return;
        }

        const total = seats * price;

        if (!confirm(`Pay ₹${total} (${seats} × ₹${price}) via ${mode.toUpperCase()}?`)) return;

        // === BOOK NOW ===
        const bookRes = await fetch(`${API_URL}/bookings`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ Cu_ID: cuId, Sch_ID: schId, Seats_Booked: seats })
        });
        const data = await bookRes.json();

        if (bookRes.ok) {
            alert(`Booking successful! ID: ${data.Bo_ID}\nTotal: ₹${total}`);
            bookForm.reset();
            bookError.textContent = '';
            loadMyBookings();
            loadSchedules();
        } else {
            bookError.textContent = data.message || 'Booking failed';
        }
    } catch (err) {
        bookError.textContent = 'Server error';
    }
});


// ---------- REPORT ----------
fetchReport.addEventListener('click', async () => {
    try {
        const res = await fetch(`${API_URL}/bookings/report`, { headers: getAuthHeaders() });
        const report = await res.json();

        // Check if report is empty
        const hasBookings = Object.keys(report).length > 0;

        if (!hasBookings) {
            bookingsReport.innerHTML = `
                <li style="text-align:center; color:#777; font-style:italic; padding:20px; background:#f8f9fa; border-radius:8px;">
                    No booking records found.
                </li>
            `;
            return;
        }

        // Show report with customer name
        bookingsReport.innerHTML = Object.entries(report).map(([id, info]) => `
            <li style="background:#e8f5e9; padding:12px; margin:6px 0; border-radius:6px; border-left:4px solid #28a745;">
                <strong>${info.name}</strong> (Customer ID: ${id}) 
                → <strong style="color:#1b5e20;">${info.count} booking(s)</strong>
            </li>
        `).join('');

    } catch (err) {
        console.error(err);
        bookingsReport.innerHTML = `
            <li style="color:red; text-align:center; padding:15px; background:#ffebee; border-radius:6px;">
                Error loading report
            </li>
        `;
    }
});


// Add this at the end of script.js
document.getElementById('scheduleId').addEventListener('input', () => {
    document.getElementById('bookError').textContent = '';
});




// ---------- START ----------

checkAuth();







