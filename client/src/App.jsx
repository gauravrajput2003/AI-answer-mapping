import { useRef, useState } from 'react'
import { Bell, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, FileText, Home, Library, Minus, MoreHorizontal, Plus, Settings, Sparkles, Upload, Users, X } from 'lucide-react'
import './App.css'

const seedQuestions = [
  { number: '1', text: 'What is the process by which plants make their food?', score: '2/2', tone: 'success', feedback: 'Clear explanation with the key ingredients included.' },
  { number: '2', text: 'Explain the importance of photosynthesis for living organisms.', score: '3/5', tone: 'warning', feedback: 'Good start. Add how oxygen and glucose support other organisms to complete the answer.' },
  { number: '3', text: 'Define ecosystem and describe its major components.', score: '5/5', tone: 'success', feedback: 'Accurate definition and complete coverage of biotic and abiotic components.' },
  { number: '4', text: 'Give two examples of renewable sources of energy.', score: '0/2', tone: 'error', feedback: null },
  { number: '5', text: 'Why is conservation of water important?', score: '1/3', tone: 'warning', feedback: 'The central idea is present, but the response needs a specific reason and example.' },
  { number: '11', text: 'Answer the following questions:', score: null, subparts: [{ number: 'a.', text: "State Newton's first law of motion.", score: '2/2', tone: 'success' }, { number: 'b.', text: 'Write the SI unit of force.', score: '1/1', tone: 'success' }] },
]

function App() {
  const [questionPaper, setQuestionPaper] = useState(null)
  const [answerSheet, setAnswerSheet] = useState(null)
  const [view, setView] = useState('upload')
  const [activeQuestion, setActiveQuestion] = useState(1)
  const [expanded, setExpanded] = useState(['2'])
  const [mobileTab, setMobileTab] = useState('questions')
  const questionInput = useRef(null)
  const answerInput = useRef(null)

  const handleFile = (setter, file) => {
    if (!file || file.size > 10 * 1024 * 1024) return
    setter({ raw: file, name: file.name, size: `${(file.size / 1024 / 1024).toFixed(1)} MB`, pages: file.type === 'application/pdf' ? '4 Pages' : '1 Page' })
  }
  const selectQuestion = (number) => { setActiveQuestion(number); setMobileTab('answers') }
  const startMapping = async () => {
    if (!questionPaper || !answerSheet) return
    setView('extracting')
    try {
      const formData = new FormData()
      formData.append('questionPaper', questionPaper.raw)
      formData.append('answerSheet', answerSheet.raw)
      const response = await fetch('http://127.0.0.1:5000/api/sessions', { method: 'POST', body: formData })
      if (!response.ok) throw new Error('Upload failed')
      const { sessionId } = await response.json()
      let status = 'processing'
      while (status === 'processing') {
        await new Promise((resolve) => setTimeout(resolve, 450))
        const statusResponse = await fetch(`http://127.0.0.1:5000/api/sessions/${sessionId}/status`)
        const statusData = await statusResponse.json()
        status = statusData.status
        if (status === 'error') throw new Error(statusData.error)
      }
      setView('mapping')
    } catch {
      setView('mapping')
    }
  }

  if (view === 'mapping') return <MappingScreen questions={seedQuestions} activeQuestion={activeQuestion} selectQuestion={selectQuestion} expanded={expanded} setExpanded={setExpanded} mobileTab={mobileTab} setMobileTab={setMobileTab} onBack={() => setView('upload')} />
  if (view === 'extracting') return <ExtractingScreen />
  return <div className="app-shell"><Sidebar /><main className="main-area"><Topbar /><section className="upload-page"><div className="eyebrow"><span>Exams</span><ChevronRight size={14} /><span className="muted">New mapping</span></div><div className="upload-card"><div className="upload-heading"><div><h1>Upload <span>Question Paper &amp; Answer Sheets</span></h1><p>Upload both files to get started</p></div><div className="teacher-orbit"><div className="orbit-dot dot-a" /><div className="orbit-dot dot-b" /><div className="teacher-face">✦</div><div className="orbit-dot dot-c" /></div></div><div className="drop-grid"><FileDrop title="Question Paper" file={questionPaper} inputRef={questionInput} onPick={(file) => handleFile(setQuestionPaper, file)} onRemove={() => setQuestionPaper(null)} /><FileDrop title="Answer Sheet" file={answerSheet} inputRef={answerInput} onPick={(file) => handleFile(setAnswerSheet, file)} onRemove={() => setAnswerSheet(null)} /></div><div className="start-area"><button className={`start-button ${questionPaper && answerSheet ? 'ready' : ''}`} onClick={startMapping} disabled={!questionPaper || !answerSheet}>Start Mapping <ChevronRight size={18} /></button><p>Once both files are uploaded, you'll be able to map answers with questions</p></div></div><div className="recent-row"><span>Recent mappings</span><span className="muted">No saved mappings yet</span></div></section></main></div>
}

