import { useRef, useState } from 'react'
import { Bell, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, FileText, Home, Library, Minus, MoreHorizontal, Plus, Settings, Sparkles, Upload, Users, X } from 'lucide-react'
import './App.css'

const API_BASE = 'http://127.0.0.1:5000'

function scoreTone(q) {
  if (!q.answer) return 'muted'
  if (!q.grading) return 'muted'
  if (q.grading.verdict === 'correct') return 'success'
  if (q.grading.verdict === 'partial') return 'warning'
  return 'error'
}

function App() {
  const [questionPaper, setQuestionPaper] = useState(null)
  const [answerSheet, setAnswerSheet] = useState(null)
  const [markingScheme, setMarkingScheme] = useState(null)
  const [view, setView] = useState('upload')
  const [sessionData, setSessionData] = useState(null) // <-- holds the real extraction result
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [expanded, setExpanded] = useState([])
  const [mobileTab, setMobileTab] = useState('questions')
  const questionInput = useRef(null)
  const answerInput = useRef(null)
  const schemeInput = useRef(null)

  const handleFile = (setter, file) => {
    if (!file || file.size > 10 * 1024 * 1024) return
    setter({ raw: file, name: file.name, size: `${(file.size / 1024 / 1024).toFixed(1)} MB`, pages: file.type === 'application/pdf' ? '4 Pages' : '1 Page' })
  }
  const selectQuestion = (id) => { setActiveQuestion(id); setMobileTab('answers') }

  const startMapping = async () => {
    if (!questionPaper || !answerSheet) return
    setView('extracting')
    try {
      const formData = new FormData()
      formData.append('questionPaper', questionPaper.raw)
      formData.append('answerSheet', answerSheet.raw)
      if (markingScheme) formData.append('markingScheme', markingScheme.raw)
      const response = await fetch(`${API_BASE}/api/sessions`, { method: 'POST', body: formData })
      if (!response.ok) throw new Error((await response.json()).error || 'Upload failed')
      const { sessionId } = await response.json()

      let status = 'processing'
      let lastError = null
      while (status === 'processing') {
        await new Promise((resolve) => setTimeout(resolve, 900))
        const statusResponse = await fetch(`${API_BASE}/api/sessions/${sessionId}/status`)
        const statusData = await statusResponse.json()
        status = statusData.status
        lastError = statusData.error
      }
      if (status === 'error') throw new Error(lastError || 'Extraction failed')

      // ---- THE MISSING STEP: actually fetch the extracted result ----
      const dataResponse = await fetch(`${API_BASE}/api/sessions/${sessionId}`)
      if (!dataResponse.ok) throw new Error('Could not load extraction result')
      const data = await dataResponse.json()

      setSessionData(data)
      setActiveQuestion(data.questions?.[0]?.id ?? null)
      setView('mapping')
    } catch (err) {
      setView('upload')
      alert(`Extraction failed: ${err.message}`)
    }
  }

  if (view === 'mapping') {
    return (
      <MappingScreen
        sessionData={sessionData}
        activeQuestion={activeQuestion}
        selectQuestion={selectQuestion}
        expanded={expanded}
        setExpanded={setExpanded}
        mobileTab={mobileTab}
        setMobileTab={setMobileTab}
        onBack={() => setView('upload')}
      />
    )
  }
  if (view === 'extracting') return <ExtractingScreen />
  return <div className="app-shell"><Sidebar /><main className="main-area"><Topbar /><section className="upload-page"><div className="eyebrow"><span>Exams</span><ChevronRight size={14} /><span className="muted">New mapping</span></div><div className="upload-card"><div className="upload-heading"><div><h1>Upload <span>Question Paper &amp; Answer Sheets</span></h1><p>Upload both files to get started</p></div><div className="teacher-orbit"><div className="orbit-dot dot-a" /><div className="orbit-dot dot-b" /><div className="teacher-face">✦</div><div className="orbit-dot dot-c" /></div></div><div className="drop-grid"><FileDrop title="Question Paper" file={questionPaper} inputRef={questionInput} onPick={(file) => handleFile(setQuestionPaper, file)} onRemove={() => setQuestionPaper(null)} /><FileDrop title="Answer Sheet" file={answerSheet} inputRef={answerInput} onPick={(file) => handleFile(setAnswerSheet, file)} onRemove={() => setAnswerSheet(null)} /></div><div className="drop-grid optional-row"><FileDrop title="Marking Scheme" optionalLabel="Optional — grades against this instead of guessing" file={markingScheme} inputRef={schemeInput} onPick={(file) => handleFile(setMarkingScheme, file)} onRemove={() => setMarkingScheme(null)} /></div><div className="start-area"><button className={`start-button ${questionPaper && answerSheet ? 'ready' : ''}`} onClick={startMapping} disabled={!questionPaper || !answerSheet}>Start Mapping <ChevronRight size={18} /></button><p>Once both files are uploaded, you'll be able to map answers with questions</p></div></div><div className="recent-row"><span>Recent mappings</span><span className="muted">No saved mappings yet</span></div></section></main></div>
}

