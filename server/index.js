require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { randomUUID } = require('crypto')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { pdf } = require('pdf-to-img')
const stringSimilarity = require('string-similarity')

const app = express()
const sessions = new Map()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(application\/pdf|image\/(png|jpeg|jpg))$/.test(file.mimetype))
})

app.use(cors())
app.use(express.json())

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null
const model = genAI ? genAI.getGenerativeModel({ model: 'gemini-3.6-flash' }) : null

// ---- helpers ----

async function fileToPageImages(file) {
  if (file.mimetype === 'application/pdf') {
    const pages = []
    const document = await pdf(file.buffer, { scale: 2 })
    for await (const page of document) {
      pages.push({ mimeType: 'image/png', data: page.toString('base64') })
    }
    if (pages.length === 0) throw new Error('Could not render any pages from the PDF — is it a valid/non-empty PDF?')
    return pages
  }
  return [{ mimeType: file.mimetype, data: file.buffer.toString('base64') }]
}

function extractJson(rawText) {
  const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (err) {
    console.error('Gemini did not return valid JSON:\n', rawText)
    throw new Error('Gemini response was not valid JSON — see server logs for the raw output.')
  }
}

async function callGemini(promptText, images) {
  if (!model) throw new Error('GEMINI_API_KEY is missing — set it in server/.env and restart the server.')
  const parts = [
    { text: promptText },
    ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))
  ]
  const result = await model.generateContent(parts)
  const text = result.response.text()
  return extractJson(text)
}

const QUESTION_PROMPT = `You are extracting questions from a printed question paper.
Rules:
- Extract every question in the exact order they are printed.
- If a question has labelled sub-parts (e.g. "4 (a)", "4 (b)"), output each sub-part as its own separate entry.
- Preserve the exact original numbering/labelling as printed.
- Include max marks if printed, else null.
Return ONLY valid JSON, no markdown fences, no commentary:
[{ "id": "q1", "number": "1", "text": "...", "max_marks": 3, "page": 1 }]`

const ANSWER_PROMPT = `You are reading a student's handwritten answer sheet.
For each distinct answer block:
- Determine which question number it answers (use any number the student wrote; if none visible, infer from content, or set "question_number": null if unsure).
- Transcribe the handwritten answer text as best you can.
- Give a bounding box [ymin, xmin, ymax, xmax], normalized 0-1000 relative to that page image.
- Note the page number.
Return ONLY valid JSON, no markdown fences, no commentary:
[{ "question_number": "1", "answer_text": "...", "page": 1, "bbox": [120,60,340,900], "confidence": 0.9 }]`

const MARKING_SCHEME_PROMPT = `You are reading a teacher's marking scheme / model answer key.
For each question or sub-part in it, extract:
- number: the question number/label exactly as written (e.g. "1", "4 (a)")
- model_answer: the expected correct answer or key points, as written
- max_marks: if stated, else null
Return ONLY valid JSON, no markdown fences, no commentary:
[{ "number": "1", "model_answer": "...", "max_marks": 3 }]`

const GRADING_PROMPT_HEADER = `You are grading a student's answers.
For each item below you get: question number, question text, max marks, the student's answer, and — when available — "model_answer" from the teacher's own marking scheme.
Rules:
- If "model_answer" is present, grade primarily against THAT — it is the teacher's actual expected answer, treat it as ground truth over your own general knowledge.
- If "model_answer" is null/absent, grade using your own subject knowledge as a fallback, and say so is not needed in the feedback (just grade normally).
- score: a number from 0 to max_marks (allow partial credit)
- verdict: one of "correct" | "partial" | "incorrect"
- feedback: one short, specific, constructive sentence — mention what's right and what's missing if partial/incorrect
Be fair but rigorous — do not give full marks for vague or incomplete answers.
Return ONLY valid JSON, no markdown fences, no commentary, one entry per input item in the same order:
[{ "id": "q1", "score": 2, "verdict": "correct", "feedback": "..." }]

Items to grade:
`