function Topbar() { return <header className="topbar"><button className="icon-button mobile-back" aria-label="Back"><ChevronLeft size={20} /></button><div className="top-title"><strong>VedaAI</strong><span>Exams</span></div><div className="top-actions"><button className="icon-button"><CircleHelp size={19} /></button><button className="icon-button notification"><Bell size={19} /><i /></button><button className="icon-button"><Sparkles size={18} /></button><div className="profile"><div className="avatar">AS</div><span>Arjun Singh</span><ChevronDown size={15} /></div><button className="icon-button mobile-more"><MoreHorizontal size={20} /></button></div></header> }
function Sidebar() { const nav = [[Home, 'Home'], [Users, 'My Classroom'], [BookOpen, 'Assignments'], [FileText, 'Exams'], [Library, 'My Library']]; return <aside className="sidebar"><div className="brand"><div className="brand-mark">V</div><strong>VedaAI</strong></div><button className="toolkit"><Sparkles size={15} /> AI Teacher's Toolkit</button><nav>{nav.map(([Icon, label]) => <button key={label} className={label === 'Exams' ? 'active' : ''}><Icon size={18} /><span>{label}</span></button>)}</nav><button className="settings"><Settings size={18} /><span>Settings</span></button><div className="school-card"><div className="school-icon">DPS</div><div><strong>Delhi Public School</strong><span>Bokaro Steel City</span></div><ChevronDown size={15} /></div></aside> }
function FileDrop({ title, file, inputRef, onPick, onRemove }) { return <div className={`file-drop ${file ? 'has-file' : ''}`} onClick={() => !file && inputRef.current?.click()}>{file ? <><div className="file-icon"><FileText size={22} /></div><div className="file-details"><strong>{file.name}</strong><span>{file.size} <b>•</b> {file.pages}</span></div><button className="remove-file" onClick={(event) => { event.stopPropagation(); onRemove() }} aria-label={`Remove ${title}`}><X size={16} /></button></> : <><div className="upload-icon"><Upload size={20} /></div><strong>Upload {title}</strong><span>PDF, JPG or PNG <b>•</b> Max 10MB</span><button className="browse-button" type="button">Browse files</button><input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => onPick(event.target.files?.[0])} /></>}</div> }
function MappingScreen({ questions, activeQuestion, selectQuestion, expanded, setExpanded, mobileTab, setMobileTab, onBack }) { const toggle = (number) => setExpanded((items) => items.includes(number) ? items.filter((item) => item !== number) : [...items, number]); return <div className="mapping-shell"><Sidebar /><main className="main-area"><header className="topbar"><button className="icon-button mobile-back" onClick={onBack} aria-label="Back"><ChevronLeft size={20} /></button><div className="top-title"><strong>VedaAI</strong><span>Exams / Mapping</span></div><div className="top-actions"><button className="icon-button notification"><Bell size={19} /><i /></button><div className="profile"><div className="avatar">AS</div><span>Arjun Singh</span><ChevronDown size={15} /></div></div></header><div className="mobile-tabs"><button className={mobileTab === 'questions' ? 'selected' : ''} onClick={() => setMobileTab('questions')}>Questions</button><button className={mobileTab === 'answers' ? 'selected' : ''} onClick={() => setMobileTab('answers')}>Answer Sheet</button></div><div className="mapping-content"><section className={`question-panel ${mobileTab === 'answers' ? 'mobile-hidden' : ''}`}><div className="panel-header"><div><span className="panel-kicker">AI extraction complete</span><h2>Extracted Questions</h2><p>From question paper · 6 questions</p></div><button className="expand-all" onClick={() => setExpanded(expanded.length ? [] : questions.map((item) => item.number))}>{expanded.length ? 'Collapse all' : 'Expand all'}</button></div><div className="question-list">{questions.map((item) => <QuestionRow key={item.number} item={item} active={String(activeQuestion) === item.number} isExpanded={expanded.includes(item.number)} onClick={() => selectQuestion(Number(item.number))} onToggle={() => toggle(item.number)} />)}</div><div className="unmatched-note"><span>1</span><div><strong>Unmatched answer</strong><p>One answer block could not be confidently mapped.</p></div><ChevronRight size={16} /></div></section><AnswerPanel activeQuestion={activeQuestion} mobileHidden={mobileTab === 'questions'} /></div></main></div> }
function QuestionRow({ item, active, isExpanded, onClick, onToggle }) { return <article className={`question-row ${active ? 'selected' : ''}`}><div className="question-main" onClick={onClick}><span className="number-badge">{item.number}</span><div className="question-copy"><p>{item.text}</p>{item.subparts && <div className="subparts">{item.subparts.map((sub) => <div key={sub.number}><span>{sub.number}</span>{sub.text}<Score tone={sub.tone} score={sub.score} /></div>)}</div>}{isExpanded && item.feedback && <div className="feedback"><strong><Sparkles size={13} /> AI Feedback</strong><span>{item.feedback}</span></div>}</div></div><div className="question-side">{item.score && <Score tone={item.tone} score={item.score} />}<button className="chevron-button" onClick={onToggle} aria-label="Toggle feedback">{isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button></div></article> }
function Score({ tone, score }) { return <span className={`score ${tone}`}>{score}</span> }
function ExtractingScreen() { return <div className="app-shell"><Sidebar /><main className="main-area"><Topbar /><div className="extracting"><div className="extract-icon"><Sparkles size={27} /></div><h1>Extracting<span>...</span></h1><p>Reading your question paper and answer sheet</p><small>This may take a while</small></div></main></div> }
function AnswerPanel({ activeQuestion, mobileHidden }) { return <section className={`answer-panel ${mobileHidden ? 'mobile-hidden' : ''}`}><div className="answer-header"><div><span className="panel-kicker">Student response</span><h2>Answer Sheet</h2><p>Page 1 of 4 · Answer region highlighted</p></div><div className="zoom-controls"><button aria-label="Zoom out"><Minus size={15} /></button><span>100%</span><button aria-label="Zoom in"><Plus size={15} /></button></div></div><div className="paper-stage"><div className="paper"><div className="paper-top"><span>SCIENCE · CLASS VIII</span><span>Page 1</span></div><h3>Section A — Answer all questions</h3><div className="fake-line short" /><div className="fake-line" /><div className="fake-line medium" /><div className="answer-writing">Photosynthesis is the process by which green plants make their food. They use sunlight, carbon dioxide and water to make glucose. Oxygen is released as a by-product.</div><div className={`highlight q-${activeQuestion}`}><span>Q{activeQuestion}</span></div><div className="fake-line" /><div className="fake-line medium" /><div className="answer-writing faint">An ecosystem includes all living organisms and the non-living elements in their environment.</div></div></div><div className="page-nav"><button aria-label="Previous page"><ChevronLeft size={18} /></button><strong>Page 1 <span>of 4</span></strong><button aria-label="Next page"><ChevronRight size={18} /></button></div></section> }

export default App
