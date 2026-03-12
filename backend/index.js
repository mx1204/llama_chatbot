import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getStreamingResponse } from './services/llm.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://max-ai-bot.vercel.app',
        'https://llama-chatbot-ten.vercel.app'
    ],
    credentials: true,
}));

app.use(express.json());

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
        const stream = getStreamingResponse(messages, model, temperature, max_tokens);

        for await (const content of stream) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
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
