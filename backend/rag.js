import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { MongoClient } from 'mongodb';
import Tesseract from 'tesseract.js';
import { pipeline } from '@xenova/transformers';
import dotenv from 'dotenv';
import PDFParser from 'pdf2json';

dotenv.config();

let dbClient;
let collection;
let embedder;

// ── PDF Text Extraction using pdf2json ─────────────
function extractTextWithPdf2json(buffer) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();

        pdfParser.on('pdfParser_dataReady', (pdfData) => {
            try {
                // Extract all text from all pages
                const text = pdfData.Pages
                    .map(page =>
                        page.Texts
                            .map(t => decodeURIComponent(t.R[0].T))
                            .join(' ')
                    )
                    .join('\n');
                resolve(text);
            } catch (e) {
                reject(e);
            }
        });

        pdfParser.on('pdfParser_dataError', (err) => {
            reject(new Error(err.parserError));
        });

        // Parse from buffer
        pdfParser.parseBuffer(buffer);
    });
}

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
        const end = start + chunkSize;
        chunks.push(text.slice(start, end));
        start = end - overlap;
    }
    return chunks;
}

// 3. generateEmbedding
export async function generateEmbedding(text) {
    if (!embedder) {
        console.log('Loading embedding model...');
        embedder = await pipeline(
            'feature-extraction',
            'Xenova/all-MiniLM-L6-v2'
        );
        console.log('Embedding model loaded ✅');
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

    console.log(`Indexing ${chunks.length} chunks for ${fileName}...`);

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

    console.log(`Indexed ${totalChunks} chunks for ${fileName} ✅`);
    return totalChunks;
}

// 5. extractTextFromPDF
export async function extractTextFromPDF(buffer) {
    try {
        console.log('Extracting text from PDF...');

        // Ensure it is a proper Buffer
        const pdfBuffer = Buffer.isBuffer(buffer)
            ? buffer
            : Buffer.from(buffer);

        // Try pdf2json first
        let text = await extractTextWithPdf2json(pdfBuffer);
        text = text.trim();

        console.log(`Extracted ${text.length} characters from PDF`);

        // If too short fall back to OCR
        if (text.length < 100) {
            console.log('Text too short — falling back to OCR...');
            const { data: { text: ocrText } } = await Tesseract.recognize(
                pdfBuffer,
                'eng'
            );
            text = ocrText.trim();
            console.log(`OCR extracted ${text.length} characters`);
        }

        return text;

    } catch (error) {
        console.error('PDF Extraction Error:', error.message);

        // Last resort — try OCR directly
        try {
            console.log('Trying OCR as last resort...');
            const { data: { text: ocrText } } = await Tesseract.recognize(
                buffer,
                'eng'
            );
            return ocrText.trim();
        } catch (ocrError) {
            console.error('OCR also failed:', ocrError.message);
            throw new Error('Could not extract text from PDF');
        }
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
