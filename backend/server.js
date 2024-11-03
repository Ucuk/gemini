import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const FILE_PATH = path.join(process.cwd(), 'backend', 'Database', 'geminiSessions.json');

// Fungsi untuk memastikan file exists
const ensureFileExists = async () => {
    try {
        await fs.access(FILE_PATH);
    } catch (error) {
        await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
        await fs.writeFile(FILE_PATH, JSON.stringify({}, null, 2));
    }
};

// Fungsi untuk membaca data Gemini
const readGeminiData = async () => {
    await ensureFileExists();
    try {
        const data = await fs.readFile(FILE_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
};

// Fungsi untuk menulis data Gemini
const writeGeminiData = async (data) => {
    await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2));
};

// Fungsi Gemini untuk memproses permintaan API
async function gemini(options) {
    try {
        return await new Promise(async (resolve, reject) => {
            options = {
                model: 'gemini-pro',
                messages: options?.messages,
                temperature: options?.temperature || 0.9,
                top_p: options?.top_p || 0.7,
                top_k: options?.top_k || 40,
            };
            
            if (!options?.messages) return reject('Payload pesan tidak ada!');
            if (!Array.isArray(options?.messages)) return reject('Array pesan tidak valid!');
            if (isNaN(options?.top_p)) return reject('Nilai top_p tidak valid!');
            if (isNaN(options?.top_k)) return reject('Nilai top_k tidak valid!');
            
            axios.post('https://api.acloudapp.com/v1/completions', options, {
                headers: {
                    authorization: 'sk-9jL26pavtzAHk9mdF0A5AeAfFcE1480b9b06737d9eC62c1e'
                }
            }).then(res => {
                const data = res.data;
                if (!data.choices[0].message.content) return reject('Gagal mendapatkan pesan respons!');
                resolve({
                    success: true,
                    answer: data.choices[0].message.content
                });
            }).catch(reject);
        });
    } catch (e) {
        return {
            success: false,
            errors: [e]
        };
    }
}

app.post('/api/gemini', async (req, res) => {
    const { text, sender } = req.body;
    if (!text) return res.status(400).json({ error: 'Masukkan pesan!' });

    try {
        const currentTime = Date.now();
        const sessionTimeout = 600000; // 10 menit

        const geminiData = await readGeminiData();

        if (/^\.gemini stop$/i.test(text.trim())) {
            if (geminiData[sender]) {
                delete geminiData[sender];
                await writeGeminiData(geminiData);
                return res.json({ message: 'Sesi Gemini Anda telah dihapus.' });
            } else {
                return res.json({ message: 'Tidak ada sesi Gemini yang aktif.' });
            }
        }

        if (geminiData[sender] && (currentTime - geminiData[sender].timestamp <= sessionTimeout)) {
            geminiData[sender].timestamp = currentTime;
        } else {
            geminiData[sender] = { timestamp: currentTime };
        }

        await writeGeminiData(geminiData);

        const options = {
            messages: [
                { role: 'system', content: 'Kamu adalah asisten yang membantu.' },
                { role: 'user', content: text }
            ],
            temperature: 0.8,
            top_p: 0.7,
            top_k: 40
        };

        const response = await gemini(options);
        res.json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan dalam proses AI Gemini.' });
    }
});

app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));