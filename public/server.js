// Memanggil library yang dibutuhkan
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const multer = require('multer'); 
const xlsx = require('xlsx'); 

// Inisialisasi aplikasi Express
const app = express();

/** * PERBAIKAN 1: Port harus dinamis untuk Hosting 
 */
const port = process.env.PORT || 3000;

/** * PERBAIKAN 2: Gunakan Environment Variables
 * Jangan taruh KEY langsung di kode kalau mau upload ke GitHub.
 * Di Render nanti, masukkan URL dan KEY ini di menu "Environment Variables"
 */
const supabaseUrl = process.env.SUPABASE_URL || 'https://cwyrshzyghnkxvhfgjtf.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_i6Z7v6E3A_fMsEMBn78r-g_kFAChAyr';

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Konfigurasi Multer
const upload = multer({ storage: multer.memoryStorage() });

// Jalur Utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- API LOGIN ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { data, error } = await supabase
            .from('akun_spmb')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle(); // Lebih aman daripada .single() jika data kosong

        if (error) throw error;
        if (!data) return res.json({ success: false, message: 'Username atau password salah!' });
        if (data.status === 'pending') return res.json({ success: false, message: 'Akun belum aktif. Hubungi Admin!' });

        res.json({ success: true, message: 'Login berhasil!', role: data.role, nama: data.nama_lengkap });
    } catch (err) {
        res.json({ success: false, message: 'Kesalahan Server: ' + err.message });
    }
});

/**
 * PERBAIKAN 3: Sesuai permintaan, role default pendaftar adalah 'Guru'
 */
app.post('/api/register', async (req, res) => {
    const { namaLengkap, username, password } = req.body;
    const { error } = await supabase
        .from('akun_spmb')
        .insert([{ 
            nama_lengkap: namaLengkap, 
            username: username, 
            password: password, 
            role: 'guru', // Otomatis Guru
            status: 'pending' 
        }]);

    if (error) {
        if (error.code === '23505') return res.json({ success: false, message: 'Username sudah digunakan!' });
        return res.json({ success: false, message: 'Gagal daftar: ' + error.message });
    }
    res.json({ success: true, message: 'Berhasil! Tunggu konfirmasi admin.' });
});

// --- API ADMIN (APPROVE/REJECT) ---
app.get('/api/pending-users', async (req, res) => {
    const { data, error } = await supabase.from('akun_spmb').select('*').eq('status', 'pending');
    res.json({ success: !error, data: data, message: error?.message });
});

app.post('/api/approve-user', async (req, res) => {
    const { username } = req.body;
    const { error } = await supabase.from('akun_spmb').update({ status: 'aktif' }).eq('username', username);
    res.json({ success: !error, message: error ? 'Gagal' : 'Akun disetujui!' });
});

app.post('/api/reject-user', async (req, res) => {
    const { username } = req.body;
    const { error } = await supabase.from('akun_spmb').delete().eq('username', username);
    res.json({ success: !error, message: error ? 'Gagal' : 'Akun ditolak!' });
});

// --- API EXCEL NILAI ---
app.post('/api/upload-rapor', upload.single('file'), async (req, res) => {
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

app.post('/api/upload-tka', upload.single('file'), async (req, res) => {
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

app.get('/api/data-rapor', async (req, res) => {
    const { data, error } = await supabase.from('nilai_rapor').select('*');
    res.json({ success: !error, data: data });
});

app.get('/api/data-tka', async (req, res) => {
    const { data, error } = await supabase.from('nilai_tka').select('*');
    res.json({ success: !error, data: data });
});

app.get('/api/passing-grade', async (req, res) => {
    const { data, error } = await supabase.from('passing_grade').select('*');
    res.json({ success: !error, data: data });
});

// Menyalakan server
app.listen(port, () => {
    console.log(`Server online di port: ${port}`);
});