const OVERALL_SUMMARY_PROMPT_HEADER = `You are a teaching assistant writing a short overall performance summary for a teacher, based on this per-question grading data (question number, max marks, score, verdict).
Write 2-3 sentences: overall performance level, one clear strength, and the single most important area to improve. Be specific, not generic.
Return ONLY valid JSON, no markdown fences, no commentary:
{ "overall_feedback": "..." }

Grading data:
`

async function callGeminiTextOnly(promptText) {
  if (!model) throw new Error('GEMINI_API_KEY is missing — set it in server/.env and restart the server.')
  const result = await model.generateContent([{ text: promptText }])
  return extractJson(result.response.text())
}

async function gradeAnsweredQuestions(questions, markingScheme) {
  const answered = questions.filter((q) => q.answer)
  if (answered.length === 0) return {}

  const schemeByNumber = {}
  for (const entry of markingScheme || []) {
    schemeByNumber[normalizeNumber(entry.number)] = entry
  }

  const items = answered.map((q) => {
    const schemeEntry = schemeByNumber[normalizeNumber(q.number)]
    return {
      id: q.id,
      number: q.number,
      question: q.text,
      max_marks: schemeEntry?.max_marks ?? q.max_marks ?? null,
      model_answer: schemeEntry?.model_answer ?? null,
      student_answer: q.answer.text
    }
  })

  const graded = await callGeminiTextOnly(GRADING_PROMPT_HEADER + JSON.stringify(items, null, 2))
  const byId = {}
  for (const g of graded) byId[g.id] = { score: g.score, verdict: g.verdict, feedback: g.feedback }
  return byId
}

async function buildOverallSummary(questions) {
  const gradedList = questions
    .filter((q) => q.grading)
    .map((q) => ({ number: q.number, max_marks: q.max_marks, score: q.grading.score, verdict: q.grading.verdict }))

  const totalMaxMarks = questions.reduce((sum, q) => sum + (q.max_marks || 0), 0)
  const totalScore = questions.reduce((sum, q) => sum + (q.grading?.score || 0), 0)
  const correctCount = questions.filter((q) => q.grading?.verdict === 'correct').length
  const partialCount = questions.filter((q) => q.grading?.verdict === 'partial').length
  const incorrectCount = questions.filter((q) => q.grading?.verdict === 'incorrect').length
  const unansweredCount = questions.filter((q) => !q.answer).length

  let overallFeedback = 'No answered questions to summarize.'
  if (gradedList.length > 0) {
    try {
      const result = await callGeminiTextOnly(OVERALL_SUMMARY_PROMPT_HEADER + JSON.stringify(gradedList, null, 2))
      overallFeedback = result.overall_feedback
    } catch (err) {
      console.error('Overall summary generation failed, falling back to a computed summary:', err.message)
      overallFeedback = `Scored ${totalScore}/${totalMaxMarks} across ${questions.length} question(s): ${correctCount} correct, ${partialCount} partial, ${incorrectCount} incorrect, ${unansweredCount} unanswered.`
    }
  }

  return {
    totalScore,
    totalMaxMarks,
    percentage: totalMaxMarks ? Math.round((totalScore / totalMaxMarks) * 100) : 0,
    correctCount,
    partialCount,
    incorrectCount,
    unansweredCount,
    overallFeedback
  }
}

function normalizeNumber(value) {
  return String(value || '').toLowerCase().replace(/[\s().]/g, '')
}