function Topbar() { return <header className="topbar"><button className="icon-button mobile-back" aria-label="Back"><ChevronLeft size={20} /></button><div className="top-title"><strong>VedaAI</strong><span>Exams</span></div><div className="top-actions"><button className="icon-button"><CircleHelp size={19} /></button><button className="icon-button notification"><Bell size={19} /><i /></button><button className="icon-button"><Sparkles size={18} /></button><div className="profile"><div className="avatar">AS</div><span>Arjun Singh</span><ChevronDown size={15} /></div><button className="icon-button mobile-more"><MoreHorizontal size={20} /></button></div></header> }
function Sidebar() { const nav = [[Home, 'Home'], [Users, 'My Classroom'], [BookOpen, 'Assignments'], [FileText, 'Exams'], [Library, 'My Library']]; return <aside className="sidebar"><div className="brand"><div className="brand-mark">V</div><strong>VedaAI</strong></div><button className="toolkit"><Sparkles size={15} /> AI Teacher's Toolkit</button><nav>{nav.map(([Icon, label]) => <button key={label} className={label === 'Exams' ? 'active' : ''}><Icon size={18} /><span>{label}</span></button>)}</nav><button className="settings"><Settings size={18} /><span>Settings</span></button><div className="school-card"><div className="school-icon">DPS</div><div><strong>Delhi Public School</strong><span>Bokaro Steel City</span></div><ChevronDown size={15} /></div></aside> }
function FileDrop({ title, file, inputRef, onPick, onRemove, optionalLabel }) { return <div className={`file-drop ${file ? 'has-file' : ''} ${optionalLabel ? 'optional' : ''}`} onClick={() => !file && inputRef.current?.click()}>{file ? <><div className="file-icon"><FileText size={22} /></div><div className="file-details"><strong>{file.name}</strong><span>{file.size} <b>•</b> {file.pages}</span></div><button className="remove-file" onClick={(event) => { event.stopPropagation(); onRemove() }} aria-label={`Remove ${title}`}><X size={16} /></button></> : <><div className="upload-icon"><Upload size={20} /></div><strong>Upload {title}</strong><span>{optionalLabel || <>PDF, JPG or PNG <b>•</b> Max 10MB</>}</span><button className="browse-button" type="button">Browse files</button><input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => onPick(event.target.files?.[0])} /></>}</div> }

