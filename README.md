# AI Assessment Extraction & Answer Mapping

This is my submission for the VedaAI hiring assignment. A teacher uploads a question paper and one student's handwritten answer sheet, and the app extracts the questions, extracts the answers, maps each answer to its question, highlights exactly where that answer is on the sheet, and (optionally) grades it.

**Live app:** https://client-sigma-umber-48.vercel.app/
**Backend:** https://ai-answer-mapping.onrender.com

> Note: the backend is on Render's free tier, so it spins down after ~15 min of inactivity. The first request after that can take 30-50 seconds to wake up — that's expected, not a bug. I've got a GitHub Actions cron pinging it every 14 minutes to keep it warm during review.

## How it works

Core flow: **Question Extraction → Answer Extraction → Answer Mapping → Grading/Feedback**

1. Both files (PDF or image) get converted to page images on the backend.
2. Question paper images go to Gemini with a prompt that extracts every question in printed order, treating labelled sub-parts (like `4(a)` / `4(b)`) as separate entries.
3. Answer sheet images go to Gemini in a separate call that transcribes the handwriting and returns a bounding box for each answer block, along with which question number it thinks it's answering.
4. On the backend, I match answers to questions — first by exact number match, then falling back to fuzzy text similarity for anything Gemini couldn't confidently number. Anything that still doesn't match ends up in an "unmatched answers" bucket, and questions with no match are marked unanswered.
5. Optionally, if a marking scheme is uploaded, it's also extracted and used to ground the grading step so Gemini grades against the teacher's actual expected answer instead of just its own general knowledge.
6. The frontend shows extracted questions on one side and the answer sheet on the other. Clicking a question draws a highlight box over its answer region on the sheet, computed from the bounding box Gemini returned.

## Tech stack

- **Frontend:** React (Vite), plain CSS
- **Backend:** Node.js + Express, in-memory session store (no DB, per the assignment)
- **AI:** Google Gemini (free tier) for extraction, mapping assistance, and grading
- **File handling:** multer for uploads, pdf-to-img for converting PDF pages to images before sending them to Gemini
- **Deploy:** frontend on Vercel, backend on Render

## Running it locally

```bash
# backend
cd server
npm install
# create a .env file with:
# GEMINI_API_KEY=your_key_here
npm start

# frontend, in a separate terminal
cd client
npm install
npm run dev
```

Get a free Gemini key at https://aistudio.google.com/apikey

## Assumptions & limitations

- Grading without a marking scheme is Gemini's best-effort judgment against its own general subject knowledge — it's not a substitute for a real rubric. Uploading a marking scheme makes grading meaningfully more accurate since it's then compared against the teacher's actual expected answer.
- Handwriting OCR accuracy depends a lot on legibility. Messy handwriting can lead to wrong transcriptions, which flows through to wrong mapping/grading — that's an OCR limitation, not a mapping logic bug.
- Answer-to-question matching is number-based first, with fuzzy text similarity as a fallback for anything without a clear number. This handles out-of-order answers fine, but if a student writes zero identifying information and the answer content is very generic, matching can occasionally misfire.
- No database — sessions live in server memory and reset if the backend restarts (Render free tier does this on redeploy or after long inactivity).
- No auth, as specified in the assignment scope.

## What I'd do with more time

- Persist sessions (Redis or a lightweight DB) so a Render restart doesn't lose in-progress work
- Word/line-level OCR pass as a secondary signal alongside Gemini's bounding boxes, for tighter highlight precision
- Batch the grading call per-question instead of one big batched call, to isolate failures to a single question instead of risking the whole grading pass
