require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { randomUUID } = require('crypto')

const app = express()
const sessions = new Map()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /^(application\/pdf|image\/(png|jpeg|jpg))$/.test(file.mimetype)) })

app.use(cors())
app.use(express.json())

const toDataUrl = (file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
const demoQuestions = [
  { id: 'q1', number: '1', text: 'What is the process by which plants make their food?', max_marks: 2 },
  { id: 'q2', number: '2', text: 'Explain the importance of photosynthesis for living organisms.', max_marks: 5 },
  { id: 'q3', number: '3', text: 'Define ecosystem and describe its major components.', max_marks: 5 },
]

function createDevelopmentPayload(questionPaper, answerSheet) {
  return {
    status: 'ready',
    questionPaperPages: [toDataUrl(questionPaper)],
    answerSheetPages: [toDataUrl(answerSheet)],
    questions: demoQuestions.map((question, index) => ({ ...question, answer: index === 2 ? null : { text: 'Student answer extracted during development preview.', page: 1, bbox: [180 + index * 170, 80, 340 + index * 170, 910], continues_from_page: null }, grading: index === 0 ? { score: 2, verdict: 'correct', feedback: 'The response identifies the process and its key ingredients.' } : index === 1 ? { score: 3, verdict: 'partial', feedback: 'Add how oxygen and glucose support other organisms.' } : { score: 0, verdict: 'unanswered', feedback: 'No confidently mapped response was found.' } })),
    unansweredQuestionIds: ['q3'],
    unmatchedAnswers: [],
  }
}

async function processSession(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) return
  session.progress = 'Preparing page images'
  await new Promise((resolve) => setTimeout(resolve, 350))
  if (!process.env.GEMINI_API_KEY) {
    session.payload = createDevelopmentPayload(session.questionPaper, session.answerSheet)
    session.status = 'ready'
    session.progress = 'Ready'
    return
  }
  session.status = 'error'
  session.progress = 'Gemini extraction is not wired in this development build'
  session.error = 'Add the Gemini extraction pipeline before using production AI processing.'
}

app.post('/api/sessions', upload.fields([{ name: 'questionPaper', maxCount: 1 }, { name: 'answerSheet', maxCount: 1 }]), (req, res) => {
  const questionPaper = req.files?.questionPaper?.[0]
  const answerSheet = req.files?.answerSheet?.[0]
  if (!questionPaper || !answerSheet) return res.status(400).json({ error: 'Both questionPaper and answerSheet are required.' })
  const sessionId = randomUUID()
  sessions.set(sessionId, { status: 'processing', progress: 'Starting extraction', questionPaper, answerSheet })
  processSession(sessionId).catch((error) => { const session = sessions.get(sessionId); if (session) Object.assign(session, { status: 'error', error: error.message }) })
  res.status(202).json({ sessionId })
})

app.get('/api/sessions/:id/status', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  res.json({ status: session.status, progress: session.progress, error: session.error })
})

app.get('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.status !== 'ready') return res.status(409).json({ status: session.status, progress: session.progress, error: session.error })
  res.json(session.payload)
})

app.get('/api/health', (_req, res) => res.json({ ok: true, sessions: sessions.size }))
const port = process.env.PORT || 5000
app.listen(port, () => console.log(`VedaAI API listening on http://127.0.0.1:${port}`))