function MappingScreen({ sessionData, activeQuestion, selectQuestion, expanded, setExpanded, mobileTab, setMobileTab, onBack }) {
  const toggle = (id) => setExpanded((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  const questions = sessionData?.questions ?? []
  const activeQ = questions.find((q) => q.id === activeQuestion)

  return (
    <div className="mapping-shell"><Sidebar /><main className="main-area">
      <header className="topbar"><button className="icon-button mobile-back" onClick={onBack} aria-label="Back"><ChevronLeft size={20} /></button><div className="top-title"><strong>VedaAI</strong><span>Exams / Mapping</span></div><div className="top-actions"><button className="icon-button notification"><Bell size={19} /><i /></button><div className="profile"><div className="avatar">AS</div><span>Arjun Singh</span><ChevronDown size={15} /></div></div></header>
      <div className="mobile-tabs"><button className={mobileTab === 'questions' ? 'selected' : ''} onClick={() => setMobileTab('questions')}>Questions</button><button className={mobileTab === 'answers' ? 'selected' : ''} onClick={() => setMobileTab('answers')}>Answer Sheet</button></div>
      <GradingSummaryBar summary={sessionData?.summary} usedMarkingScheme={sessionData?.usedMarkingScheme} />
      <div className="mapping-content">
        <section className={`question-panel ${mobileTab === 'answers' ? 'mobile-hidden' : ''}`}>
          <div className="panel-header"><div><span className="panel-kicker">{questions.length} questions found</span><h2>Extracted Questions</h2><p>Click a question to jump to its answer</p></div></div>
          <div className="question-list">
            {questions.length ? questions.map((q) => (
              <QuestionRow
                key={q.id}
                item={q}
                active={activeQuestion === q.id}
                isExpanded={expanded.includes(q.id)}
                onClick={() => selectQuestion(q.id)}
                onToggle={() => toggle(q.id)}
              />
            )) : <QuestionSkeletons />}
          </div>
        </section>
        <AnswerPanel activeQ={activeQ} sessionData={sessionData} mobileHidden={mobileTab === 'questions'} />
      </div>
    </main></div>
  )
}

function GradingSummaryBar({ summary, usedMarkingScheme }) {
  if (!summary) return null
  const tone = summary.percentage >= 70 ? 'success' : summary.percentage >= 40 ? 'warning' : 'error'
  return (
    <div className="grading-summary">
      <div className={`summary-ring ${tone}`}>
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" className="ring-track" />
          <circle
            cx="32" cy="32" r="28" className="ring-fill"
            strokeDasharray={`${(summary.percentage / 100) * 176} 176`}
          />
        </svg>
        <span>{summary.percentage}%</span>
      </div>
      <div className="summary-body">
        <div className="summary-headline">
          <strong>{summary.totalScore}/{summary.totalMaxMarks} marks</strong>
          <div className="summary-chips">
            <span className="chip success">{summary.correctCount} correct</span>
            <span className="chip warning">{summary.partialCount} partial</span>
            <span className="chip error">{summary.incorrectCount} incorrect</span>
            <span className="chip muted">{summary.unansweredCount} unanswered</span>
            {usedMarkingScheme && <span className="chip success">Graded against marking scheme</span>}
          </div>
        </div>
        <p className="summary-feedback"><Sparkles size={13} /> {summary.overallFeedback}</p>
      </div>
    </div>
  )
}

function QuestionRow({ item, active, isExpanded, onClick, onToggle }) {
  const label = item.answer ? (item.grading ? `${item.grading.score}/${item.max_marks ?? '-'}` : 'Answered') : 'Unanswered'
  return (
    <article className={`question-row ${active ? 'selected' : ''}`}>
      <div className="question-main" onClick={onClick}>
        <span className="number-badge">{item.number}</span>
        <div className="question-copy">
          <p>{item.text}</p>
          {isExpanded && item.grading?.feedback && <div className="feedback"><strong><Sparkles size={13} /> AI Feedback</strong><span>{item.grading.feedback}</span></div>}
        </div>
      </div>
      <div className="question-side">
        <Score tone={scoreTone(item)} score={label} />
        <button className="chevron-button" onClick={onToggle} aria-label="Toggle feedback">{isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
      </div>
    </article>
  )
}
function Score({ tone, score }) { return <span className={`score ${tone}`}>{score}</span> }
function ExtractingScreen() { return <div className="app-shell"><Sidebar /><main className="main-area"><Topbar /><div className="extracting"><div className="extract-icon"><Sparkles size={27} /></div><h1>Extracting<span>...</span></h1><p>Reading your question paper and answer sheet</p><small>This may take a while</small></div></main></div> }
function QuestionSkeletons() { return <div className="skeleton-list"><div className="skeleton-row"><i /><span /><b /></div><div className="skeleton-row"><i /><span /><b /></div><div className="skeleton-row"><i /><span /><b /></div><p>Extraction data is not available yet.</p></div> }

function AnswerPanel({ activeQ, sessionData, mobileHidden }) {
  const [zoom, setZoom] = useState(100)
  const pages = sessionData?.answerSheetPages ?? []
  const bbox = activeQ?.answer?.bbox
  const page = activeQ?.answer?.page ?? 1
  const pageImage = pages[page - 1]

  return (
    <section className={`answer-panel ${mobileHidden ? 'mobile-hidden' : ''}`}>
      <div className="answer-header">
        <div><span className="panel-kicker">Student response</span><h2>Answer Sheet</h2><p>{activeQ ? `Showing answer for Q${activeQ.number}` : 'Select a question to see its answer'}</p></div>
        <div className="zoom-controls">
          <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(50, z - 10))}><Minus size={15} /></button>
          <span>{zoom}%</span>
          <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(200, z + 10))}><Plus size={15} /></button>
        </div>
      </div>
      <div className="paper-stage">
        {pageImage ? (
          <div className="paper-image-wrap" style={{ position: 'relative', width: `${zoom}%`, margin: '0 auto' }}>
            <img src={pageImage} alt={`Answer sheet page ${page}`} style={{ width: '100%', display: 'block' }} />
            {bbox && (
              <div
                style={{
                  position: 'absolute',
                  top: `${bbox[0] / 10}%`,
                  left: `${bbox[1] / 10}%`,
                  height: `${(bbox[2] - bbox[0]) / 10}%`,
                  width: `${(bbox[3] - bbox[1]) / 10}%`,
                  border: '2px solid #22A559',
                  borderRadius: 8,
                  boxShadow: '0 0 0 2px rgba(34,165,89,0.15)'
                }}
              >
                <span style={{ position: 'absolute', top: -18, left: 0, background: '#22A559', color: '#fff', fontSize: 11, padding: '1px 6px', borderRadius: 4 }}>
                  Q{activeQ.number}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="paper-skeleton"><div className="skeleton-paper-line wide" /><div className="skeleton-paper-line" /><div className="skeleton-paper-line medium" /><div className="skeleton-paper-block" /><div className="skeleton-paper-line" /><div className="skeleton-paper-line medium" /></div>
        )}
      </div>
      <div className="page-nav">
        <button aria-label="Previous page" disabled={page <= 1}><ChevronLeft size={18} /></button>
        <strong>Page {page} <span>of {pages.length || '-'}</span></strong>
        <button aria-label="Next page" disabled={page >= pages.length}><ChevronRight size={18} /></button>
      </div>
    </section>
  )
}

export default App