import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const pdf = pdfParse.default || pdfParse;

import { MongoClient } from 'mongodb';
import Tesseract from 'tesseract.js';
import { pipeline } from '@xenova/transformers';
import dotenv from 'dotenv';
dotenv.config();

let dbClient;
let collection;
let embedder;

// 1. connectToMongoDB
export async function connectToMongoDB() {
    if (collection) return collection;
    try {
        dbClient = new MongoClient(process.env.MONGODB_URI);
        await dbClient.connect();
        const db = dbClient.db();
        collection = db.collection('documents');
        console.log('Connected to MongoDB Atlas ✅');
        return collection;
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        throw error;
    }
}

// 2. splitIntoChunks
export function splitIntoChunks(text, chunkSize = 500, overlap = 50) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        let end = start + chunkSize;
        chunks.push(text.slice(start, end));
        start = end - overlap;
    }
    return chunks;
}

// 3. generateEmbedding
export async function generateEmbedding(text) {
    if (!embedder) {
        embedder = await pipeline(
            'feature-extraction',
            'Xenova/all-MiniLM-L6-v2'
        );
    }
    const output = await embedder(text, {
        pooling: 'mean',
        normalize: true
    });
    return Array.from(output.data);
}

// 4. indexDocument
export async function indexDocument(text, fileName) {
    const coll = await connectToMongoDB();
    const chunks = splitIntoChunks(text);
    const createdAt = new Date();
    let totalChunks = 0;

    for (const chunk of chunks) {
        const embedding = await generateEmbedding(chunk);
        await coll.insertOne({
            text: chunk,
            embedding,
            source: fileName,
            createdAt
        });
        totalChunks++;
    }
    return totalChunks;
}

// 5. extractTextFromPDF
export async function extractTextFromPDF(buffer) {
    try {
        // Ensure buffer is correct type
        const pdfBuffer = Buffer.isBuffer(buffer) 
            ? buffer 
            : Buffer.from(buffer);
        
        const data = await pdf(pdfBuffer);
        let text = data.text.trim();

        if (text.length < 100) {
            console.log('PDF text sparse — falling back to OCR...');
            const { data: { text: ocrText } } = await Tesseract.recognize(
                buffer,
                'eng'
            );
            text = ocrText.trim();
        }
        return text;
    } catch (error) {
        console.error('PDF Extraction Error:', error);
        throw error;
    }
}

// 6. searchRelevantChunks
export async function searchRelevantChunks(question, limit = 3) {
    const coll = await connectToMongoDB();
    const queryEmbedding = await generateEmbedding(question);

    const aggregationPipeline = [
        {
            $vectorSearch: {
                index: 'vector_index',
                path: 'embedding',
                queryVector: queryEmbedding,
                numCandidates: limit * 10,
                limit: limit
            }
        },
        {
            $project: {
                _id: 0,
                text: 1,
                source: 1,
                score: { $meta: 'vectorSearchScore' }
            }
        }
    ];

    return await coll.aggregate(aggregationPipeline).toArray();
}
