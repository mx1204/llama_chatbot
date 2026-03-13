import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getStreamingResponse } from './services/llm.js';
import multer from 'multer';
import { extractTextFromPDF, indexDocument, connectToMongoDB, searchRelevantChunks } from './rag.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors({
    origin: function(origin, callback) {
        // Allow no origin (Postman, mobile)
        if (!origin) return callback(null, true);

        // Allow any vercel.app URL automatically
        if (origin.endsWith('.vercel.app')) {
            return callback(null, true);
        }

        // Allow localhost for development
        if (origin.startsWith('http://localhost')) {
            return callback(null, true);
        }

        // Block everything else
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Handle preflight requests for all routes
app.options('*', cors());

app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Endpoint 1: POST /upload
app.post('/upload', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const text = await extractTextFromPDF(req.file.buffer);
        const chunks = await indexDocument(text, req.file.originalname);
        
        res.json({ success: true, chunks, fileName: req.file.originalname });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to process document' });
    }
});

// Endpoint 2: GET /documents
app.get('/documents', async (req, res) => {
    try {
        const collection = await connectToMongoDB();
        const sources = await collection.distinct('source');
        res.json(sources);
    } catch (error) {
        console.error('Fetch documents error:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// Endpoint 3: DELETE /documents/:fileName
app.delete('/documents/:fileName', async (req, res) => {
    try {
        const collection = await connectToMongoDB();
        const result = await collection.deleteMany({ source: req.params.fileName });
        res.json({ success: true, deleted: result.deletedCount });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

app.get('/', (req, res) => {
    res.send('Llama Chatbot Backend is running! Use /health for details.');
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        model: process.env.GROQ_MODEL,
        hasApiKey: !!process.env.GROQ_API_KEY 
    });
});

app.post('/chat', async (req, res) => {
    const { messages, model, temperature, max_tokens } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        // Task 4: Search for relevant chunks
        let context = '';
        let sources = [];
        try {
            const lastUserMessage = messages.filter(m => m.role === 'user').pop();
            if (lastUserMessage) {
                const chunks = await searchRelevantChunks(lastUserMessage.content);
                if (chunks && chunks.length > 0) {
                    context = chunks.map(c => `[Source: ${c.source}]\n${c.text}`).join('\n---\n');
                    sources = [...new Set(chunks.map(c => c.source))];
                }
            }
        } catch (ragError) {
            console.error('RAG Search Error:', ragError);
        }

        const stream = getStreamingResponse(messages, model, temperature, max_tokens, context);

        for await (const content of stream) {
            res.write(`data: ${JSON.stringify({ content, sources: context ? sources : [] })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        console.error('Chat error:', error);
        res.write(`data: ${JSON.stringify({ content: 'Error occurred' })}\n\n`);
        res.end();
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
