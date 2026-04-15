const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const serverless = require('serverless-http'); 
const multer = require('multer'); 
const xlsx = require('xlsx'); 

const app = express();
const router = express.Router(); 

// Konfigurasi Supabase dari Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Konfigurasi Multer
const upload = multer({ storage: multer.memoryStorage() });

// --- API LOGIN (VERSI ANTI-BUFFER) ---
router.post('/login', async (req, res) => {
    // 1. PEMBUKA BUNGKUS DATA (Penawar Buffer Netlify)
    let payload = req.body;
    
    try {
        if (Buffer.isBuffer(payload)) {
            // Kalau bentuknya Buffer, ubah jadi teks lalu jadikan JSON
            payload = JSON.parse(payload.toString('utf8'));
        } else if (typeof payload === 'string') {
            // Kalau bentuknya string biasa, ubah jadikan JSON
            payload = JSON.parse(payload);
        }
    } catch (e) {
        console.error("Gagal membaca format data dari frontend:", e);
    }

    // 2. Ambil username & password dari data yang sudah dibuka
    const { username, password } = payload;
    
    console.log(`Mencari Username: [${username}], Password: [${password}]`);

    try {
        // 3. Cek di tabel users_app dulu (Admin)
        let { data: adminData, error: adminErr } = await supabase
            .from('users_app')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle();

        // Kalau ketemu sebagai Admin, langsung loloskan
        if (adminData) {
            return res.json({ 
                success: true, 
                message: 'Login Admin berhasil!', 
                role: adminData.role, 
                nama: adminData.nama_lengkap 
            });
        }

        // 4. Kalau bukan Admin, coba cari di tabel akun_spmb (Guru)
        const { data: userData, error: userError } = await supabase
            .from('akun_spmb')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle();

        if (userError) throw userError;

        // Kalau di kedua tabel sama sekali nggak ada
        if (!userData) {
            return res.json({ success: false, message: 'Username atau password salah!' });
        }

        // Kalau ada di akun_spmb tapi belum disetujui admin
        if (userData.status === 'pending') {
            return res.json({ success: false, message: 'Akun belum aktif! Tunggu konfirmasi admin.' });
        }

        // Kalau berhasil login sebagai user biasa
        res.json({ 
            success: true, 
            message: 'Login berhasil!', 
            role: userData.role, 
            nama: userData.nama_lengkap 
        });

    } catch (err) {
        console.error("SERVER ERROR:", err.message);
        res.json({ success: false, message: 'Kesalahan Server: ' + err.message });
    }
});

// --- API REGISTER ---
router.post('/register', async (req, res) => {
    const { namaLengkap, username, password } = req.body;
    const { error } = await supabase
        .from('akun_spmb')
        .insert([{ 
            nama_lengkap: namaLengkap, 
            username: username, 
            password: password, 
            role: 'guru', 
            status: 'pending' 
        }]);

    if (error) {
        if (error.code === '23505') return res.json({ success: false, message: 'Username sudah digunakan!' });
        return res.json({ success: false, message: 'Gagal daftar: ' + error.message });
    }
    res.json({ success: true, message: 'Berhasil! Tunggu konfirmasi admin.' });
});

// --- API ADMIN ---
router.get('/pending-users', async (req, res) => {
    const { data, error } = await supabase.from('akun_spmb').select('*').eq('status', 'pending');
    res.json({ success: !error, data: data });
});

router.post('/approve-user', async (req, res) => {
    const { username } = req.body;
    const { error } = await supabase.from('akun_spmb').update({ status: 'aktif' }).eq('username', username);
    res.json({ success: !error, message: error ? 'Gagal' : 'Akun disetujui!' });
});

router.post('/reject-user', async (req, res) => {
    const { username } = req.body;
    const { error } = await supabase.from('akun_spmb').delete().eq('username', username);
    res.json({ success: !error, message: error ? 'Gagal' : 'Akun ditolak!' });
});

// --- API EXCEL ---
router.post('/upload-rapor', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, message: 'File tidak ada!' });
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const dataExcel = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const { error } = await supabase.from('nilai_rapor').insert(dataExcel);
        if (error) throw error;
        res.json({ success: true, message: 'Data Rapor masuk!' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

router.post('/upload-tka', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, message: 'File tidak ada!' });
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const dataExcel = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const { error } = await supabase.from('nilai_tka').insert(dataExcel);
        if (error) throw error;
        res.json({ success: true, message: 'Data TKA masuk!' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// --- API AMBIL DATA ---
router.get('/data-rapor', async (req, res) => {
    const { data, error } = await supabase.from('nilai_rapor').select('*');
    res.json({ success: !error, data: data });
});

router.get('/data-tka', async (req, res) => {
    const { data, error } = await supabase.from('nilai_tka').select('*');
    res.json({ success: !error, data: data });
});

router.get('/passing-grade', async (req, res) => {
    const { data, error } = await supabase.from('passing_grade').select('*');
    res.json({ success: !error, data: data });
});

router.post('/update-pg', async (req, res) => {
    const { id, passing_grade } = req.body;
    try {
        const { error } = await supabase
            .from('passing_grade')
            .update({ passing_grade: parseFloat(passing_grade) })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true, message: 'Berhasil update!' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// Routing wajib Netlify
app.use('/api', router);
app.use('/.netlify/functions/api', router); 

// EXPORT UNTUK NETLIFY
module.exports.handler = serverless(app);