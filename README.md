# Llama Chatbot

A full-stack AI chatbot application built with React, Vite, Express, MongoDB, and Groq. The app supports conversational chat, PDF document ingestion, retrieval-augmented generation (RAG), and streaming assistant responses.

## 🚀 Project Overview

This repository contains a portfolio-ready hackathon project with:

- React + Vite frontend with dark mode and session management
- Express backend powering chat, PDF upload, document search, and RAG
- MongoDB Atlas storage for document vectors and retrieval
- PDF text extraction with fallback OCR
- Groq streaming chat integration for real-time answer generation
- Docker Compose setup for local development and deployment

## 🔧 Key Features

- **Conversational AI chat** using a configurable Groq model
- **Document management**: upload PDF files, index text content, view and delete documents
- **RAG search**: search relevant document chunks to improve chat answers
- **Fallback search**: vector search with text-search fallback when vector index is unavailable
- **Streaming SSE**: assistant responses stream progressively to the UI
- **Multi-session chat**: create, delete, and switch between chat sessions
- **Responsive UI**: mobile-friendly sidebar and document panel
- **Dark mode** toggle for better usability

## 📁 Repository Structure

- `backend/` — Express server, file upload, RAG utilities, vector search integration
- `frontend/` — React app with chat UI, document panel, markdown rendering
- `docker-compose.yml` — development containers for frontend and backend
- `.gitignore` — excludes node_modules, env files, build output, and logs

## ⚙️ Tech Stack

- Frontend: React, Vite, React Markdown, TailwindCSS classes / custom CSS
- Backend: Node.js, Express, Multer, MongoDB, dotenv
- AI: Groq API for chat responses, Xenova transformers for embeddings
- Document parsing: `pdf2json`, `tesseract.js` for OCR fallback
- Deployment: Docker Compose

## ✅ Local Development

### 1. Clone the repository

```bash
git clone <your-repo-url> llama_chatbot
cd llama_chatbot
```

### 2. Configure environment variables

Create `backend/.env` with the following values:

```bash
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-4-scout-17b-16e-instruct
MONGODB_URI=your_mongodb_connection_string
```

Create `frontend/.env` if needed for local overrides:

```bash
VITE_API_URL=http://localhost:8000
```

### 3. Start with Docker Compose

```bash
docker-compose up --build
```

This will launch:

- Frontend at `http://localhost:5173`
- Backend at `http://localhost:8000`

### 4. Or run manually

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --host
```

## 🔍 Available Endpoints

- `GET /` — health check page
- `GET /health` — backend status, model config, API key status
- `POST /chat` — send chat messages and receive streaming AI responses
- `POST /upload` — upload a PDF and index its text content
- `GET /documents` — list uploaded document names
- `DELETE /documents/:fileName` — delete indexed document chunks

## 💡 Notes

- The backend searches documents through MongoDB vector search when a vector index exists.
- If vector search fails, the server falls back to a keyword regex search.
- PDF extraction uses `pdf2json` first and falls back to OCR via `tesseract.js` for scanned documents.
- The frontend stores chat sessions in `localStorage` for persistence.

## 🧹 Cleanup Recommendations

- `frontend/README.md` currently contains the default Vite starter text. Keep the root `README.md` as the main project documentation and replace the frontend placeholder if needed.
- Confirm `.env` files are not committed to Git. The `.gitignore` already excludes `backend/.env` and `frontend/.env`.

## 🌟 Portfolio Highlights

This project demonstrates:

- full-stack web development with modern JavaScript tools
- AI integration with streaming chatbot UX
- RAG document retrieval and PDF ingestion
- containerized deployment with Docker Compose
- production-oriented architecture and clear separation of concerns

---

If you'd like, I can also help clean up the frontend placeholder `README.md` or add a polished project summary there too.