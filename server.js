// server.js – Backend (Node.js + Express + MongoDB)

const express   = require('express');
const mongoose  = require('mongoose');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const cors      = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;

app.use(express.json());
app.use(cors());
app.get("/", (req, res) => {
  res.send("🎬 Movie Booking Backend is Running!");
});

// ---------- CONNECT DB ----------
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('MongoDB Error:', err));

// ---------- SCHEMAS ----------
const customerSchema = new mongoose.Schema({
    Cu_ID: { type: Number, required: true, unique: true },
    Cu_Name: String, Cu_Address: String, Cu_Contact: String,
    Email: { type: String, unique: true, required: true },
    Password: String
});
const cinemaSchema = new mongoose.Schema({
    Ci_ID: { type: Number, required: true, unique: true },
    Ci_Name: String,
    Ci_Location: String,
    Ci_City: String
});

const movieSchema = new mongoose.Schema({
    Mo_ID: { type: Number, required: true, unique: true },
    Mo_Title: String, Mo_Desc: String, Mo_Stars: String, Duration: Number
});
const screenSchema = new mongoose.Schema({
    Screen_ID: { type: Number, required: true, unique: true },
    Ci_ID: Number, Screen_No: Number, Capacity: Number
});
const scheduleSchema = new mongoose.Schema({
    Sch_ID: { type: Number, required: true, unique: true },
    Mo_ID: Number, Screen_ID: Number,
    Show_Time: Date, Price: Number
});
const bookingSchema = new mongoose.Schema({
    Bo_ID: { type: Number, required: true, unique: true },
    Cu_ID: Number, Sch_ID: Number, Seats_Booked: Number,
    Booking_Date: { type: Date, default: Date.now }
});

const Customer = mongoose.model('Customer', customerSchema);
const Cinema = mongoose.model('Cinema', cinemaSchema);
const Movie    = mongoose.model('Movie', movieSchema);

const Screen   = mongoose.model('Screen', screenSchema);
const Schedule = mongoose.model('Schedule', scheduleSchema);
const Booking  = mongoose.model('Booking', bookingSchema);

// ---------- JWT MIDDLEWARE ----------
const verifyToken = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ message: 'No token' });
    const token = auth.split(' ')[1];
    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = decoded;
        next();
    });
};

// ---------- ROUTES ----------
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const cust = await Customer.findOne({ Email: email });
        if (!cust) return res.status(401).json({ message: 'Invalid credentials' });
        const match = await bcrypt.compare(password, cust.Password);
        if (!match) return res.status(401).json({ message: 'Invalid credentials' });
        const token = jwt.sign({ id: cust.Cu_ID }, SECRET, { expiresIn: '1h' });
        res.json({ token, customerId: cust.Cu_ID });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// ---- Movies (with schedule IDs) ----