function mapQuestionsToAnswers(questions, answers, questionPages, answerPages) {
  const answered = []
  const usedAnswerIdx = new Set()

  const finalQuestions = questions.map((q) => {
    const qKey = normalizeNumber(q.number)
    let matchIdx = answers.findIndex((a, i) => !usedAnswerIdx.has(i) && normalizeNumber(a.question_number) === qKey)

    if (matchIdx === -1) {
      // fallback: fuzzy text match against unmatched answers
      const candidates = answers
        .map((a, i) => ({ a, i }))
        .filter(({ i }) => !usedAnswerIdx.has(i))
      if (candidates.length) {
        const scored = candidates.map(({ a, i }) => ({
          i,
          score: stringSimilarity.compareTwoStrings(q.text || '', a.answer_text || '')
        })).sort((x, y) => y.score - x.score)
        if (scored[0] && scored[0].score > 0.35) matchIdx = scored[0].i
      }
    }

    if (matchIdx !== -1) {
      usedAnswerIdx.add(matchIdx)
      const match = answers[matchIdx]
      return {
        ...q,
        answer: {
          text: match.answer_text,
          page: match.page,
          bbox: match.bbox,
          confidence: match.confidence ?? null
        }
      }
    }
    return { ...q, answer: null }
  })

  const unmatchedAnswers = answers.filter((_, i) => !usedAnswerIdx.has(i))
  const unansweredQuestionIds = finalQuestions.filter((q) => !q.answer).map((q) => q.id)

  return {
    status: 'ready',
    questionPaperPages: questionPages.map((p) => `data:${p.mimeType};base64,${p.data}`),
    answerSheetPages: answerPages.map((p) => `data:${p.mimeType};base64,${p.data}`),
    questions: finalQuestions,
    unansweredQuestionIds,
    unmatchedAnswers
  }
}

// ---- main pipeline ----

async function processSession(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) return
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is missing in server/.env — get a free key from https://aistudio.google.com/apikey')
    }

    session.progress = 'Converting pages to images'
    const questionPages = await fileToPageImages(session.questionPaper)
    const answerPages = await fileToPageImages(session.answerSheet)

    session.progress = `Extracting questions (${questionPages.length} page(s))`
    const questions = await callGemini(QUESTION_PROMPT, questionPages)
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Gemini returned no questions — check that the question paper image is legible and not blank.')
    }

    session.progress = `Extracting answers (${answerPages.length} page(s))`
    const answers = await callGemini(ANSWER_PROMPT, answerPages)

    session.progress = 'Mapping answers to questions'
    const payload = mapQuestionsToAnswers(questions, answers, questionPages, answerPages)

    let markingScheme = null
    if (session.markingScheme) {
      try {
        session.progress = 'Reading marking scheme'
        const schemePages = await fileToPageImages(session.markingScheme)
        markingScheme = await callGemini(MARKING_SCHEME_PROMPT, schemePages)
      } catch (err) {
        console.error(`[session ${sessionId}] marking scheme extraction failed, grading without it:`, err.message)
      }
    }

    session.progress = 'Grading answers'
    let gradingById = {}
    try {
      gradingById = await gradeAnsweredQuestions(payload.questions, markingScheme)
    } catch (err) {
      console.error(`[session ${sessionId}] grading failed, continuing without scores:`, err.message)
    }
    payload.questions = payload.questions.map((q) => ({ ...q, grading: gradingById[q.id] || null }))
    payload.usedMarkingScheme = !!markingScheme

    session.progress = 'Writing overall summary'
    payload.summary = await buildOverallSummary(payload.questions)

    session.payload = payload
    session.status = 'ready'
    session.progress = 'Done'
  } catch (error) {
    session.status = 'error'
    session.error = error.message
    session.progress = 'Failed'
    console.error(`[session ${sessionId}] processSession failed:`, error)
  }
}

// ---- routes ----

app.post('/api/sessions', upload.fields([{ name: 'questionPaper', maxCount: 1 }, { name: 'answerSheet', maxCount: 1 }, { name: 'markingScheme', maxCount: 1 }]), (req, res) => {
  const questionPaper = req.files?.questionPaper?.[0]
  const answerSheet = req.files?.answerSheet?.[0]
  const markingScheme = req.files?.markingScheme?.[0] // optional
  if (!questionPaper || !answerSheet) return res.status(400).json({ error: 'Both questionPaper and answerSheet are required.' })
  const sessionId = randomUUID()
  sessions.set(sessionId, { status: 'processing', progress: 'Starting extraction', questionPaper, answerSheet, markingScheme })
  processSession(sessionId)
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

app.get('/api/health', (_req, res) => res.json({ ok: true, sessions: sessions.size, geminiConfigured: !!process.env.GEMINI_API_KEY }))

const port = process.env.PORT || 5000
app.listen(port, () => console.log(`VedaAI API listening on http://127.0.0.1:${port}`))