app.get('/api/movies', verifyToken, async (req, res) => {
    try {
        const movies = await Movie.find();
        const enriched = await Promise.all(movies.map(async m => {
            const sch = await Schedule.find({ Mo_ID: m.Mo_ID }, 'Sch_ID');
            return { ...m._doc, schedules: sch };
        }));
        res.json(enriched);
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// ---- My Bookings ----
app.get('/api/bookings/customer/:id', verifyToken, async (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ message: 'Unauthorized' });
    try {
        const bookings = await Booking.find({ Cu_ID: req.params.id });
        res.json(bookings);
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// ---- Create Booking ----
app.post('/api/bookings', verifyToken, async (req, res) => {
    const { Cu_ID, Sch_ID, Seats_Booked } = req.body;
    if (req.user.id !== Cu_ID) return res.status(403).json({ message: 'Unauthorized' });

    try {
        const schedule = await Schedule.findOne({ Sch_ID });
        if (!schedule) return res.status(404).json({ message: 'Schedule not found' });

        const screen = await Screen.findOne({ Screen_ID: schedule.Screen_ID });
        const booked = await Booking.aggregate([
            { $match: { Sch_ID } },
            { $group: { _id: null, total: { $sum: '$Seats_Booked' } } }
        ]);
        const totalBooked = booked[0]?.total || 0;
        if (totalBooked + Seats_Booked > screen.Capacity)
            return res.status(400).json({ message: 'Not enough seats' });

        const last = await Booking.findOne().sort({ Bo_ID: -1 });
        const newId = last ? last.Bo_ID + 1 : 5001;

        const booking = new Booking({ Bo_ID: newId, Cu_ID, Sch_ID, Seats_Booked });
        await booking.save();
        res.status(201).json(booking);
    } catch (e) { res.status(500).json({ message: 'Booking failed' }); }
});

// ---- Delete Booking ----
app.delete('/api/bookings/:id', verifyToken, async (req, res) => {
    const boId = parseInt(req.params.id);
    try {
        const booking = await Booking.findOne({ Bo_ID: boId });
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (booking.Cu_ID !== req.user.id) return res.status(403).json({ message: 'Unauthorized' });
        await Booking.deleteOne({ Bo_ID: boId });
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});


// ---- SCHEDULES API (100% WORKING) ----
app.get('/api/schedules', verifyToken, async (req, res) => {
    try {
        const schedules = await Schedule.find().lean();
        const result = await Promise.all(schedules.map(async (s) => {
            const movie = await Movie.findOne({ Mo_ID: s.Mo_ID }).lean();
            const screen = await Screen.findOne({ Screen_ID: s.Screen_ID }).lean();
            const cinema = screen ? await Cinema.findOne({ Ci_ID: screen.Ci_ID }).lean() : null;

            const booked = await Booking.aggregate([
                { $match: { Sch_ID: s.Sch_ID } },
                { $group: { _id: null, total: { $sum: '$Seats_Booked' } } }
            ]);
            const seatsBooked = booked[0]?.total || 0;
            const seatsLeft = screen ? (screen.Capacity - seatsBooked) : 0;

            return {
                Sch_ID: s.Sch_ID,
                cinemaId: cinema?.Ci_ID || null,
                movieTitle: movie?.Mo_Title || 'Unknown Movie',
                cinemaName: cinema?.Ci_Name || 'Unknown Cinema',
                cinemaLocation: cinema?.Ci_Location || '',
                Show_Time: s.Show_Time,
                Price: s.Price,
                seatsLeft,
                capacity: screen?.Capacity || 0
            };
        }));
        res.json(result);
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ---- Report (name + count) ----
app.get('/api/bookings/report', verifyToken, async (req, res) => {
    try {
        const rep = await Booking.aggregate([
            { $lookup: { from: 'customers', localField: 'Cu_ID', foreignField: 'Cu_ID', as: 'cust' } },
            { $unwind: '$cust' },
            { $group: { _id: '$Cu_ID', name: { $first: '$cust.Cu_Name' }, count: { $sum: 1 } } }
        ]);
        const result = {};
        rep.forEach(r => result[r._id] = { name: r.name, count: r.count });
        res.json(result);
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});


// ---------- CINEMA SCHEMA ----------



// === INSERT SAMPLE DATA (Run ONLY if empty) ===
// === FORCE INSERT DATA (EVEN IF EXISTS) ===
async function insertSampleData() {
    try {

        // DELETE ALL DATA FIRST
        await Customer.deleteMany({});
        await Cinema.deleteMany({});
        await Movie.deleteMany({});
        await Screen.deleteMany({});
        await Schedule.deleteMany({});
        await Booking.deleteMany({});
        

        const hash = await bcrypt.hash('password123', 10);

        // 1. CUSTOMERS
        await Customer.insertMany([
            { Cu_ID:1, Cu_Name:'Ravi Kumar', Cu_Address:'Pune', Cu_Contact:'9876543210', Email:'ravi@gmail.com', Password:hash },
            { Cu_ID:2, Cu_Name:'Anita Sharma', Cu_Address:'Mumbai', Cu_Contact:'9123456789', Email:'anita@gmail.com', Password:hash },
            { Cu_ID:3, Cu_Name:'Vikram Singh', Cu_Address:'Delhi', Cu_Contact:'9234567890', Email:'vikram@gmail.com', Password:hash }
        ]);
      

        // 2. CINEMAS
        await Cinema.insertMany([
            { Ci_ID:1, Ci_Name:'PVR Phoenix', Ci_Location:'Lower Parel', Ci_City:'Mumbai' },
            { Ci_ID:2, Ci_Name:'INOX R-City', Ci_Location:'Ghatkopar', Ci_City:'Mumbai' },
            { Ci_ID:3, Ci_Name:'Cinepolis Viviana', Ci_Location:'Thane', Ci_City:'Mumbai' }
        ]);
        

        // 3. MOVIES
        await Movie.insertMany([
            { Mo_ID:101, Mo_Title:'Inception', Mo_Desc:'A thief who steals secrets through dreams', Mo_Stars:'Leonardo DiCaprio', Duration:148 },
            { Mo_ID:102, Mo_Title:'The Matrix', Mo_Desc:'A hacker discovers reality is a simulation', Mo_Stars:'Keanu Reeves', Duration:136 },
            { Mo_ID:103, Mo_Title:'Interstellar', Mo_Desc:'A journey through space to save humanity', Mo_Stars:'Matthew McConaughey', Duration:169 }
        ]);
        

        // 4. SCREENS
        await Screen.insertMany([
            { Screen_ID:1, Ci_ID:1, Screen_No:2, Capacity:120 },
            { Screen_ID:2, Ci_ID:2, Screen_No:1, Capacity:150 },
            { Screen_ID:3, Ci_ID:3, Screen_No:3, Capacity:100 }
        ]);
       

        // 5. SCHEDULES
        await Schedule.insertMany([
            { Sch_ID:1001, Mo_ID:101, Screen_ID:1, Show_Time:new Date('2025-08-25T19:00:00'), Price:200 },
            { Sch_ID:1002, Mo_ID:102, Screen_ID:2, Show_Time:new Date('2025-08-26T20:00:00'), Price:180 },
            { Sch_ID:1003, Mo_ID:103, Screen_ID:3, Show_Time:new Date('2025-08-27T18:30:00'), Price:220 }
        ]);
        

        // 6. BOOKINGS
        await Booking.insertMany([
            { Bo_ID:5001, Cu_ID:1, Sch_ID:1001, Seats_Booked:2 },
            { Bo_ID:5002, Cu_ID:2, Sch_ID:1002, Seats_Booked:3 }
        ]);
        

       
    } catch (err) {
        console.error('INSERTION FAILED:', err);
    }
}
insertSampleData();

// ---------- START SERVER ----------
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});



