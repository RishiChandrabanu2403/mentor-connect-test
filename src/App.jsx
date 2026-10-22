import { useState, useEffect, useRef } from 'react'
import './App.css'
import './dark-green-theme.css'
import './welcome-screen-fit.css'
import './portal-polish.css'
import './design-system.css'

function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some(value => value.trim())) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  row.push(field)
  if (row.some(value => value.trim())) rows.push(row)

  if (!rows.length) return []

  const headers = rows[0].map((value, index) =>
    (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim()
  )

  return rows.slice(1).map(values =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        (values[index] || '').trim(),
      ])
    )
  )
}


function mentorProfileText(mentor) {
  return [
    mentor.Domain,
    mentor['Master Sector'],
    mentor['Sectors of Expertise'],
    mentor['Roles of Expertise'],
    mentor.Seniority,
    mentor['AI Sub Domain'],
    mentor['AI Tools of Expertise'],
    mentor['Built AI Product/Automation/Workflow'],
    mentor.Company,
  ].filter(Boolean).join(' ')
}

const MATCH_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'want', 'would', 'like',
  'learn', 'about', 'help', 'from', 'into', 'have', 'how', 'can', 'who',
  'what', 'are', 'you', 'your', 'need', 'work', 'working', 'make', 'please',
  'mentor', 'mentorship', 'someone', 'experience', 'looking', 'career',
  'guidance', 'advice', 'expert', 'experts', 'person', 'people', 'get', 'better',
])

// Map common ways students describe the same career area to a shared concept.
// This is a transparent local matcher; it does not send student messages to an API.
const MATCH_SYNONYMS = {
  ux: ['ux', 'ui', 'uiux', 'user experience', 'user interface', 'usability', 'interaction design', 'product design', 'user research', 'wireframe', 'wireframing', 'prototype', 'prototyping'],
  product: ['product', 'product manager', 'product management', 'roadmap', 'prioritisation', 'prioritization', 'requirements', 'product strategy', 'launch'],
  data: ['data', 'analytics', 'analysis', 'analyst', 'dashboard', 'dashboards', 'reporting', 'business intelligence', 'bi', 'visualisation', 'visualization', 'tableau', 'power bi', 'excel', 'sql'],
  marketing: ['marketing', 'digital marketing', 'seo', 'sem', 'campaign', 'campaigns', 'content marketing', 'social media', 'growth', 'brand', 'hubspot'],
  ai: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'llm', 'llms', 'generative ai', 'genai', 'prompt engineering', 'automation', 'chatbot', 'natural language processing', 'nlp', 'computer vision'],
  software: ['software', 'developer', 'development', 'programming', 'coding', 'engineer', 'engineering', 'full stack', 'frontend', 'front end', 'backend', 'back end', 'web development', 'api'],
  design: ['design', 'designer', 'visual design', 'graphic design', 'figma', 'creative', 'creative direction', 'branding'],
  business: ['business', 'strategy', 'operations', 'consulting', 'entrepreneurship', 'startup', 'startups', 'management'],
  finance: ['finance', 'financial', 'investment', 'accounting', 'fintech', 'valuation', 'banking'],
  hr: ['human resources', 'hr', 'recruitment', 'recruiting', 'talent acquisition', 'people operations'],
  cybersecurity: ['cybersecurity', 'cyber security', 'security', 'penetration testing', 'ethical hacking', 'infosec'],
  cloud: ['cloud', 'aws', 'azure', 'gcp', 'devops', 'infrastructure', 'kubernetes'],
}

const MATCH_FIELD_WEIGHTS = {
  'Roles of Expertise': 3.2,
  'AI Sub Domain': 3.0,
  'AI Tools of Expertise': 2.8,
  'Sectors of Expertise': 2.5,
  'Domain': 2.4,
  'Master Sector': 2.0,
  'Built AI Product/Automation/Workflow': 1.8,
  'Company': 0.35,
  'Seniority': 0.2,
}

function normaliseWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#./ -]/g, ' ')
    .split(/[\s/.-]+/)
    .map(word => word.trim())
    .filter(word => word.length > 1 && !MATCH_STOP_WORDS.has(word))
}

function expandMatchConcepts(value) {
  const text = String(value || '').toLowerCase().replace(/[^a-z0-9+#. -]/g, ' ')
  const concepts = new Set(normaliseWords(text))
  for (const [concept, aliases] of Object.entries(MATCH_SYNONYMS)) {
    if (aliases.some(alias => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
    })) concepts.add(concept)
  }
  return concepts
}

function scoreMentorMatch(query, mentor) {
  const queryText = String(query || '').toLowerCase()
  const queryConcepts = expandMatchConcepts(queryText)
  const profileFields = [
    ['Roles of Expertise', mentor['Roles of Expertise']],
    ['AI Sub Domain', mentor['AI Sub Domain']],
    ['AI Tools of Expertise', mentor['AI Tools of Expertise']],
    ['Sectors of Expertise', mentor['Sectors of Expertise']],
    ['Domain', mentor.Domain],
    ['Master Sector', mentor['Master Sector']],
    ['Built AI Product/Automation/Workflow', mentor['Built AI Product/Automation/Workflow']],
    ['Company', mentor.Company],
    ['Seniority', mentor.Seniority],
  ].filter(([, value]) => value && String(value).trim() && !['n/a', 'na', 'null', 'not available', '-'].includes(String(value).trim().toLowerCase()))

  const evidence = []
  let score = 0
  let hits = 0
  const matchedConcepts = new Set()

  for (const [field, value] of profileFields) {
    const fieldText = String(value).toLowerCase()
    const fieldConcepts = expandMatchConcepts(fieldText)
    const matched = [...queryConcepts].filter(concept => fieldConcepts.has(concept))
    // Exact multiword phrase overlap gives a useful bonus without allowing company names
    // or generic words to dominate the ranking.
    const phraseBonus = queryText.length > 2 && fieldText.includes(queryText) ? 2 : 0
    if (matched.length || phraseBonus) {
      const weight = MATCH_FIELD_WEIGHTS[field] || 1
      // Score each matching field independently. A concept appearing in a generic
    // role must not prevent a more specific Domain/Master Sector match from scoring.
    const fieldScore = matched.length * weight + phraseBonus
      if (fieldScore > 0) {
        score += fieldScore
        hits += matched.length || 1
        matched.forEach(concept => matchedConcepts.add(concept))
        evidence.push({ field, value: String(value).trim(), matchedConcepts: matched, score: fieldScore })
      }
    }
  }

  // For AI-focused requests, prioritise mentors whose primary Domain or Master
  // Sector explicitly says AI over profiles that only mention AI among many roles.
  const asksAboutAI = queryConcepts.has('ai')
  if (asksAboutAI) {
    const primaryDomain = String(mentor.Domain || '').toLowerCase().trim()
    const masterSector = String(mentor['Master Sector'] || '').toLowerCase().trim()
    if (/(^|[^a-z])ai([^a-z]|$)|artificial intelligence/.test(primaryDomain)) {
      score += 10
      evidence.push({ field: 'Domain (direct AI match)', value: String(mentor.Domain).trim(), matchedConcepts: ['ai'], score: 10 })
    }
    if (/(^|[^a-z])ai([^a-z]|$)|artificial intelligence/.test(masterSector)) {
      score += 8
      evidence.push({ field: 'Master Sector (direct AI match)', value: String(mentor['Master Sector']).trim(), matchedConcepts: ['ai'], score: 8 })
    }
  }

  // Reward profiles that cover more than one distinct part of the request, while
  // keeping the result grounded in fields actually present on the mentor profile.
  const coverageBonus = Math.max(0, matchedConcepts.size - 1) * 0.35
  score += coverageBonus
  evidence.sort((a, b) => b.score - a.score)
  return {
    score,
    hits,
    matchedConcepts: [...matchedConcepts],
    evidence: evidence.slice(0, 4),
  }
}


// Local, free semantic search. The model is served from public/models, so the
// browser does not need to download model files from Hugging Face at runtime.
let localEmbeddingPipelinePromise
const localEmbeddingCache = new Map()

async function getLocalEmbeddingPipeline() {
  if (!localEmbeddingPipelinePromise) {
    localEmbeddingPipelinePromise = import('@huggingface/transformers')
      .then(({ pipeline, env }) => {
        env.allowLocalModels = true
        env.allowRemoteModels = false
        env.localModelPath = '/models/'
        return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' })
      })
      .catch(error => {
        localEmbeddingPipelinePromise = null
        throw error
      })
  }
  return localEmbeddingPipelinePromise
}

async function getLocalEmbedding(text) {
  const key = String(text || '').trim()
  if (localEmbeddingCache.has(key)) return localEmbeddingCache.get(key)
  const extractor = await getLocalEmbeddingPipeline()
  const output = await extractor(key, { pooling: 'mean', normalize: true })
  const vector = Array.from(output.data)
  localEmbeddingCache.set(key, vector)
  return vector
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
}

function App() {
  const [mentors, setMentors] = useState([])
  const [students, setStudents] = useState([])
  const [currentMentor, setCurrentMentor] = useState(null)
  const [mentorUsernameInput, setMentorUsernameInput] = useState('')
  const [mentorLoginError, setMentorLoginError] = useState('')
  const [studentsLoading, setStudentsLoading] = useState(true)
  const [studentLoadError, setStudentLoadError] = useState('')
  const [usernameInput, setUsernameInput] = useState('')
  const [studentLoginError, setStudentLoginError] = useState('')
  const [currentStudent, setCurrentStudent] = useState(null)
  const [recommendedMentors, setRecommendedMentors] = useState([])
  const [mentorsLoading, setMentorsLoading] = useState(true)
  const [mentorLoadError, setMentorLoadError] = useState('')
  const [semanticStatus, setSemanticStatus] = useState('ready')
  const [semanticError, setSemanticError] = useState('')
  const [message, setMessage] = useState('')
  const [chat, setChat] = useState([
    {
      sender: 'bot',
      text: "Hi there! I'm your career guide. Tell me what you're working towards or what's holding you back, and I'll help you find a suitable mentor.",
    },
  ])
  const [showMentors, setShowMentors] = useState(false)
  const [selectedRole, setSelectedRole] = useState(null)
  const [activePage, setActivePage] = useState('Dashboard')
  const [adminSection, setAdminSection] = useState('Overview')
  const [adminSearch, setAdminSearch] = useState('')
  const [adminStatusFilter, setAdminStatusFilter] = useState('All statuses')
  const [adminDateFilter, setAdminDateFilter] = useState('')
  const [adminSelectedRecord, setAdminSelectedRecord] = useState(null)
  const [adminNotice, setAdminNotice] = useState('')
  const [pendingAccountAction, setPendingAccountAction] = useState(null)
  const [accountActionReason, setAccountActionReason] = useState('')
  const [adminAudit, setAdminAudit] = useState(() => { try { return JSON.parse(localStorage.getItem('mentorConnectAdminAudit') || '[]') } catch { return [] } })
  const [adminAccountStates, setAdminAccountStates] = useState(() => { try { return JSON.parse(localStorage.getItem('mentorConnectAccountStates') || '{}') } catch { return {} } })
  const [bookedMentor, setBookedMentor] = useState(null)
  const [bookings, setBookings] = useState(() => { try { return JSON.parse(localStorage.getItem('mentorConnectBookings') || '[]') } catch { return [] } })
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [availabilityByMentor, setAvailabilityByMentor] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mentorConnectAvailability') || '{}')
    } catch {
      return {}
    }
  })
  const [availabilityDay, setAvailabilityDay] = useState('Monday')
  const [availabilityStart, setAvailabilityStart] = useState('10:00')
  const [availabilityEnd, setAvailabilityEnd] = useState('11:00')
  const [overrideDate, setOverrideDate] = useState('')
  const [overrideType, setOverrideType] = useState('extra')
  const [overrideStart, setOverrideStart] = useState('10:00')
  const [overrideEnd, setOverrideEnd] = useState('11:00')
  const [availabilityNotice, setAvailabilityNotice] = useState('')
  const [sessionAudioFile, setSessionAudioFile] = useState(null)
  const [transcriptionText, setTranscriptionText] = useState('')
  const [transcriptionStatus, setTranscriptionStatus] = useState('idle')
  const [transcriptionError, setTranscriptionError] = useState('')
  const [transcriptionBooking, setTranscriptionBooking] = useState(null)
  const [sessionSummary, setSessionSummary] = useState('')
  const [sessionActionItems, setSessionActionItems] = useState('')
  const [summaryPublishNotice, setSummaryPublishNotice] = useState('')
  const [publishedSummaries, setPublishedSummaries] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mentorConnectPublishedSummaries') || '[]')
    } catch {
      return []
    }
  })
  const [liveTranscriptStatus, setLiveTranscriptStatus] = useState('idle')
  const [liveTranscriptError, setLiveTranscriptError] = useState('')
  const [liveInterimText, setLiveInterimText] = useState('')
  const recognitionRef = useRef(null)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort()
    }
  }, [])

  useEffect(() => { try { localStorage.setItem('mentorConnectBookings', JSON.stringify(bookings)) } catch (error) { console.warn('Could not save demo bookings locally.', error) } }, [bookings])
  useEffect(() => { try { localStorage.setItem('mentorConnectAdminAudit', JSON.stringify(adminAudit.slice(0, 250))) } catch {} }, [adminAudit])
  useEffect(() => { try { localStorage.setItem('mentorConnectAccountStates', JSON.stringify(adminAccountStates)) } catch {} }, [adminAccountStates])

  function addAdminAudit(action, subject, detail = '') {
    const event = { id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, action, subject, detail, at: new Date().toISOString(), actor: 'Demo Admin' }
    setAdminAudit(previous => [event, ...previous].slice(0, 250))
  }

  function adminSetBookingStatus(booking, status) {
    const reason = window.prompt(`Optional reason for changing this booking to ${status}:`, '')
    if (reason === null) return
    updateBookingStatus(booking.id, status, booking.proposedTime || '')
    addAdminAudit(`Booking status changed to ${status}`, `${booking.student?.Name || booking.studentUsername || 'Student'} → ${booking.mentor?.Name || 'Mentor'}`, reason.trim() || 'No reason entered')
    setAdminNotice(`Booking updated to ${status}. This change is saved in this browser only.`)
  }

  function adminToggleAccount(key, displayName) {
    const next = adminAccountStates[key] === 'Suspended' ? 'Active' : 'Suspended'
    setAccountActionReason('')
    setPendingAccountAction({ key, displayName, next })
  }

  function confirmAccountAction() {
    if (!pendingAccountAction) return
    const { key, displayName, next } = pendingAccountAction
    const reason = accountActionReason.trim()
    if (next === 'Suspended' && !reason) {
      setAdminNotice('Please enter a reason before suspending an account.')
      return
    }
    setAdminAccountStates(previous => ({ ...previous, [key]: next }))
    addAdminAudit(`Account ${next.toLowerCase()}`, displayName, reason || 'Reactivated by admin')
    setAdminNotice(`${displayName} ${next === 'Suspended' ? 'has been suspended' : 'has been reactivated'} in this local prototype.`)
    setPendingAccountAction(null)
    setAccountActionReason('')
  }

  function accountStateForMentor(mentor) {
    const id = mentor?.['Mentor ID'] || mentor?.Name || ''
    return adminAccountStates[`mentor:${String(id).toLowerCase()}`] || 'Active'
  }

  function accountStateForStudent(student) {
    const id = student?.Username || student?.['Student ID'] || student?.Name || ''
    return adminAccountStates[`student:${String(id).toLowerCase()}`] || 'Active'
  }

  useEffect(() => {
    async function loadMentors() {
      try {
        const response = await fetch('/mentors.csv')
        if (!response.ok) throw new Error('Could not find public/mentors.csv.')
        const records = parseCSV(await response.text())
        const validMentors = records.filter(mentor => mentor['Mentor ID'] && mentor.Name)
        if (!validMentors.length) throw new Error('No valid mentor records were found in mentors.csv.')
        setMentors(validMentors)
      } catch (error) {
        console.error('Could not load mentors from CSV:', error)
        setMentorLoadError(error.message || 'Could not load the mentor directory.')
      } finally {
        setMentorsLoading(false)
      }
    }
    loadMentors()
  }, [])

  useEffect(() => {
    if (mentorsLoading) return
    if (mentorLoadError || mentors.length === 0) {
      setSemanticStatus('error')
      setSemanticError(mentorLoadError || 'No mentor profiles are available.')
      return
    }
    setSemanticStatus('ready')
    setSemanticError('')
  }, [mentors, mentorsLoading, mentorLoadError])

  useEffect(() => {
    async function loadStudents() {
      try {
        const response = await fetch('/students.csv')
        if (!response.ok) throw new Error('Could not find public/students.csv.')
        const records = parseCSV(await response.text())
        const validStudents = records.filter(student => student.Username && student.Name)
        if (!validStudents.length) throw new Error('No valid student records were found in students.csv.')
        setStudents(validStudents)
      } catch (error) {
        console.error('Could not load students from CSV:', error)
        setStudentLoadError(error.message || 'Could not load the student dataset.')
      } finally {
        setStudentsLoading(false)
      }
    }
    loadStudents()
  }, [])

  const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const currentMentorId = currentMentor?.['Mentor ID']
  const currentMentorAvailability = currentMentorId
    ? (availabilityByMentor[currentMentorId] || { weekly: {}, overrides: [] })
    : { weekly: {}, overrides: [] }

  function saveMentorAvailability(nextAvailability) {
    if (!currentMentorId) return
    setAvailabilityByMentor(previous => {
      const updated = { ...previous, [currentMentorId]: nextAvailability }
      try {
        localStorage.setItem('mentorConnectAvailability', JSON.stringify(updated))
      } catch (error) {
        console.error('Could not save availability in this browser:', error)
      }
      return updated
    })
    setAvailabilityNotice('Availability saved in this browser.')
  }

  function saveWeeklyAvailability(event) {
    event.preventDefault()
    if (availabilityStart >= availabilityEnd) {
      setAvailabilityNotice('End time must be later than start time.')
      return
    }
    const weekly = {
      ...currentMentorAvailability.weekly,
      [availabilityDay]: { start: availabilityStart, end: availabilityEnd },
    }
    saveMentorAvailability({ ...currentMentorAvailability, weekly })
  }

  function removeWeeklyDay(day) {
    const weekly = { ...currentMentorAvailability.weekly }
    delete weekly[day]
    saveMentorAvailability({ ...currentMentorAvailability, weekly })
  }

  function addDateOverride(event) {
    event.preventDefault()
    if (!overrideDate) {
      setAvailabilityNotice('Choose a date for this exception.')
      return
    }
    if (overrideType === 'extra' && overrideStart >= overrideEnd) {
      setAvailabilityNotice('End time must be later than start time.')
      return
    }
    const overrides = currentMentorAvailability.overrides.filter(item =>
      !(item.date === overrideDate && (overrideType === 'blocked' ? item.type === 'blocked' : item.type === 'extra' && item.start === overrideStart && item.end === overrideEnd))
    )
    overrides.push(overrideType === 'blocked'
      ? { id: `${overrideDate}-blocked-${Date.now()}`, date: overrideDate, type: 'blocked' }
      : { id: `${overrideDate}-${overrideStart}-${Date.now()}`, date: overrideDate, type: 'extra', start: overrideStart, end: overrideEnd })
    saveMentorAvailability({ ...currentMentorAvailability, overrides })
  }

  function removeDateOverride(overrideId) {
    const overrides = currentMentorAvailability.overrides.filter(item => item.id !== overrideId)
    saveMentorAvailability({ ...currentMentorAvailability, overrides })
  }

  function startLiveTranscription() {
    setLiveTranscriptError('')
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setLiveTranscriptStatus('error')
      setLiveTranscriptError('Live speech recognition is not supported in this browser. Try the latest version of Google Chrome.')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'en-IN'
      recognition.continuous = true
      recognition.interimResults = true
      recognitionRef.current = recognition

      recognition.onstart = () => setLiveTranscriptStatus('listening')
      recognition.onresult = event => {
        let finalChunk = ''
        let interimChunk = ''
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index]
          const text = result[0]?.transcript || ''
          if (result.isFinal) finalChunk += text
          else interimChunk += text
        }
        if (finalChunk.trim()) {
          setTranscriptionText(previous => `${previous}${previous && !previous.endsWith(' ') ? ' ' : ''}${finalChunk.trim()} `)
        }
        setLiveInterimText(interimChunk)
      }
      recognition.onerror = event => {
        setLiveTranscriptStatus('error')
        setLiveTranscriptError(event.error === 'not-allowed'
          ? 'Microphone permission was denied. Allow microphone access in your browser settings and try again.'
          : `Speech recognition stopped: ${event.error || 'unknown error'}. You can try starting it again.`)
      }
      recognition.onend = () => {
        setLiveTranscriptStatus(previous => previous === 'listening' ? 'stopped' : previous)
        setLiveInterimText('')
        recognitionRef.current = null
      }
      recognition.start()
    } catch (error) {
      setLiveTranscriptStatus('error')
      setLiveTranscriptError(error.message || 'Could not start live speech recognition.')
    }
  }

  function stopLiveTranscription() {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setLiveTranscriptStatus('stopped')
    setLiveInterimText('')
  }

  function transcribeSessionRecording(event) {
    event.preventDefault()
    setTranscriptionError('')
    if (!sessionAudioFile) {
      setTranscriptionError('Choose an audio recording first.')
      return
    }
    setTranscriptionStatus('idle')
    setTranscriptionError('Automatic transcription of uploaded files requires a separate speech-to-text service. Your selected recording remains available here; use Live transcription to capture speech directly.')
  }

  function publishSessionSummary() {
    if (!transcriptionBooking) {
      setSummaryPublishNotice('Open a booking from Mentor requests before publishing a session summary.')
      return
    }
    if (!sessionSummary.trim()) {
      setSummaryPublishNotice('Write a session summary before publishing it.')
      return
    }
    const summaryRecord = {
      id: `summary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      bookingId: transcriptionBooking.id,
      studentUsername: (transcriptionBooking.studentUsername || '').toLowerCase(),
      studentName: transcriptionBooking.student?.Name || 'Demo Student',
      mentorId: transcriptionBooking.mentorId,
      mentorName: transcriptionBooking.mentor?.Name || currentMentor?.Name || 'Mentor',
      summary: sessionSummary.trim(),
      transcript: transcriptionText.trim(),
      actionItems: sessionActionItems.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
      publishedAt: new Date().toISOString(),
    }
    setPublishedSummaries(previous => {
      const updated = [...previous.filter(item => item.bookingId !== summaryRecord.bookingId), summaryRecord]
      try {
        localStorage.setItem('mentorConnectPublishedSummaries', JSON.stringify(updated))
      } catch (error) {
        console.error('Could not save session summary in this browser:', error)
      }
      return updated
    })
    setSummaryPublishNotice(`Summary published for ${summaryRecord.studentName}. It is now visible in that student's My sessions page in this browser.`)
  }

  function signInStudent(event) {
    event.preventDefault()
    const username = usernameInput.trim().toLowerCase()
    if (studentsLoading) {
      setStudentLoginError('The student directory is still loading. Please try again in a moment.')
      return
    }
    if (studentLoadError) {
      setStudentLoginError('I could not load students.csv. Check that it is saved inside the public folder.')
      return
    }
    const student = students.find(item => (item.Username || '').trim().toLowerCase() === username)
    if (!student) {
      setStudentLoginError('Username not found. Please check the username and try again.')
      return
    }
    setCurrentStudent(student)
    setStudentLoginError('')
    setUsernameInput('')
    setSelectedRole('Student')
    setActivePage('Dashboard')
  }

  function signOutStudent() {
    setCurrentStudent(null)
    setUsernameInput('')
    setStudentLoginError('')
    setSelectedRole(null)
    setActivePage('Dashboard')
  }

  function mentorUsernameFor(mentor) {
    return (mentor?.Name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  function signInMentor(event) {
    event.preventDefault()
    const username = mentorUsernameInput.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (mentorsLoading) {
      setMentorLoginError('The mentor directory is still loading. Please try again in a moment.')
      return
    }
    if (mentorLoadError) {
      setMentorLoginError('I could not load mentors.csv. Check that it is saved inside the public folder.')
      return
    }
    const mentor = mentors.find(item =>
      mentorUsernameFor(item) === username ||
      (item['Mentor ID'] || '').toLowerCase().replace(/[^a-z0-9]/g, '') === username
    )
    if (!mentor) {
      setMentorLoginError('Username not found. Please check the username and try again.')
      return
    }
    if (accountStateForMentor(mentor) === 'Suspended') {
      setMentorLoginError('This mentor account is currently suspended. Please contact the platform administrator.')
      return
    }
    setCurrentMentor(mentor)
    setMentorLoginError('')
    setMentorUsernameInput('')
    setSelectedRole('Mentor')
    setActivePage('Availability')
  }

  function signOutMentor() {
    setCurrentMentor(null)
    setMentorUsernameInput('')
    setMentorLoginError('')
    setSelectedRole(null)
    setActivePage('Dashboard')
  }

 
async function sendMessage(text = message) {
  const clean = String(text || '').trim()
  if (!clean) return

  setChat(previous => [...previous, { sender: 'user', text: clean }])
  setMessage('')
  setRecommendedMentors([])
  setShowMentors(false)

  if (mentorsLoading) {
    setChat(previous => [...previous, {
      sender: 'bot',
      text: 'The mentor directory is still loading. Please try again in a moment.',
    }])
    return
  }

  if (mentorLoadError || mentors.length === 0) {
    setChat(previous => [...previous, {
      sender: 'bot',
      text: 'I could not load the mentor directory. Please refresh the page and try again.',
    }])
    return
  }

  const normalised = clean.toLowerCase().replace(/[.!?]+$/g, '').trim()
  const vaguePhrases = [
    'help me', 'career advice', 'need advice', 'not sure', 'i need help',
    'help with my career', 'what should i do', 'explore careers', 'find a mentor',
    'i need a mentor', 'career guidance',
  ]
  const queryConcepts = expandMatchConcepts(clean)
  const hasSpecificTopic = Object.keys(MATCH_SYNONYMS).some(concept => queryConcepts.has(concept))

  // Short, meaningful topics such as "AI", "UX", or "ML" should still be searched.
  if ((clean.length < 8 && !hasSpecificTopic) || vaguePhrases.includes(normalised)) {
    setChat(previous => [...previous, {
      sender: 'bot',
      text: 'I can help you find a relevant mentor. What are you trying to do or learn? For example, you could say “I want to move into UX design”, “I need help with product management”, or “I want to learn how to use AI in marketing”. You can mention an industry, role, tool, or career change.',
    }])
    return
  }

  const activeMentors = mentors.filter(mentor => accountStateForMentor(mentor) !== 'Suspended')
  let scored = []
  let usedSemanticSearch = false

  try {
    setSemanticStatus('loading')
    const queryVector = await getLocalEmbedding(clean)
    const embedded = await Promise.all(activeMentors.map(async mentor => ({
      mentor,
      semanticScore: cosineSimilarity(queryVector, await getLocalEmbedding(mentorProfileText(mentor))),
      ...scoreMentorMatch(clean, mentor),
    })))
    scored = embedded.sort((a, b) => b.semanticScore - a.semanticScore)
    usedSemanticSearch = true
    setSemanticStatus('ready')
    setSemanticError('')
  } catch (error) {
    console.error('Local semantic model could not be loaded; using keyword matching.', error)
    setSemanticStatus('fallback')
    setSemanticError('The local semantic model could not load, so keyword matching was used instead.')
    scored = activeMentors
      .map(mentor => ({ mentor, ...scoreMentorMatch(clean, mentor), semanticScore: 0 }))
      .filter(result => result.score > 0 && result.hits > 0)
      .sort((a, b) => b.score - a.score)
  }

  // Semantic results use cosine similarity; fallback results require profile evidence.
  const topScore = scored[0]?.[usedSemanticSearch ? 'semanticScore' : 'score'] || 0
  const matches = scored
    .filter(result => usedSemanticSearch
      ? result.semanticScore >= Math.max(0.22, topScore * 0.88)
      : result.score >= Math.max(1.8, topScore * 0.28))
    .slice(0, 3)

  if (!matches.length) {
    setChat(previous => [...previous, {
      sender: 'bot',
      text: 'I couldn’t find a strong match in the available mentor profiles. Could you make your goal more specific—for example, the role you want, a skill or tool you want to learn, or the industry you are interested in? I’d rather ask for clarification than recommend someone based on a weak match.',
    }])
    return
  }

  const recommendations = matches.map(result => {
    const mentor = result.mentor
    const strongestEvidence = result.evidence
      .slice(0, 3)
      .map(({ field, value }) => `${field}: ${value}`)
      .join(' · ')

    const matchedTopics = result.matchedConcepts
      .filter(concept => !MATCH_STOP_WORDS.has(concept))
      .slice(0, 4)
      .join(', ')

    const reason = strongestEvidence
      ? `Why this may fit: your request overlaps with ${strongestEvidence}${matchedTopics ? `. Related topics identified: ${matchedTopics}` : ''}.`
      : 'This profile has some relevant terms, but the fit is not certain. Review the mentor’s listed expertise before booking.'

    // This is a relative ranking score, not a probability of mentoring success.
    // The strongest returned candidate is the 100% reference point for this query.
    const rawMatchScore = usedSemanticSearch ? result.semanticScore : result.score
    const matchPercentage = topScore > 0
      ? Math.max(1, Math.min(100, Math.round((rawMatchScore / topScore) * 100)))
      : 0

    return { ...mentor, reason, semanticScore: result.semanticScore || 0, matchPercentage }
  })

  setRecommendedMentors(recommendations)
  setShowMentors(true)
  setChat(previous => [...previous, {
    sender: 'bot',
    text: `${usedSemanticSearch ? 'I used the local semantic model to compare the meaning of your goal with mentor profiles.' : 'The local semantic model could not load, so I used keyword matching as a fallback.'} Here are the ${recommendations.length} strongest profile matches, ranked by relative match score. 100% means the strongest match in this set for your query; it is not a probability of mentoring success. The explanations show which profile fields support each suggestion.`,
  }])
}

  function requestBooking(mentor) {
    if (accountStateForMentor(mentor) === 'Suspended') {
      setChat(previous => [...previous, { sender: 'bot', text: 'This mentor is currently unavailable for new booking requests. Please choose another mentor.' }])
      return
    }
    if (currentStudent && accountStateForStudent(currentStudent) === 'Suspended') {
      setChat(previous => [...previous, { sender: 'bot', text: 'Your student account is currently suspended, so new booking requests are disabled. Please contact the platform administrator.' }])
      return
    }
    const alreadyRequested = bookings.some(
      booking =>
        booking.mentorId === mentor['Mentor ID'] &&
        booking.studentUsername === (currentStudent?.Username || '').toLowerCase() &&
        booking.status !== 'Declined' &&
        booking.status !== 'Cancelled'
    )

    if (alreadyRequested) {
      setChat(previous => [
        ...previous,
        {
          sender: 'bot',
          text: `You already have an active request for ${mentor.Name}. You can check its status in My sessions.`,
        },
      ])
      return
    }

    const booking = {
      id: `booking-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mentor,
      mentorId: mentor['Mentor ID'],
      student: currentStudent,
      studentUsername: (currentStudent?.Username || '').toLowerCase(),
      status: 'Requested',
      requestedAt: new Date().toISOString(),
      proposedTime: '',
    }

    setBookings(previous => [...previous, booking])
    setBookedMentor(mentor)
    setChat(previous => [
      ...previous,
      {
        sender: 'bot',
        text: `Your booking request to ${mentor.Name} has been created with status: Requested. This is a local demo; no real mentor has been contacted.`,
      },
    ])
  }

  function updateBookingStatus(bookingId, status, proposedTime = '') {
    setBookings(previous =>
      previous.map(booking =>
        booking.id === bookingId
          ? { ...booking, status, proposedTime }
          : booking
      )
    )
  }

  if (selectedRole === null) {
    return (
      <div className="role-selection-page">
        <style>{`
          .role-selection-page { min-height: 100vh; box-sizing: border-box; background: #f6f7fb; display: flex; align-items: center; justify-content: center; padding: 40px 22px; color: #182338; }
          .role-selection-content { width: 100%; max-width: 850px; }
          .role-selection-brand { display: flex; align-items: center; gap: 14px; margin-bottom: 54px; }
          .role-selection-brand .brand-mark { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; color: white; background: #6266d9; font-size: 34px; font-weight: 700; }
          .role-selection-brand strong { display: block; font-size: 24px; letter-spacing: -1px; }
          .role-selection-brand strong span { color: #6266d9; }
          .role-selection-brand small { display: block; color: #8992a5; font-size: 11px; letter-spacing: 2px; margin-top: 4px; }
          .role-selection-heading { margin-bottom: 28px; }
          .role-selection-heading .eyebrow { color: #6266d9; font-weight: 700; letter-spacing: 2px; font-size: 12px; }
          .role-selection-heading h1 { font-size: clamp(32px, 5vw, 48px); line-height: 1.12; letter-spacing: -1.5px; margin: 14px 0; }
          .role-selection-heading p { color: #727d90; font-size: 16px; }
          .role-selection-cards { display: grid; gap: 14px; }
          .role-selection-card { display: flex; align-items: center; gap: 18px; width: 100%; box-sizing: border-box; border: 1px solid #e3e6ef; border-radius: 18px; padding: 20px; text-align: left; background: white; color: inherit; cursor: pointer; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
          button.role-selection-card:hover { transform: translateY(-2px); border-color: #b8baf0; box-shadow: 0 10px 28px #343a6812; }
          .role-selection-icon { width: 54px; height: 54px; border-radius: 16px; display: grid; place-items: center; font-size: 28px; flex-shrink: 0; }
          .student-icon { background: #dff5e9; color: #176b4d; }
          .mentor-icon { background: #e2ebff; color: #315eab; }
          .admin-icon { background: #fff0d8; color: #8b5a16; }
          .role-selection-copy { display: flex; flex-direction: column; gap: 6px; flex: 1; }
          .role-selection-copy strong { font-size: 18px; }
          .role-selection-copy small { color: #727d90; font-size: 14px; line-height: 1.5; }
          .role-selection-arrow { color: #6266d9; font-size: 24px; }
          .role-selection-footer { text-align: center; color: #929aab; letter-spacing: 1.5px; font-size: 10px; margin-top: 30px; }
          .admin-stat-cards { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 24px 0; }
          .admin-stat-cards .role-selection-card { cursor: default; }
          @media (max-width: 600px) { .role-selection-brand { margin-bottom: 35px; } .role-selection-card { padding: 15px; gap: 12px; } .role-selection-icon { width: 46px; height: 46px; } }
        `}</style>
        <div className="role-selection-content">
          <div className="role-selection-brand">
            <div className="brand-mark">m</div>
            <div>
              <strong>mentor<span>connect</span></strong>
              <small>YOUR CAREER, FORWARD</small>
            </div>
          </div>

          <div className="role-selection-heading">
            <div className="eyebrow">WELCOME TO MENTOR CONNECT</div>
            <h1>Every next step starts<br />with a conversation.</h1>
            <p>Choose how you would like to enter the platform.</p>
          </div>

          <div className="role-selection-cards">
            <button className="role-selection-card" onClick={() => { setSelectedRole('Student'); setCurrentStudent(null); setUsernameInput(''); setStudentLoginError(''); setActivePage('Dashboard') }}>
              <span className="role-selection-icon student-icon">♙</span>
              <span className="role-selection-copy">
                <strong>I'm a Student</strong>
                <small>Discover mentors, request sessions and track your growth.</small>
              </span>
              <span className="role-selection-arrow">→</span>
            </button>

            <button className="role-selection-card" onClick={() => { setSelectedRole('Mentor'); setCurrentMentor(null); setMentorUsernameInput(''); setMentorLoginError(''); setActivePage('Mentor requests') }}>
              <span className="role-selection-icon mentor-icon">♧</span>
              <span className="role-selection-copy">
                <strong>I'm a Mentor</strong>
                <small>Manage requests and guide students.</small>
              </span>
              <span className="role-selection-arrow">→</span>
            </button>

            <button className="role-selection-card" onClick={() => { setSelectedRole('Admin'); setActivePage('Admin dashboard') }}>
              <span className="role-selection-icon admin-icon">▣</span>
              <span className="role-selection-copy">
                <strong>I'm an Admin</strong>
                <small>Oversee bookings and review platform activity.</small>
              </span>
              <span className="role-selection-arrow">→</span>
            </button>
          </div>
          <div className="role-selection-footer">DEMO ENVIRONMENT · SELECT A PORTAL TO CONTINUE</div>
        </div>
      </div>
    )
  }

  if (selectedRole === 'Student' && !currentStudent) {
    return (
      <div className="role-selection-page login-split-screen">
        <style>{`
          .login-split-screen { min-height:100vh; width:100%; display:grid; grid-template-columns:minmax(360px, 0.95fr) minmax(360px, 1.05fr); align-items:center; gap:clamp(38px, 7vw, 112px); padding:52px clamp(28px, 7vw, 112px); background:#F5F0E6 !important; }
          .login-split-screen .student-login-card { width:100%; max-width:460px; justify-self:center; background:#fff; border:1px solid #e3e6ef; border-radius:22px; padding:32px; box-shadow:0 16px 44px rgba(31,55,43,.07); }
          .login-brand-panel { max-width:520px; justify-self:start; padding:24px 10px; color:#12372b; }
          .login-brand-lockup { display:flex; align-items:center; gap:16px; margin-bottom:36px; }
          .login-brand-mark { width:66px; height:66px; border-radius:19px; display:grid; place-items:center; background:#fff; color:#0b2b20; font:700 46px Georgia,serif; box-shadow:0 8px 24px rgba(18,55,43,.06); }
          .login-brand-name { font-family:Manrope,sans-serif; font-size:clamp(25px,3vw,36px); font-weight:800; letter-spacing:-1.5px; line-height:1.1; }
          .login-brand-name span { color:#176b4d; }
          .login-brand-tagline { margin-top:9px; color:#74867d; font-size:11px; letter-spacing:2.3px; }
          .login-brand-panel h2 { max-width:500px; margin:0 0 18px; font:700 clamp(32px,4vw,52px)/1.12 Manrope,sans-serif; letter-spacing:-2px; }
          .login-brand-panel h2 span { color:#176b4d; }
          .login-brand-panel p { max-width:430px; margin:0; color:#718078; font-size:16px; line-height:1.8; }
          .login-brand-accent { width:72px; height:5px; border-radius:99px; background:#176b4d; margin-top:30px; }
          .student-login-card h1 { margin:12px 0 8px; font-size:30px; letter-spacing:-1px; }
          .student-login-card p { color:#727d90; font-size:14px; line-height:1.6; }
          .student-login-card label { display:block; font-size:13px; font-weight:700; margin:22px 0 8px; }
          .student-login-card input { width:100%; box-sizing:border-box; border:1px solid #dfe3ed; border-radius:11px; padding:13px 14px; font-size:15px; outline:none; }
          .student-login-card input:focus { border-color:#23845f; box-shadow:0 0 0 3px #23845f18; }
          .student-login-submit { width:100%; margin-top:14px; border:0; border-radius:11px; padding:13px; background:#176b4d; color:#fff; font-weight:700; cursor:pointer; }
          .student-login-error { color:#b42318 !important; background:#fff0ef; border-radius:9px; padding:10px 12px; }
          .student-login-back { margin-top:14px; border:0; background:transparent; color:#176b4d; font-weight:700; cursor:pointer; }
          @media (max-width:800px) { .login-split-screen { grid-template-columns:1fr; gap:24px; padding:28px 18px; } .login-brand-panel { grid-row:1; justify-self:center; text-align:center; padding:8px 0; } .login-brand-lockup { justify-content:center; margin-bottom:18px; } .login-brand-mark { width:48px; height:48px; font-size:34px; border-radius:14px; } .login-brand-panel h2 { font-size:30px; letter-spacing:-1px; } .login-brand-panel p,.login-brand-accent { display:none; } .login-split-screen .student-login-card { grid-row:2; } }
        `}</style>
        <div className="login-brand-panel">
          <div className="login-brand-lockup"><div className="login-brand-mark">m</div><div><div className="login-brand-name">mentor<span>connect</span></div><div className="login-brand-tagline">YOUR CAREER, FORWARD</div></div></div>
          <h2>Every next step starts with <span>a conversation.</span></h2>
          <p>Find the right guidance, turn your goals into a plan, and keep moving forward with Mentor Connect.</p>
          <div className="login-brand-accent" />
        </div>
        <div className="student-login-card">
          <div className="eyebrow">STUDENT PORTAL</div>
          <h1>Welcome back</h1>
          <p>Enter your demo username to open your personalised learning dashboard.</p>
          <form onSubmit={signInStudent}>
            <label htmlFor="student-username">Username</label>
            <input id="student-username" value={usernameInput} onChange={event => {setUsernameInput(event.target.value); setStudentLoginError('')}} placeholder="Enter your username" autoComplete="username" />
            {studentLoginError && <p className="student-login-error" role="alert">{studentLoginError}</p>}
            {studentsLoading && <p>Loading student directory…</p>}
            <button className="student-login-submit" type="submit">Open my dashboard →</button>
          </form>
          <button className="student-login-back" onClick={signOutStudent}>← Back to portal selection</button>
          <p style={{fontSize:12,marginTop:20}}>Demo usernames: chandler, ross, phoebe</p>
        </div>
      </div>
    )
  }

  if (selectedRole === 'Mentor' && !currentMentor) {
    return (
      <div className="role-selection-page login-split-screen">
        <style>{`
          .login-split-screen { min-height:100vh; width:100%; display:grid; grid-template-columns:minmax(360px, 0.95fr) minmax(360px, 1.05fr); align-items:center; gap:clamp(38px, 7vw, 112px); padding:52px clamp(28px, 7vw, 112px); background:#F5F0E6 !important; }
          .login-split-screen .student-login-card { width:100%; max-width:460px; justify-self:center; background:#fff; border:1px solid #e3e6ef; border-radius:22px; padding:32px; box-shadow:0 16px 44px rgba(31,55,43,.07); }
          .login-brand-panel { max-width:520px; justify-self:start; padding:24px 10px; color:#12372b; }
          .login-brand-lockup { display:flex; align-items:center; gap:16px; margin-bottom:36px; }
          .login-brand-mark { width:66px; height:66px; border-radius:19px; display:grid; place-items:center; background:#fff; color:#0b2b20; font:700 46px Georgia,serif; box-shadow:0 8px 24px rgba(18,55,43,.06); }
          .login-brand-name { font-family:Manrope,sans-serif; font-size:clamp(25px,3vw,36px); font-weight:800; letter-spacing:-1.5px; line-height:1.1; }
          .login-brand-name span { color:#176b4d; }
          .login-brand-tagline { margin-top:9px; color:#74867d; font-size:11px; letter-spacing:2.3px; }
          .login-brand-panel h2 { max-width:500px; margin:0 0 18px; font:700 clamp(32px,4vw,52px)/1.12 Manrope,sans-serif; letter-spacing:-2px; }
          .login-brand-panel h2 span { color:#176b4d; }
          .login-brand-panel p { max-width:430px; margin:0; color:#718078; font-size:16px; line-height:1.8; }
          .login-brand-accent { width:72px; height:5px; border-radius:99px; background:#176b4d; margin-top:30px; }
          .student-login-card h1 { margin:12px 0 8px; font-size:30px; letter-spacing:-1px; }
          .student-login-card p { color:#727d90; font-size:14px; line-height:1.6; }
          .student-login-card label { display:block; font-size:13px; font-weight:700; margin:22px 0 8px; }
          .student-login-card input { width:100%; box-sizing:border-box; border:1px solid #dfe3ed; border-radius:11px; padding:13px 14px; font-size:15px; outline:none; }
          .student-login-card input:focus { border-color:#23845f; box-shadow:0 0 0 3px #23845f18; }
          .student-login-submit { width:100%; margin-top:14px; border:0; border-radius:11px; padding:13px; background:#176b4d; color:#fff; font-weight:700; cursor:pointer; }
          .student-login-error { color:#b42318 !important; background:#fff0ef; border-radius:9px; padding:10px 12px; }
          .student-login-back { margin-top:14px; border:0; background:transparent; color:#176b4d; font-weight:700; cursor:pointer; }
          @media (max-width:800px) { .login-split-screen { grid-template-columns:1fr; gap:24px; padding:28px 18px; } .login-brand-panel { grid-row:1; justify-self:center; text-align:center; padding:8px 0; } .login-brand-lockup { justify-content:center; margin-bottom:18px; } .login-brand-mark { width:48px; height:48px; font-size:34px; border-radius:14px; } .login-brand-panel h2 { font-size:30px; letter-spacing:-1px; } .login-brand-panel p,.login-brand-accent { display:none; } .login-split-screen .student-login-card { grid-row:2; } }
        `}</style>
        <div className="login-brand-panel">
          <div className="login-brand-lockup"><div className="login-brand-mark">m</div><div><div className="login-brand-name">mentor<span>connect</span></div><div className="login-brand-tagline">YOUR CAREER, FORWARD</div></div></div>
          <h2>Every next step starts with <span>a conversation.</span></h2>
          <p>Find the right guidance, turn your goals into a plan, and keep moving forward with Mentor Connect.</p>
          <div className="login-brand-accent" />
        </div>
        <div className="student-login-card">
          <div className="eyebrow">MENTOR PORTAL</div>
          <h1>Welcome back</h1>
          <p>Enter your mentor username to review requests assigned to your profile.</p>
          <form onSubmit={signInMentor}>
            <label htmlFor="mentor-username">Username</label>
            <input id="mentor-username" value={mentorUsernameInput} onChange={event => {setMentorUsernameInput(event.target.value); setMentorLoginError('')}} placeholder="Enter mentor username" autoComplete="username" />
            {mentorLoginError && <p className="student-login-error" role="alert">{mentorLoginError}</p>}
            {mentorsLoading && <p>Loading mentor directory…</p>}
            {mentorLoadError && <p className="student-login-error">{mentorLoadError}</p>}
            <button className="student-login-submit" type="submit">Open mentor dashboard →</button>
          </form>
          <button className="student-login-back" onClick={signOutMentor}>← Back to portal selection</button>
          <p style={{fontSize:12,marginTop:20}}>Usernames are derived from the names in mentors.csv. Examples: {mentors.slice(0, 3).map((mentor, index) => <span key={mentor['Mentor ID']}>{index > 0 ? ', ' : ''}{mentorUsernameFor(mentor)}</span>)}. You can also enter the mentor's exact Mentor ID from the CSV.</p>
        </div>
      </div>
    )
  }

  if (selectedRole === 'Admin') {
    const studentsByName = [...students].sort((a, b) => (a.Name || '').localeCompare(b.Name || ''))
    const mentorsByName = [...mentors].sort((a, b) => (a.Name || '').localeCompare(b.Name || ''))
    const filteredBookings = bookings.filter(booking => {
      const haystack = `${booking.student?.Name || ''} ${booking.studentUsername || ''} ${booking.mentor?.Name || ''} ${booking.mentorId || ''} ${booking.status || ''}`.toLowerCase()
      const matchesSearch = haystack.includes(adminSearch.toLowerCase())
      const matchesStatus = adminStatusFilter === 'All statuses' || booking.status === adminStatusFilter
      const bookingDate = (booking.requestedAt || booking.date || '').slice(0, 10)
      const matchesDate = !adminDateFilter || bookingDate === adminDateFilter
      return matchesSearch && matchesStatus && matchesDate
    })
    const pendingCount = bookings.filter(booking => booking.status === 'Requested' || booking.status === 'Reschedule proposed').length
    const completedCount = bookings.filter(booking => booking.status === 'Completed').length
    const summariesForAdmin = publishedSummaries.slice().sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    const adminNav = [
      ['Overview', '▦', 'Overview'], ['Students', '♙', 'Students'], ['Mentors', '♧', 'Mentors'],
      ['Bookings', '▣', 'Bookings'], ['Approvals', '✓', 'Approvals'], ['Session records', '▤', 'Session records'], ['Audit trail', '◷', 'Audit trail']
    ]
    const statusColor = status => status === 'Confirmed' || status === 'Completed' || status === 'Accepted' ? '#176b4d' : status === 'Declined' || status === 'Cancelled' ? '#b54747' : status === 'Reschedule proposed' ? '#9a6700' : '#5473a8'
    const pill = status => <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 99, padding: '5px 9px', fontSize: 11, fontWeight: 750, whiteSpace: 'nowrap', color: statusColor(status), background: `${statusColor(status)}14` }}>{status}</span>
    const panel = { background: '#fff', border: '1px solid #e4ebe6', borderRadius: 16, boxShadow: '0 5px 20px #163c2b08' }
    const muted = { color: '#78857e', fontSize: 12 }
    const field = { width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #dce6df', borderRadius: 10, padding: '11px 12px', background: '#fff', color: '#183328', fontSize: 13, outlineColor: '#2c8b65' }
    const button = { border: '1px solid #dce6df', borderRadius: 10, background: '#fff', color: '#1c4936', padding: '9px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }
    const primaryButton = { ...button, background: '#12382b', color: '#fff', borderColor: '#12382b' }
    const adminHeading = {
      Overview: ['Platform overview', 'A live view of activity across your mentoring community.'],
      Students: ['Student directory', 'Review career goals, progress, mentoring activity, and account status.'],
      Mentors: ['Mentor directory', 'Review expertise, availability, bookings, and mentor account status.'],
      Bookings: ['Booking administration', 'Search, filter, and manage every booking in this local prototype.'],
      Approvals: ['Approval centre', 'Review requests that may need administrative attention.'],
      'Session records': ['Session records', 'Track published summaries and action items from mentoring sessions.'],
      'Audit trail': ['Audit trail', 'Review administrative changes recorded in this browser.']
    }[adminSection] || ['Platform overview', 'Manage Mentor Connect.']
    const renderDirectoryRow = (person, type) => {
      const isStudent = type === 'student'
      const name = person.Name || 'Unnamed profile'
      const id = isStudent ? (person.Username || person['Student ID'] || name) : (person['Mentor ID'] || name)
      const key = `${type}:${String(id).toLowerCase()}`
      const state = adminAccountStates[key] || 'Active'
      const subtitle = isStudent ? (person['Target Role'] || person['Career Goal'] || 'Career goal not set') : [person.Domain, person.Company, person.Seniority].filter(Boolean).join(' · ') || 'Mentor profile'
      return <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,2fr) auto', gap: 14, alignItems: 'center', padding: '15px 18px', borderBottom: '1px solid #edf1ee' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}><div style={{ width: 38, height: 38, borderRadius: 12, background: isStudent ? '#e7f1ff' : '#e5f5ed', color: isStudent ? '#3768a8' : '#176b4d', display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 }}>{name.slice(0,1).toUpperCase()}</div><div style={{ minWidth: 0 }}><strong style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</strong><span style={muted}>{id}</span></div></div>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: '#33483d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div><div style={muted}>{isStudent ? `${person['Sessions Completed'] || 0} sessions completed` : [person.City, person['Master Sector']].filter(Boolean).join(' · ') || 'Expertise not listed'}</div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'end', flexWrap: 'wrap' }}><span style={{ ...muted, color: state === 'Suspended' ? '#b54747' : '#176b4d', fontWeight: 700 }}>{state}</span><button style={button} onClick={() => setAdminSelectedRecord({ type, person })}>View profile</button><button style={button} onClick={() => adminToggleAccount(key, name)}>{state === 'Suspended' ? 'Reactivate' : 'Suspend'}</button></div>
      </div>
    }
    return (
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand"><div className="brand-mark">m</div><div><strong>mentor<span>connect</span></strong><small>YOUR CAREER, FORWARD</small></div></div>
          <div className="sidebar-label">ADMIN WORKSPACE</div>
          {adminNav.map(([label, icon]) => <button key={label} className={`nav-item ${adminSection === label ? 'active' : ''}`} onClick={() => { setAdminSection(label); setAdminSearch(''); setAdminSelectedRecord(null); setAdminNotice('') }}><span style={{ display: 'inline-block', width: 24 }}>{icon}</span>{label}{label === 'Approvals' && pendingCount > 0 && <span style={{ marginLeft: 'auto', background: '#d9f2e5', color: '#176b4d', borderRadius: 99, padding: '2px 7px', fontSize: 11 }}>{pendingCount}</span>}</button>)}
          <div className="sidebar-bottom"><div className="profile-avatar">A</div><div><strong>Demo Admin</strong><small>Admin account</small></div></div>
        </aside>
        <main className="main-content">
          <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {adminSection}</div><div className="topbar-right"><button className="book-button" onClick={() => setSelectedRole(null)}>← Change portal</button><span className="status-dot" /> Prototype mode<div className="top-avatar">A</div></div></header>
          <section style={{ maxWidth: 1500, margin: '0 auto', padding: '36px clamp(18px, 3vw, 44px) 48px', color: '#142b21' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 18, flexWrap: 'wrap', marginBottom: 26 }}><div><div className="eyebrow">ADMINISTRATION / {adminSection.toUpperCase()}</div><h1 style={{ fontSize: 'clamp(26px, 3vw, 36px)', letterSpacing: '-1.2px', margin: '8px 0 7px' }}>{adminHeading[0]}</h1><p style={{ margin: 0, color: '#77857d', fontSize: 14, lineHeight: 1.6 }}>{adminHeading[1]}</p></div><div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}><button style={button} onClick={() => { setAdminSection('Bookings'); setAdminSearch(''); }}>View all bookings ↗</button><button style={primaryButton} onClick={() => { setAdminSection('Approvals'); setAdminNotice('Review the items below and record decisions where appropriate.') }}>Review approvals →</button></div></div>
            {adminNotice && <div role="status" style={{ marginBottom: 18, padding: '12px 15px', borderRadius: 11, background: '#eaf7ef', color: '#176b4d', border: '1px solid #cce8d7', fontSize: 13 }}>{adminNotice}<button style={{ ...button, float: 'right', padding: '3px 8px' }} onClick={() => setAdminNotice('')}>Dismiss</button></div>}
            {pendingAccountAction && <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPendingAccountAction(null) }} style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(10, 28, 21, 0.58)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}><div role="dialog" aria-modal="true" aria-labelledby="account-action-title" style={{ width: 'min(460px, 100%)', background: '#fff', border: '1px solid #e0e9e3', borderRadius: 18, padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,.24)' }}><div style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', background: pendingAccountAction.next === 'Suspended' ? '#fff0f0' : '#e6f5ec', color: pendingAccountAction.next === 'Suspended' ? '#b54747' : '#176b4d', fontSize: 22, marginBottom: 14 }}>{pendingAccountAction.next === 'Suspended' ? '!' : '✓'}</div><h2 id="account-action-title" style={{ margin: '0 0 8px', fontSize: 21, color: '#183328' }}>{pendingAccountAction.next === 'Suspended' ? 'Suspend account?' : 'Reactivate account?'}</h2><p style={{ color: '#718078', fontSize: 13, lineHeight: 1.65, margin: '0 0 16px' }}>{pendingAccountAction.next === 'Suspended' ? `Suspend ${pendingAccountAction.displayName}? They will be blocked from mentor login and new booking requests to their profile will be hidden in this prototype.` : `Reactivate ${pendingAccountAction.displayName}? They will be able to sign in again and appear in mentor recommendations.`}</p><label htmlFor="account-action-reason" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#33483d', marginBottom: 7 }}>Reason {pendingAccountAction.next === 'Suspended' ? '(required)' : '(optional)'}</label><textarea id="account-action-reason" value={accountActionReason} onChange={event => setAccountActionReason(event.target.value)} placeholder={pendingAccountAction.next === 'Suspended' ? 'Enter the reason for suspension…' : 'Add a note about this reactivation…'} rows={3} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: '1px solid #dce6df', borderRadius: 10, padding: 12, font: 'inherit', fontSize: 13, outlineColor: '#2c8b65' }}/><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18, flexWrap: 'wrap' }}><button style={button} onClick={() => { setPendingAccountAction(null); setAccountActionReason('') }}>Cancel</button><button style={{ ...primaryButton, background: pendingAccountAction.next === 'Suspended' ? '#a93434' : '#176b4d', borderColor: pendingAccountAction.next === 'Suspended' ? '#a93434' : '#176b4d' }} onClick={confirmAccountAction}>{pendingAccountAction.next === 'Suspended' ? 'Confirm suspension' : 'Reactivate account'}</button></div></div></div>}
            {adminSelectedRecord && <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAdminSelectedRecord(null) }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(10, 28, 21, 0.58)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}><div role="dialog" aria-modal="true" aria-labelledby="admin-profile-title" style={{ width: 'min(920px, 100%)', maxHeight: 'min(82vh, 780px)', overflowY: 'auto', background: '#fff', border: '1px solid #e0e9e3', borderRadius: 20, boxShadow: '0 24px 80px rgba(0,0,0,.24)' }}><div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(8px)', padding: '20px 24px', borderBottom: '1px solid #edf1ee', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}><div><div className="eyebrow">{adminSelectedRecord.type.toUpperCase()} PROFILE</div><h2 id="admin-profile-title" style={{ margin: '7px 0 5px', fontSize: 23, letterSpacing: '-.4px' }}>{adminSelectedRecord.person.Name || adminSelectedRecord.person.Student || 'Booking details'}</h2><p style={{ ...muted, margin: 0 }}>{adminSelectedRecord.type === 'student' ? adminSelectedRecord.person.Username : adminSelectedRecord.type === 'mentor' ? adminSelectedRecord.person['Mentor ID'] : adminSelectedRecord.person['Booking ID']}</p></div><button style={{ ...button, flexShrink: 0 }} onClick={() => setAdminSelectedRecord(null)}>Close ×</button></div><div style={{ padding: 24 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 12 }}>{Object.entries(adminSelectedRecord.person).filter(([key, value]) => value !== null && value !== undefined && String(value).trim() !== '' && !['Contact','Email','LinkedIn'].includes(key)).map(([key, value]) => <div key={key} style={{ background: '#f7faf8', border: '1px solid #edf2ee', borderRadius: 12, padding: 14, minWidth: 0 }}><div style={{ ...muted, marginBottom: 7 }}>{key}</div><div style={{ fontSize: 13, color: '#183328', overflowWrap: 'anywhere', lineHeight: 1.6 }}>{String(value)}</div></div>)}</div><div style={{ marginTop: 18, fontSize: 11, color: '#859188' }}>Sensitive contact details are hidden in this profile preview.</div></div></div></div>}
            {adminSection === 'Overview' && <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))', gap: 14, marginBottom: 18 }}>
                {[[ 'Students', students.length, 'Student profiles', '♙', '#416da8', 'Students' ], ['Mentors', mentors.length, 'Mentor profiles', '♧', '#176b4d', 'Mentors'], ['All bookings', bookings.length, 'Requests and sessions', '▣', '#8b6a29', 'Bookings'], ['Needs attention', pendingCount, 'Requests / reschedules', '!', '#b36a2d', 'Approvals']].map(([label, value, note, icon, color, target]) => <button key={label} onClick={() => setAdminSection(target)} style={{ ...panel, textAlign: 'left', padding: 19, cursor: 'pointer', color: 'inherit' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 12, color: '#748179', fontWeight: 700 }}>{label}</span><span style={{ width: 35, height: 35, display: 'grid', placeItems: 'center', background: `${color}14`, color, borderRadius: 11, fontWeight: 800 }}>{icon}</span></div><div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', marginTop: 12 }}>{value}</div><div style={{ ...muted, marginTop: 4 }}>{note}</div></button>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(290px,1fr)', gap: 16, alignItems: 'start' }}>
                <div style={{ ...panel, padding: 20 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 15 }}><div><h2 style={{ margin: 0, fontSize: 17 }}>Bookings requiring attention</h2><p style={{ ...muted, margin: '5px 0 0' }}>Pending requests and reschedule proposals</p></div><button style={button} onClick={() => setAdminSection('Bookings')}>View all</button></div>
                  {bookings.filter(b => ['Requested','Reschedule proposed'].includes(b.status)).slice(0,5).map(booking => <div key={booking.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '13px 0', borderTop: '1px solid #edf1ee' }}><div style={{ minWidth: 0 }}><strong style={{ display: 'block', fontSize: 13 }}>{booking.student?.Name || booking.studentUsername || 'Student'} <span style={{ color: '#8a978f', fontWeight: 400 }}>→</span> {booking.mentor?.Name || 'Mentor'}</strong><span style={muted}>{booking.requestedAt ? new Date(booking.requestedAt).toLocaleDateString() : 'Date not set'}</span></div>{pill(booking.status)}</div>)}
                  {!bookings.some(b => ['Requested','Reschedule proposed'].includes(b.status)) && <div style={{ padding: '28px 10px', textAlign: 'center', color: '#7c8981', fontSize: 13 }}>No pending booking requests right now.</div>}
                </div>
                <div style={{ ...panel, padding: 20 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 13 }}><div><h2 style={{ margin: 0, fontSize: 17 }}>Recent admin activity</h2><p style={{ ...muted, margin: '5px 0 0' }}>Latest local changes</p></div><button style={button} onClick={() => setAdminSection('Audit trail')}>Audit trail</button></div>
                  {adminAudit.slice(0,5).map(item => <div key={item.id} style={{ padding: '12px 0', borderTop: '1px solid #edf1ee' }}><strong style={{ display: 'block', fontSize: 12 }}>{item.action}</strong><div style={{ ...muted, marginTop: 3 }}>{item.subject}</div><div style={{ ...muted, marginTop: 4 }}>{new Date(item.at).toLocaleString()}</div></div>)}
                  {!adminAudit.length && <div style={{ padding: '23px 0', color: '#7c8981', fontSize: 13 }}>Admin actions will appear here as you manage records.</div>}
                </div>
              </div>
              <div style={{ ...panel, padding: 20, marginTop: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div><h2 style={{ margin: 0, fontSize: 17 }}>Session outcomes</h2><p style={{ ...muted, margin: '5px 0 0' }}>Published summaries and completed mentoring sessions</p></div><button style={button} onClick={() => setAdminSection('Session records')}>Review records</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 18 }}><div style={{ background: '#f6faf7', borderRadius: 11, padding: 14 }}><div style={{ fontSize: 24, fontWeight: 800 }}>{completedCount}</div><div style={muted}>Completed sessions</div></div><div style={{ background: '#f6faf7', borderRadius: 11, padding: 14 }}><div style={{ fontSize: 24, fontWeight: 800 }}>{publishedSummaries.length}</div><div style={muted}>Published summaries</div></div><div style={{ background: '#f6faf7', borderRadius: 11, padding: 14 }}><div style={{ fontSize: 24, fontWeight: 800 }}>{adminAudit.length}</div><div style={muted}>Audit events</div></div></div></div>
            </>}
            {adminSection === 'Students' && <div style={panel}><div style={{ padding: 18, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf1ee' }}><div><h2 style={{ margin: 0, fontSize: 17 }}>All students <span style={{ color: '#78857e', fontSize: 13 }}>({students.length})</span></h2><p style={{ ...muted, margin: '5px 0 0' }}>Profiles loaded from students.csv</p></div><input style={{ ...field, maxWidth: 310 }} value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Search name, username, or goal…" /></div>{studentsByName.filter(person => `${person.Name} ${person.Username} ${person['Career Goal']} ${person['Target Role']}`.toLowerCase().includes(adminSearch.toLowerCase())).map(person => renderDirectoryRow(person,'student'))}{!studentsByName.length && <p style={{ padding: 20, color: '#78857e' }}>Student directory is loading or unavailable.</p>}</div>}
            {adminSection === 'Mentors' && <div style={panel}><div style={{ padding: 18, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf1ee' }}><div><h2 style={{ margin: 0, fontSize: 17 }}>All mentors <span style={{ color: '#78857e', fontSize: 13 }}>({mentors.length})</span></h2><p style={{ ...muted, margin: '5px 0 0' }}>Profiles loaded from mentors.csv</p></div><input style={{ ...field, maxWidth: 310 }} value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Search name, domain, company…" /></div>{mentorsByName.filter(person => `${person.Name} ${person['Mentor ID']} ${person.Domain} ${person.Company} ${person['Master Sector']} ${person['Roles of Expertise']}`.toLowerCase().includes(adminSearch.toLowerCase())).map(person => renderDirectoryRow(person,'mentor'))}{!mentorsByName.length && <p style={{ padding: 20, color: '#78857e' }}>Mentor directory is loading or unavailable.</p>}</div>}
            {adminSection === 'Bookings' && <div style={panel}><div style={{ padding: 18, borderBottom: '1px solid #edf1ee' }}><h2 style={{ margin: '0 0 5px', fontSize: 17 }}>All bookings <span style={{ color: '#78857e', fontSize: 13 }}>({filteredBookings.length})</span></h2><p style={{ ...muted, margin: '0 0 14px' }}>Administrative status changes are recorded in the local audit trail.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}><input style={field} value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Search student or mentor…"/><select style={field} value={adminStatusFilter} onChange={e => setAdminStatusFilter(e.target.value)}>{['All statuses','Requested','Accepted','Declined','Reschedule proposed','Confirmed','Completed','Cancelled'].map(status => <option key={status}>{status}</option>)}</select><input style={field} type="date" value={adminDateFilter} onChange={e => setAdminDateFilter(e.target.value)} aria-label="Filter booking date"/></div></div>
                {filteredBookings.map(booking => <div key={booking.id} style={{ padding: 18, borderBottom: '1px solid #edf1ee', display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(220px,auto)', gap: 14, alignItems: 'center' }}><div><strong style={{ fontSize: 13 }}>{booking.student?.Name || booking.studentUsername || 'Student'} <span style={{ color: '#87948c', fontWeight: 400 }}>→</span> {booking.mentor?.Name || 'Mentor'}</strong><div style={{ ...muted, marginTop: 5 }}>Requested {booking.requestedAt ? new Date(booking.requestedAt).toLocaleString() : 'date not recorded'}</div>{booking.proposedTime && <div style={{ ...muted, marginTop: 4 }}>Proposed time: {booking.proposedTime}</div>}</div><div>{pill(booking.status)}</div><div style={{ display: 'flex', justifyContent: 'end', gap: 7, flexWrap: 'wrap' }}><button style={button} onClick={() => setAdminSelectedRecord({ type: 'booking', person: { 'Booking ID': booking.id, Student: booking.student?.Name || booking.studentUsername, Mentor: booking.mentor?.Name, Status: booking.status, 'Requested at': booking.requestedAt, 'Proposed time': booking.proposedTime || '—' } })}>Details</button><select aria-label="Change booking status" style={{ ...field, width: 160, padding: '8px 9px' }} value={booking.status} onChange={e => adminSetBookingStatus(booking,e.target.value)}>{['Requested','Accepted','Declined','Reschedule proposed','Confirmed','Completed','Cancelled'].map(status => <option key={status}>{status}</option>)}</select></div></div>)}
                {!filteredBookings.length && <div style={{ textAlign: 'center', padding: '42px 20px', color: '#78857e' }}><div style={{ fontSize: 28, marginBottom: 8 }}>▣</div><strong style={{ color: '#30483b' }}>No bookings match these filters</strong><p style={{ fontSize: 13 }}>Booking records created in this browser will appear here.</p><button style={button} onClick={() => { setAdminSearch(''); setAdminStatusFilter('All statuses'); setAdminDateFilter('') }}>Clear filters</button></div>}</div>}
            {adminSection === 'Approvals' && <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(280px,0.8fr)', gap: 16, alignItems: 'start' }}><div style={panel}><div style={{ padding: 18, borderBottom: '1px solid #edf1ee' }}><h2 style={{ margin: 0, fontSize: 17 }}>Booking requests needing review</h2><p style={{ ...muted, margin: '5px 0 0' }}>Review requests and proposed reschedules. Actions update local demo records.</p></div>{bookings.filter(b => ['Requested','Reschedule proposed'].includes(b.status)).map(booking => <div key={booking.id} style={{ padding: 17, borderBottom: '1px solid #edf1ee' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}><div><strong style={{ fontSize: 13 }}>{booking.student?.Name || booking.studentUsername || 'Student'} → {booking.mentor?.Name || 'Mentor'}</strong><div style={{ ...muted, marginTop: 5 }}>{booking.requestedAt ? new Date(booking.requestedAt).toLocaleString() : 'Date not recorded'}</div></div>{pill(booking.status)}</div><div style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap' }}><button style={primaryButton} onClick={() => adminSetBookingStatus(booking,'Confirmed')}>Approve / confirm</button><button style={button} onClick={() => adminSetBookingStatus(booking,'Declined')}>Reject request</button><button style={button} onClick={() => setAdminSection('Bookings')}>Open booking</button></div></div>)}{!bookings.some(b => ['Requested','Reschedule proposed'].includes(b.status)) && <div style={{ padding: 30, textAlign: 'center', color: '#78857e' }}>No booking requests are currently awaiting review.</div>}</div><div style={{ ...panel, padding: 20 }}><h2 style={{ margin: 0, fontSize: 17 }}>Account controls</h2><p style={{ ...muted, lineHeight: 1.6 }}>Use the Students and Mentors directories to inspect profiles and suspend/reactivate an account in this prototype. Each change asks for a reason and appears in the audit trail.</p><button style={button} onClick={() => setAdminSection('Students')}>Manage students</button><button style={{ ...button, marginLeft: 8 }} onClick={() => setAdminSection('Mentors')}>Manage mentors</button><div style={{ marginTop: 20, padding: 14, borderRadius: 11, background: '#fff7e8', color: '#8a611d', fontSize: 12, lineHeight: 1.6 }}>Prototype limitation: these decisions are stored in this browser only and are not secure account enforcement until a backend is connected.</div></div></div>}
            {adminSection === 'Session records' && <div style={panel}><div style={{ padding: 18, borderBottom: '1px solid #edf1ee' }}><h2 style={{ margin: 0, fontSize: 17 }}>Published session summaries ({summariesForAdmin.length})</h2><p style={{ ...muted, margin: '5px 0 0' }}>Summary records saved by mentors in this browser.</p></div>{summariesForAdmin.map(item => <div key={item.id || item.bookingId} style={{ padding: 18, borderBottom: '1px solid #edf1ee' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong style={{ fontSize: 13 }}>{item.studentName || item.studentUsername || 'Student'} <span style={{ color: '#87948c' }}>← session with</span> {item.mentorName || 'Mentor'}</strong><div style={muted}>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'Publication date not recorded'}</div></div><span style={{ ...muted, alignSelf: 'center' }}>{(item.actionItems || []).length} action items</span></div><p style={{ fontSize: 13, lineHeight: 1.65, color: '#43574b', marginBottom: 0 }}>{item.summary || 'No summary text.'}</p>{item.actionItems?.length > 0 && <ul style={{ fontSize: 12, color: '#68776e', lineHeight: 1.7 }}>{item.actionItems.map((task,i) => <li key={i}>{task}</li>)}</ul>}</div>)}{!summariesForAdmin.length && <div style={{ textAlign: 'center', padding: 38, color: '#78857e' }}>Published summaries will appear here after a mentor publishes one.</div>}</div>}
            {adminSection === 'Audit trail' && <div style={panel}><div style={{ padding: 18, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #edf1ee' }}><div><h2 style={{ margin: 0, fontSize: 17 }}>Administrative activity ({adminAudit.length})</h2><p style={{ ...muted, margin: '5px 0 0' }}>Newest events first. Stored locally in this browser.</p></div><button style={button} onClick={() => { if (window.confirm('Clear the local audit trail? This cannot be undone.')) { setAdminAudit([]); setAdminNotice('Local audit trail cleared.') } }}>Clear history</button></div>{adminAudit.map(item => <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 14, padding: '15px 18px', borderBottom: '1px solid #edf1ee' }}><div><strong style={{ display: 'block', fontSize: 13 }}>{item.action}</strong><div style={{ fontSize: 12, color: '#56685d', marginTop: 4 }}>{item.subject}</div>{item.detail && <div style={{ ...muted, marginTop: 4 }}>Reason: {item.detail}</div>}<div style={muted}>By {item.actor || 'Demo Admin'}</div></div><div style={{ ...muted, textAlign: 'right' }}>{new Date(item.at).toLocaleString()}</div></div>)}{!adminAudit.length && <div style={{ textAlign: 'center', padding: 38, color: '#78857e' }}>No admin actions recorded yet. Changes made in the directories and bookings pages will appear here.</div>}</div>}
            <div style={{ marginTop: 18, fontSize: 11, color: '#859188', lineHeight: 1.6 }}>Prototype mode: records and admin actions are stored in this browser only. This is useful for demonstrating the workflow, but it is not shared or secure multi-user authorisation.</div>
          </section>
        </main>
        <style>{`@media(max-width:900px){.main-content>section{padding:24px 16px!important}} @media(max-width:720px){.admin-directory-row{grid-template-columns:1fr!important}}`}</style>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">m</div>
          <div>
            <strong>mentor<span>connect</span></strong>
            <small>YOUR CAREER, FORWARD</small>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        {(selectedRole === 'Mentor'
          ? ['Mentor requests', 'Call workspace', 'Availability']
          : ['Dashboard', 'Discover', 'My sessions', 'My action plan']
        ).map((page) => (
          <button
            key={page}
            className={`nav-item ${activePage === page ? 'active' : ''}`}
            onClick={() => setActivePage(page)}
          >
            <span>{{
              Dashboard: '▦',
              Discover: '✳',
              'My sessions': '◷',
              'Mentor requests': '↔',
              Availability: '▦',
              'Call workspace': '♫',
              'My action plan': '✓',
            }[page]}</span>
            {page}
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="profile-avatar">{selectedRole === 'Mentor' ? (currentMentor?.Name || 'M').slice(0, 1).toUpperCase() : (currentStudent?.Name || 'S').slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{selectedRole === 'Mentor' ? (currentMentor?.Name || 'Mentor') : (currentStudent?.Name || 'Demo Student')}</strong>
            <small>{selectedRole === 'Mentor' ? 'Mentor account' : 'Student account'}</small>
          </div>
          <span className="profile-dots">···</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> {activePage}</div>
          <div className="topbar-right">
            <button className="book-button" onClick={selectedRole === 'Mentor' ? signOutMentor : signOutStudent}>↪ Log out</button>
            <span className="status-dot" />
            Prototype mode
            <div className="top-avatar">{selectedRole === 'Mentor' ? (currentMentor?.Name || 'M').slice(0, 1).toUpperCase() : (currentStudent?.Name || 'S').slice(0, 1).toUpperCase()}</div>
          </div>
        </header>

        {activePage === 'Dashboard' && selectedRole === 'Student' && (
          <section className="student-dashboard">
            <style>{`
              .student-dashboard { padding: 34px 38px 48px; color: #19243a; }
              .student-dashboard * { box-sizing: border-box; }
              .dashboard-topline { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:26px; }
              .dashboard-topline h1 { font-size:clamp(28px,3vw,36px); line-height:1.15; letter-spacing:-1.1px; margin:8px 0 9px; }
              .dashboard-topline p { margin:0; color:#7b8496; font-size:14px; }
              .dashboard-date-wrap { position:relative; flex-shrink:0; z-index:5; }
              .dashboard-date { display:flex; align-items:center; gap:11px; border:1px solid #e5eae7; background:#fff; padding:12px 15px; border-radius:14px; color:#254537; font:inherit; text-align:left; cursor:pointer; box-shadow:0 3px 12px rgba(17,55,40,.035); transition:border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
              .dashboard-date:hover { border-color:#b7d8c6; box-shadow:0 7px 20px rgba(17,55,40,.08); transform:translateY(-1px); }
              .dashboard-date:focus-visible { outline:3px solid #16a87955; outline-offset:3px; }
              .dashboard-date-icon { width:38px; height:38px; display:grid; place-items:center; border-radius:11px; background:#eaf6ef; color:#176b4d; font-size:20px; }
              .dashboard-date-copy { display:flex; flex-direction:column; gap:3px; }
              .dashboard-date-copy strong { font-size:13px; font-weight:700; color:#173b2c; }
              .dashboard-date-copy small { font-size:11px; color:#7b8b82; }
              .dashboard-notification-count { display:grid; place-items:center; min-width:21px; height:21px; padding:0 5px; border-radius:99px; background:#176b4d; color:white; font-size:10px; font-weight:700; }
              .notification-popover { position:absolute; top:calc(100% + 12px); right:0; width:min(350px, calc(100vw - 36px)); background:#fff; border:1px solid #e3e9e5; border-radius:16px; padding:18px; box-shadow:0 18px 50px rgba(17,55,40,.16); animation:notification-enter .16s ease-out; }
              @keyframes notification-enter { from { opacity:0; transform:translateY(-5px); } to { opacity:1; transform:translateY(0); } }
              .notification-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
              .notification-header strong { color:#173b2c; font-size:15px; }
              .notification-header button { border:0; background:#f2f6f3; color:#52665b; border-radius:8px; width:28px; height:28px; font-size:18px; }
              .notification-date { color:#859187; font-size:11px; margin-bottom:14px; }
              .notification-item { display:flex; align-items:flex-start; gap:11px; padding:12px 0; border-top:1px solid #eff2f0; }
              .notification-item-icon { display:grid; place-items:center; width:34px; height:34px; flex-shrink:0; border-radius:10px; background:#edf7f0; color:#176b4d; font-size:16px; }
              .notification-item-copy { min-width:0; flex:1; }
              .notification-item-copy strong { display:block; color:#263d31; font-size:12px; line-height:1.45; }
              .notification-item-copy small { display:block; color:#829087; font-size:11px; line-height:1.5; margin-top:4px; }
              .notification-item-action { border:0; background:transparent; color:#176b4d; padding:4px 0; font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap; }
              .notification-empty { padding:18px 10px 12px; text-align:center; }
              .notification-empty-icon { display:grid; place-items:center; width:44px; height:44px; margin:0 auto 10px; border-radius:14px; background:#edf7f0; color:#176b4d; font-size:22px; }
              .notification-empty strong { display:block; font-size:13px; color:#263d31; }
              .notification-empty p { color:#829087; font-size:11px; line-height:1.6; margin:6px 0 0; }
              .dashboard-stat-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-bottom:24px; }
              .dashboard-stat { background:#fff; border:1px solid #e9ebf3; border-radius:17px; padding:20px; min-height:138px; box-shadow:0 4px 16px #26365b05; }
              .dashboard-stat-head { display:flex; justify-content:space-between; align-items:center; gap:8px; color:#7b8496; font-size:12px; }
              .dashboard-stat-icon { width:36px; height:36px; border-radius:11px; display:grid; place-items:center; font-size:18px; }
              .dashboard-stat strong { display:block; font-size:30px; letter-spacing:-1px; margin:12px 0 3px; }
              .dashboard-stat small { color:#7b8496; font-size:12px; }
              .dashboard-columns { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(280px,.85fr); gap:20px; align-items:start; }
              .dashboard-panel { background:#fff; border:1px solid #e9ebf3; border-radius:18px; padding:22px; margin-bottom:20px; min-width:0; }
              .dashboard-panel-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; }
              .dashboard-panel-heading h2 { margin:0; font-size:17px; letter-spacing:-.3px; }
              .dashboard-link { border:0; background:transparent; color:#6266d9; font-weight:700; font-size:12px; cursor:pointer; }
              .course-row { display:flex; align-items:center; gap:14px; padding:14px 0; border-top:1px solid #f0f1f6; }
              .course-row:first-of-type { border-top:0; padding-top:0; }
              .course-art { width:54px; height:54px; border-radius:14px; display:grid; place-items:center; flex-shrink:0; font-size:22px; }
              .course-copy { flex:1; min-width:0; }
              .course-copy strong { display:block; font-size:13px; margin-bottom:5px; }
              .course-copy small { color:#8a92a2; font-size:11px; }
              .course-progress { width:100%; height:5px; border-radius:99px; background:#eef0f6; margin-top:9px; overflow:hidden; }
              .course-progress span { display:block; height:100%; border-radius:99px; background:#7779df; }
              .course-percent { font-size:11px; font-weight:700; color:#6266d9; white-space:nowrap; }
              .activity-row { display:flex; align-items:flex-start; gap:12px; padding:13px 0; border-top:1px solid #f0f1f6; }
              .activity-dot { width:32px; height:32px; border-radius:10px; display:grid; place-items:center; flex-shrink:0; background:#edf8f2; color:#23865d; }
              .activity-copy { flex:1; }
              .activity-copy strong { display:block; font-size:12px; margin-bottom:4px; }
              .activity-copy small { color:#8a92a2; font-size:11px; }
              .activity-status { color:#25845f; background:#e9f7ef; border-radius:99px; padding:5px 8px; font-size:10px; white-space:nowrap; }
              .skill-chip-list { display:flex; flex-wrap:wrap; gap:8px; }
              .skill-chip { display:inline-flex; align-items:center; border:1px solid #e1e9e4; background:#f2f8f4; color:#28674c; border-radius:999px; padding:8px 11px; font-size:12px; font-weight:600; }
              .career-role { display:flex; align-items:flex-start; gap:12px; }
              .career-role-icon { display:grid; place-items:center; flex-shrink:0; width:42px; height:42px; border-radius:13px; background:#e8f5ed; color:#23845f; font-size:20px; }
              .career-role strong { display:block; font-size:15px; margin-bottom:5px; }
              .career-role p { color:#7b8496; font-size:12px; line-height:1.55; margin:0; }
              .milestone-card { background:#f2f8f4; border:1px solid #dceee2; border-radius:14px; padding:16px; margin-top:16px; }
              .milestone-card small { display:block; color:#63816f; font-size:10px; font-weight:800; letter-spacing:1px; margin-bottom:7px; text-transform:uppercase; }
              .milestone-card strong { display:block; color:#245c43; font-size:13px; line-height:1.5; }
              .action-item-row { display:flex; align-items:flex-start; gap:10px; padding:12px 0; border-top:1px solid #f0f1f6; }
              .action-item-row:first-of-type { border-top:0; padding-top:0; }
              .action-item-bullet { width:25px; height:25px; display:grid; place-items:center; flex-shrink:0; border-radius:8px; background:#edf8f2; color:#23865d; font-size:12px; }
              .action-item-copy { font-size:12px; line-height:1.5; color:#303b50; }
              .mentor-cta { background:#F5EBD7; border:1px solid #E8D9B9; border-radius:16px; padding:20px; }
              .mentor-cta h3 { color:#24372C; font-size:15px; margin:0 0 8px; }
              .mentor-cta p { color:#655B49; font-size:12px; line-height:1.6; margin:0 0 15px; }
              .mentor-cta button { border:0; border-radius:10px; background:#173D32; color:white; font-weight:700; padding:11px 14px; cursor:pointer; }
              .dashboard-note { color:#9299a8; font-size:10px; margin:4px 0 0; }
              @media (max-width:1050px) { .dashboard-stat-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .dashboard-columns { grid-template-columns:1fr; } }
              @media (max-width:650px) { .student-dashboard { padding:24px 16px; } .dashboard-topline { display:block; } .dashboard-date-wrap { display:inline-block; margin-top:16px; } .dashboard-stat-grid { gap:10px; } .dashboard-stat { padding:14px; min-height:125px; } .dashboard-stat strong { font-size:25px; } .dashboard-panel { padding:16px; } }
            `}</style>
            <div className="dashboard-topline">
              <div>
                <div className="eyebrow">STUDENT OVERVIEW</div>
                <h1>Welcome, {currentStudent?.Name || 'Student'} <span style={{ color: '#23845f' }}>↗</span></h1>
                <p>Here's a snapshot of your learning, projects and career progress.</p>
              </div>
              <div className="dashboard-date-wrap">
                {(() => {
                  const studentBookings = bookings.filter(booking => booking.studentUsername === (currentStudent?.Username || '').toLowerCase())
                  const needsAttention = studentBookings.filter(booking => ['Requested', 'Accepted', 'Reschedule proposed'].includes(booking.status))
                  const actionItems = (currentStudent?.['Action Items'] || '').split(';').map(item => item.trim()).filter(Boolean)
                  const notificationCount = needsAttention.length + (actionItems.length ? 1 : 0)
                  const today = new Date()
                  const dateLabel = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  return <>
                    <button className="dashboard-date" type="button" aria-expanded={notificationsOpen} aria-label="Open calendar and notifications" onClick={() => setNotificationsOpen(open => !open)}>
                      <span className="dashboard-date-icon" aria-hidden="true">▦</span>
                      <span className="dashboard-date-copy"><strong>Calendar & updates</strong><small>{dateLabel}</small></span>
                      {notificationCount > 0 && <span className="dashboard-notification-count">{notificationCount}</span>}
                    </button>
                    {notificationsOpen && <div className="notification-popover" role="dialog" aria-label="Calendar and notifications">
                      <div className="notification-header"><strong>Calendar & updates</strong><button type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)}>×</button></div>
                      <div className="notification-date">Today · {dateLabel}</div>
                      {needsAttention.length === 0 && actionItems.length === 0 ? <div className="notification-empty"><div className="notification-empty-icon">✓</div><strong>You're all caught up</strong><p>New session updates and action items will appear here.</p></div> : <>
                        {needsAttention.map(booking => <div className="notification-item" key={booking.id}><span className="notification-item-icon" aria-hidden="true">◷</span><div className="notification-item-copy"><strong>{booking.status === 'Reschedule proposed' ? 'A new session time was proposed' : booking.status === 'Accepted' ? 'Your session request was accepted' : 'Your mentor request is pending'}</strong><small>{booking.mentor?.Name || 'Your mentor'} · {booking.status}{booking.proposedTime ? ` · ${booking.proposedTime}` : ''}</small></div><button className="notification-item-action" type="button" onClick={() => { setActivePage('My sessions'); setNotificationsOpen(false) }}>View</button></div>)}
                        {actionItems.length > 0 && <div className="notification-item"><span className="notification-item-icon" aria-hidden="true">✓</span><div className="notification-item-copy"><strong>{actionItems.length} action {actionItems.length === 1 ? 'item' : 'items'} in your plan</strong><small>Next step: {actionItems[0]}</small></div><button className="notification-item-action" type="button" onClick={() => { setActivePage('My action plan'); setNotificationsOpen(false) }}>View</button></div>}
                      </>}
                    </div>}
                  </>
                })()}
              </div>
            </div>

            <div className="dashboard-stat-grid">
              <div className="dashboard-stat"><div className="dashboard-stat-head"><span>Courses completed</span><span className="dashboard-stat-icon" style={{background:'#e8eaff',color:'#6266d9'}}>▤</span></div><strong>{(currentStudent?.['Completed Courses'] !== undefined && currentStudent?.['Completed Courses'] !== '' ? Number(currentStudent['Completed Courses']) : (currentStudent?.['Course Progress'] || '').split(';').filter(item => /:\s*100%/.test(item)).length)} <span style={{fontSize:15,color:'#8a92a2',fontWeight:500}}>/ {(currentStudent?.Courses || '').split(';').map(item => item.trim()).filter(Boolean).length}</span></strong><small>Based on course completion data</small></div>
              <div className="dashboard-stat"><div className="dashboard-stat-head"><span>Projects & activities</span><span className="dashboard-stat-icon" style={{background:'#e2f7ed',color:'#25845f'}}>✳</span></div><strong>{(currentStudent?.Projects || '').split(';').map(item => item.trim()).filter(Boolean).length}</strong><small>Listed in your profile</small></div>
              <div className="dashboard-stat"><div className="dashboard-stat-head"><span>Mentoring sessions</span><span className="dashboard-stat-icon" style={{background:'#e5f0ff',color:'#3267ad'}}>◷</span></div><strong>{currentStudent?.['Sessions Completed'] !== undefined && currentStudent?.['Sessions Completed'] !== '' ? currentStudent['Sessions Completed'] : (currentStudent?.['Mentoring Sessions'] || '0')}</strong><small>{currentStudent?.['Sessions Completed'] !== undefined && currentStudent?.['Sessions Completed'] !== '' ? 'Completed sessions' : 'Sessions listed in your profile'}</small></div>
              <div className="dashboard-stat"><div className="dashboard-stat-head"><span>Action items completed</span><span className="dashboard-stat-icon" style={{background:'#fff0db',color:'#a66a13'}}>✓</span></div><strong>{currentStudent?.['Action Items Completed'] !== undefined && currentStudent?.['Action Items Completed'] !== '' ? currentStudent['Action Items Completed'] : '—'}</strong><small>{currentStudent?.['Action Items Completed'] !== undefined && currentStudent?.['Action Items Completed'] !== '' ? 'Completed tasks' : 'Tracking will be added next'}</small></div>
            </div>

            <div className="dashboard-columns">
              <div>
                <div className="dashboard-panel">
                  <div className="dashboard-panel-heading"><h2>Continue learning</h2><button className="dashboard-link" onClick={() => setActivePage('My action plan')}>View learning plan →</button></div>
                  {(currentStudent?.Courses || '').split(';').map(course => course.trim()).filter(Boolean).map((course, index) => {
                    const progressEntry = (currentStudent?.['Course Progress'] || '').split(';').map(item => item.trim()).find(item => item.startsWith(course + ':'))
                    const progressMatch = progressEntry?.match(/(\d+)%/)
                    const progress = progressMatch ? Number(progressMatch[1]) : 0
                    return <div className="course-row" key={course}>
                      <div className="course-art" style={{background:index % 2 === 0 ? '#e3f6ed' : '#eeedff',color:index % 2 === 0 ? '#25845f' : '#6568ce'}}>{index + 1}</div>
                      <div className="course-copy"><strong>{course}</strong><small>Course · {progress === 100 ? 'Completed' : 'In progress'}</small><div className="course-progress"><span style={{width:`${progress}%`,background:progress === 100 ? '#42ad83' : '#7779df'}} /></div></div>
                      <span className="course-percent">{progress === 100 ? 'Done' : `${progress}%`}</span>
                    </div>
                  })}
                  <p className="dashboard-note">Courses and progress are loaded from public/students.csv.</p>
                </div>

                <div className="dashboard-panel">
                  <div className="dashboard-panel-heading"><h2>Recent activity</h2><button className="dashboard-link" onClick={() => setActivePage('My action plan')}>See all →</button></div>
                  {(currentStudent?.Projects || '').split(';').map(project => project.trim()).filter(Boolean).map((project, index) => (
                    <div className="activity-row" key={project}>
                      <div className="activity-dot">{index + 1}</div>
                      <div className="activity-copy"><strong>{project}</strong><small>Project / activity in your profile</small></div>
                      <span className="activity-status">Listed</span>
                    </div>
                  ))}
                  <p className="dashboard-note">Projects and activities are loaded from public/students.csv.</p>
                </div>
              </div>

              <div>
                <div className="dashboard-panel">
                  <div className="dashboard-panel-heading"><h2>Career direction</h2></div>
                  <div className="career-role">
                    <div className="career-role-icon">↗</div>
                    <div><strong>{currentStudent?.['Target Role'] || 'Career goal'}</strong><p>{currentStudent?.['Career Goal'] || 'Add a career goal to personalise your dashboard.'}</p></div>
                  </div>
                  <div className="milestone-card"><small>Next milestone</small><strong>{currentStudent?.['Next Milestone'] || (currentStudent?.['Action Items'] || '').split(';').map(item => item.trim()).filter(Boolean)[0] || 'Choose a small next step for your career goal.'}</strong></div>
                </div>
                <div className="dashboard-panel">
                  <div className="dashboard-panel-heading"><h2>Skills in your profile</h2><span style={{fontSize:11,color:'#8a92a2'}}>{(currentStudent?.['Target Skills'] || currentStudent?.Skills || '').split(';').map(item => item.trim()).filter(Boolean).length} skills</span></div>
                  <div className="skill-chip-list">
                    {(currentStudent?.['Target Skills'] || currentStudent?.Skills || '').split(';').map(skill => skill.trim()).filter(Boolean).map(skill => <span className="skill-chip" key={skill}>{skill}</span>)}
                  </div>
                  <p className="dashboard-note" style={{marginTop:12}}>Skills are shown without proficiency percentages because no skill assessment data is available yet.</p>
                </div>
                <div className="dashboard-panel">
                  <div className="dashboard-panel-heading"><h2>Action items to work on</h2><button className="dashboard-link" onClick={() => setActivePage('My action plan')}>View plan →</button></div>
                  {(currentStudent?.['Action Items'] || '').split(';').map(item => item.trim()).filter(Boolean).map((item, index) => <div className="action-item-row" key={item}><span className="action-item-bullet">{index + 1}</span><span className="action-item-copy">{item}</span></div>)}
                  <p className="dashboard-note">These are profile-based tasks for now. Completion tracking will be connected to saved action-item records later.</p>
                </div>
                <div className="mentor-cta"><h3>Ready for your next step?</h3><p>Explore mentors who can help you turn your learning into a career plan.</p><button onClick={() => setActivePage('Discover')}>Find a mentor →</button></div>
              </div>
            </div>
          </section>
        )}

        {activePage === 'Discover' && (
          <>
            <section className="welcome">
              <div>
                <div className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div>
                <h1>Make your next move<br />with <span>the right guidance.</span></h1>
                <p>Big career questions are easier when you don't have to figure them out alone.</p>
              </div>
              <div className="welcome-art">
                <div className="art-circle art-circle-one" />
                <div className="art-circle art-circle-two" />
                <div className="art-card">
                  <span>✳</span>
                  <strong>Your potential</strong>
                  <small>Deserves a plan.</small>
                </div>
              </div>
            </section>

            <section className="chat-layout">
              <div className="chat-panel">
                <div className="panel-heading">
                  <div className="assistant-icon">✳</div>
                  <div>
                    <strong>Your career guide</strong>
                    <small><span className="status-dot" /> Here to help you move forward</small>
                  </div>
                  <span className="powered-label">CAREER AI</span>
                </div>

                <div className="chat-messages">
                  {chat.map((item, index) => (
                    <div key={index} className={`message-row ${item.sender}`}>
                      {item.sender === 'bot' && <div className="bot-avatar">✳</div>}
                      <div className="message-bubble">{item.text}</div>
                    </div>
                  ))}

                  {showMentors && (
                    <div className="recommendations">
                      <div className="recommendation-title">
                        <strong>Mentors to explore</strong>
                        <span>{mentors.filter(
                              mentor => mentor['Mentor ID'] && mentor.Name
                                ).length} mentors in directory
                                </span>
                      </div>

                      {recommendedMentors.map((mentor) => (
                        <div className="mentor-card" key={mentor['Mentor ID']}>
                          <div className="mentor-avatar">
                            {mentor.Name
                              ? mentor.Name.replace('Mentor ', 'M').slice(0, 2).toUpperCase()
                              : 'M'}
                          </div>
                          <div className="mentor-info">
                            <strong>{mentor.Name}</strong>
                            <span>{mentor.Domain || mentor['Master Sector'] || 'Domain not listed'}</span>
                            <div
                              className="mentor-match-score"
                              aria-label={`Relative profile match score: ${mentor.matchPercentage}%`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', margin: '8px 0 4px', padding: '5px 10px', borderRadius: '999px', background: '#e1f5e9', color: '#116849', fontSize: '13px', fontWeight: 700, width: 'fit-content' }}
                            >
                              <span>{mentor.matchPercentage}% match</span>
                              <span style={{ fontWeight: 500, opacity: 0.8 }}>relative to top result</span>
                            </div>
                            <small>
                              Sectors: {mentor['Sectors of Expertise'] || 'Not listed'}
                            </small>
                            <p>{mentor.reason}</p>
                          </div>
                          <button className="book-button" onClick={() => requestBooking(mentor)}>
                            Request
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <form className="chat-composer" onSubmit={(event) => {
                  event.preventDefault()
                  sendMessage()
                }}>
                  <input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Tell me what's on your mind..."
                    aria-label="Describe your career problem"
                  />
                  <button type="submit" aria-label="Send message">↑</button>
                </form>
                <div className="chat-disclaimer">
                  {semanticStatus === 'loading'
                    ? 'Preparing mentor directory…'
                    : semanticStatus === 'error'
                      ? 'Mentor profile matching is unavailable because the directory could not load.'
                      : 'Smart profile matching · Weights role, skill, tool, and domain evidence'}
                </div>
              </div>

              <aside className="side-panel">
                <div className="side-panel-heading">
                  <strong>Your progress</strong>
                  <span>THIS WEEK</span>
                </div>
                <div className="progress-card">
                  <div className="progress-number">01 <span>/ 03</span></div>
                  <strong>Start with clarity</strong>
                  <p>Describe your goal and find someone who can help you get there.</p>
                  <div className="progress-track"><div /></div>
                </div>
                <div className="tip-card">
                  <div className="tip-icon">✧</div>
                  <strong>A tip for you</strong>
                  <p>Specific questions lead to more useful mentoring conversations.</p>
                  <button onClick={() => sendMessage('I want to explore career options and understand which skills I should develop next.')}>
                    Try an example <span>→</span>
                  </button>
                </div>
                {bookedMentor && (
                  <div className="booking-notice">
                    <strong>Latest demo request</strong>
                    <p>{bookedMentor.Name}</p>
                    <small>
                      {bookings.find(
                        booking => booking.mentorId === bookedMentor['Mentor ID'] && booking.studentUsername === (currentStudent?.Username || '').toLowerCase()
                      )?.status || 'Requested'} · Local demo only
                    </small>
                  </div>
                )}
              </aside>
            </section>
          </>
        )}

        {activePage === 'My sessions' && (
          <section className="simple-page sessions-page">
            <style>{`
              .sessions-page { width:100%; max-width:1180px; margin:0 auto; padding:46px clamp(20px,4vw,54px) 64px; box-sizing:border-box; }
              .sessions-page * { box-sizing:border-box; }
              .sessions-hero { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; padding:0 0 30px; border-bottom:1px solid #e8eee9; margin-bottom:26px; }
              .sessions-hero-copy { max-width:650px; }
              .sessions-page .sessions-eyebrow { color:#16805d; font-size:11px; font-weight:800; letter-spacing:1.8px; margin-bottom:12px; }
              .sessions-page .sessions-title { margin:0; color:#132d22; font-size:clamp(30px,3vw,42px); line-height:1.12; letter-spacing:-1.5px; font-weight:750; }
              .sessions-page .sessions-subtitle { margin:12px 0 0; color:#718078; font-size:15px; line-height:1.7; }
              .sessions-hero-mark { display:flex; align-items:center; gap:10px; border:1px solid #dfeae3; background:#f7faf8; border-radius:14px; padding:12px 15px; color:#315c46; font-size:12px; font-weight:650; white-space:nowrap; }
              .sessions-hero-mark span { width:9px; height:9px; border-radius:50%; background:#27a477; box-shadow:0 0 0 4px #e3f4eb; }
              .sessions-stat-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-bottom:34px; }
              .sessions-stat { display:flex; align-items:center; gap:14px; min-width:0; padding:19px 20px; background:#fff; border:1px solid #e4ece6; border-radius:17px; box-shadow:0 5px 18px rgba(27,67,46,.035); }
              .sessions-stat-icon { display:grid; place-items:center; width:44px; height:44px; flex-shrink:0; border-radius:13px; background:#eaf6ef; color:#176b4d; font-size:21px; }
              .sessions-stat-copy { min-width:0; }
              .sessions-stat-copy span { display:block; color:#77867d; font-size:12px; margin-bottom:5px; }
              .sessions-stat-copy strong { display:block; color:#173b2c; font-size:25px; line-height:1; letter-spacing:-.7px; }
              .sessions-section { margin-top:32px; }
              .sessions-section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:15px; }
              .sessions-section-heading h2 { margin:0; color:#1c3629; font-size:19px; letter-spacing:-.45px; }
              .sessions-section-heading p { margin:5px 0 0; color:#829087; font-size:12px; line-height:1.5; }
              .sessions-count { border:1px solid #e1ebe4; background:#f7faf8; color:#526c5d; border-radius:99px; padding:6px 10px; font-size:11px; font-weight:700; white-space:nowrap; }
              .sessions-booking-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
              .sessions-booking-card { display:flex; gap:15px; align-items:flex-start; padding:21px; background:#fff; border:1px solid #e3ebe5; border-radius:18px; box-shadow:0 5px 20px rgba(24,64,43,.035); transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease; min-width:0; }
              .sessions-booking-card:hover { transform:translateY(-2px); border-color:#c6dfd0; box-shadow:0 10px 26px rgba(24,64,43,.07); }
              .sessions-mentor-avatar { display:grid; place-items:center; width:48px; height:48px; flex-shrink:0; border-radius:15px; background:linear-gradient(145deg,#e7f6ed,#d8eee2); color:#176b4d; font-size:14px; font-weight:800; }
              .sessions-booking-content { flex:1; min-width:0; }
              .sessions-booking-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
              .sessions-booking-card h3 { margin:1px 0 5px; color:#1d382b; font-size:16px; font-weight:750; letter-spacing:-.25px; }
              .sessions-booking-domain { margin:0; color:#7a887f; font-size:12px; line-height:1.5; }
              .sessions-status { display:inline-flex; align-items:center; gap:6px; border-radius:99px; padding:6px 10px; font-size:10px; line-height:1.2; font-weight:750; white-space:nowrap; background:#f0f4f1; color:#53665a; }
              .sessions-status:before { content:''; width:6px; height:6px; border-radius:50%; background:currentColor; }
              .sessions-status.requested { background:#fff5df; color:#966b16; }
              .sessions-status.confirmed,.sessions-status.accepted { background:#e8f7ee; color:#21754e; }
              .sessions-status.declined,.sessions-status.cancelled { background:#fff0ed; color:#b44b3b; }
              .sessions-status.completed { background:#eaf0ff; color:#4c64b6; }
              .sessions-booking-meta { display:flex; align-items:center; flex-wrap:wrap; gap:8px 15px; margin-top:15px; padding-top:13px; border-top:1px solid #eff3f0; color:#7e8b82; font-size:11px; line-height:1.5; }
              .sessions-booking-meta span { display:inline-flex; align-items:center; gap:6px; }
              .sessions-proposed-time { margin:12px 0 0; border-radius:10px; padding:10px 12px; background:#f5f8f6; color:#526b5b; font-size:12px; line-height:1.5; }
              .sessions-booking-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
              .sessions-booking-actions button { border:1px solid #d9e8df; border-radius:9px; padding:9px 12px; background:#fff; color:#24573e; font-size:11px; font-weight:750; cursor:pointer; transition:background .15s ease,border-color .15s ease; }
              .sessions-booking-actions button:first-child { background:#176b4d; color:#fff; border-color:#176b4d; }
              .sessions-booking-actions button:hover { border-color:#8fc4a5; }
              .sessions-empty { display:flex; align-items:center; gap:18px; padding:26px; border:1px dashed #cfded4; border-radius:18px; background:#f8fbf9; }
              .sessions-empty-icon { display:grid; place-items:center; width:52px; height:52px; flex-shrink:0; border-radius:16px; background:#e7f5ec; color:#176b4d; font-size:24px; }
              .sessions-empty h3 { margin:0 0 5px; color:#1d382b; font-size:15px; }
              .sessions-empty p { margin:0; color:#7b8980; font-size:12px; line-height:1.6; }
              .sessions-empty button { margin-left:auto; border:0; border-radius:10px; padding:11px 14px; background:#176b4d; color:#fff; font-size:12px; font-weight:750; cursor:pointer; white-space:nowrap; }
              .sessions-summary-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
              .sessions-summary-card { padding:22px; background:#fff; border:1px solid #e2ebe5; border-radius:18px; box-shadow:0 5px 20px rgba(24,64,43,.035); min-width:0; }
              .sessions-summary-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; }
              .sessions-summary-mentor { display:flex; align-items:center; gap:11px; min-width:0; }
              .sessions-summary-mentor-icon { display:grid; place-items:center; width:38px; height:38px; flex-shrink:0; border-radius:12px; background:#edf7f0; color:#176b4d; font-size:15px; }
              .sessions-summary-mentor strong { display:block; color:#244333; font-size:13px; }
              .sessions-summary-mentor small { display:block; margin-top:4px; color:#849087; font-size:10px; }
              .sessions-summary-label { color:#21754e; background:#eaf7ef; border-radius:99px; padding:6px 9px; font-size:10px; font-weight:750; white-space:nowrap; }
              .sessions-summary-text { margin:0; color:#586b5e; font-size:13px; line-height:1.75; white-space:pre-wrap; overflow-wrap:anywhere; }
              .sessions-action-list { margin:17px 0 0; padding:15px 0 0; border-top:1px solid #edf2ee; list-style:none; }
              .sessions-action-list h4 { margin:0 0 10px; color:#2d4a39; font-size:12px; }
              .sessions-action-list li { display:flex; align-items:flex-start; gap:9px; margin-top:9px; color:#68796e; font-size:12px; line-height:1.55; }
              .sessions-action-list li:before { content:'✓'; display:grid; place-items:center; width:18px; height:18px; flex-shrink:0; border-radius:6px; background:#edf7f0; color:#21754e; font-size:10px; font-weight:800; }
              .sessions-summary-empty { padding:27px; border:1px dashed #d4e1d8; border-radius:18px; background:#f8fbf9; color:#77877c; font-size:13px; line-height:1.7; text-align:center; }
              @media(max-width:850px) { .sessions-booking-list,.sessions-summary-list { grid-template-columns:1fr; } .sessions-hero { align-items:flex-start; flex-direction:column; } }
              @media(max-width:600px) { .sessions-page { padding:28px 15px 40px; } .sessions-stat-grid { grid-template-columns:1fr; gap:10px; margin-bottom:26px; } .sessions-stat { padding:15px; } .sessions-booking-card { padding:16px; gap:11px; } .sessions-mentor-avatar { width:40px; height:40px; border-radius:12px; } .sessions-section-heading { align-items:flex-start; } .sessions-empty { align-items:flex-start; flex-wrap:wrap; padding:19px; } .sessions-empty button { margin-left:0; } .sessions-summary-card { padding:17px; } }
            `}</style>
            {(() => {
              const myBookings = bookings.filter(booking => booking.studentUsername === (currentStudent?.Username || '').toLowerCase());
              const mySummaries = publishedSummaries.filter(item => item.studentUsername === (currentStudent?.Username || '').toLowerCase()).sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
              const pendingCount = myBookings.filter(booking => ['Requested', 'Reschedule proposed'].includes(booking.status)).length;
              const confirmedCount = myBookings.filter(booking => ['Accepted', 'Confirmed'].includes(booking.status)).length;
              return <>
                <header className="sessions-hero">
                  <div className="sessions-hero-copy">
                    <div className="sessions-eyebrow">YOUR MENTORING JOURNEY</div>
                    <h1 className="sessions-title">My sessions</h1>
                    <p className="sessions-subtitle">Your mentoring requests, upcoming conversations, and the advice you can put into action — all in one place.</p>
                  </div>
                  <div className="sessions-hero-mark"><span /> Your mentoring workspace</div>
                </header>
                <div className="sessions-stat-grid">
                  <div className="sessions-stat"><div className="sessions-stat-icon">◷</div><div className="sessions-stat-copy"><span>Total requests</span><strong>{myBookings.length}</strong></div></div>
                  <div className="sessions-stat"><div className="sessions-stat-icon">✓</div><div className="sessions-stat-copy"><span>Confirmed sessions</span><strong>{confirmedCount}</strong></div></div>
                  <div className="sessions-stat"><div className="sessions-stat-icon">✦</div><div className="sessions-stat-copy"><span>Published summaries</span><strong>{mySummaries.length}</strong></div></div>
                </div>
                <section className="sessions-section">
                  <div className="sessions-section-heading"><div><h2>Your mentoring requests</h2><p>Follow each request and respond when your mentor proposes a new time.</p></div><span className="sessions-count">{myBookings.length} {myBookings.length === 1 ? 'request' : 'requests'}</span></div>
                  {myBookings.length ? <div className="sessions-booking-list">{myBookings.map(booking => {
                    const statusClass = (booking.status || '').toLowerCase().replace(/\s+/g, '-');
                    return <article className="sessions-booking-card" key={booking.id}>
                      <div className="sessions-mentor-avatar">{booking.mentor?.Name ? booking.mentor.Name.replace('Mentor ', 'M').slice(0, 2).toUpperCase() : 'M'}</div>
                      <div className="sessions-booking-content">
                        <div className="sessions-booking-top"><div><h3>{booking.mentor?.Name || 'Your mentor'}</h3><p className="sessions-booking-domain">{booking.mentor?.Domain || booking.mentor?.['Master Sector'] || 'Mentor profile'}</p></div><span className={`sessions-status ${statusClass}`}>{booking.status}</span></div>
                        {booking.proposedTime && <p className="sessions-proposed-time"><strong>Proposed time:</strong> {booking.proposedTime}</p>}
                        <div className="sessions-booking-meta"><span>◷ Requested {booking.requestedAt ? new Date(booking.requestedAt).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }) : 'Date not recorded'}</span><span>↗ Mentoring session</span></div>
                        {booking.status === 'Reschedule proposed' && <div className="sessions-booking-actions"><button onClick={() => updateBookingStatus(booking.id, 'Confirmed')}>Accept proposed time</button><button onClick={() => updateBookingStatus(booking.id, 'Cancelled')}>Decline time</button></div>}
                      </div>
                    </article>;
                  })}</div> : <div className="sessions-empty"><div className="sessions-empty-icon">◷</div><div><h3>Your next conversation starts here</h3><p>Explore the mentor directory and request a session. Your requests will appear here so you can follow their progress.</p></div><button onClick={() => setActivePage('Discover')}>Explore mentors →</button></div>}
                </section>
                <section className="sessions-section">
                  <div className="sessions-section-heading"><div><h2>Session summaries</h2><p>Key takeaways and next steps shared by your mentors.</p></div><span className="sessions-count">{mySummaries.length} {mySummaries.length === 1 ? 'summary' : 'summaries'}</span></div>
                  {mySummaries.length ? <div className="sessions-summary-list">{mySummaries.map(item => <article className="sessions-summary-card" key={item.id || item.bookingId}>
                    <div className="sessions-summary-top"><div className="sessions-summary-mentor"><div className="sessions-summary-mentor-icon">✦</div><div><strong>{item.mentorName || 'Your mentor'}</strong><small>Published {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }) : 'date unavailable'}</small></div></div><span className="sessions-summary-label">Published</span></div>
                    <p className="sessions-summary-text">{item.summary || 'No summary text was provided.'}</p>
                    {item.actionItems?.length > 0 && <ul className="sessions-action-list"><h4>Your next steps</h4>{item.actionItems.map((task, index) => <li key={`${item.id || item.bookingId}-${index}`}>{task}</li>)}</ul>}
                  </article>)}</div> : <div className="sessions-summary-empty">Your mentor's session summaries will appear here after they publish them. Each summary will include the key discussion points and any action items agreed during your session.</div>}
                </section>
              </>;
            })()}
          </section>
        )}

        {activePage === 'Mentor requests' && (
          <section className="simple-page">
            <div className="eyebrow">MENTOR WORKSPACE</div>
            <h1>Mentor requests</h1>
            <p className="page-intro">Review requests assigned to {currentMentor?.Name || 'your mentor profile'} and update their status.</p>
            {accountStateForMentor(currentMentor) === 'Suspended' ? <div className="empty-state"><div>!</div><h3>Mentor account suspended</h3><p>Your account has been suspended by the administrator. Booking actions are disabled until the account is reactivated.</p></div> : bookings.filter(booking => booking.mentorId === currentMentor?.['Mentor ID']).length > 0 ? (
              <div className="booking-list">
                {bookings.filter(booking => booking.mentorId === currentMentor?.['Mentor ID']).map(booking => (
                  <div className="session-card" key={booking.id}>
                    <div className="mentor-avatar">{(booking.student?.Name || 'S').slice(0, 1).toUpperCase()}</div>
                    <div>
                      <strong>{booking.student?.Name || 'Demo Student'} → {booking.mentor.Name}</strong>
                      <p>{booking.mentor.Domain || booking.mentor['Master Sector'] || 'Domain not listed'}</p>
                      <span className="demo-tag">Status: {booking.status}</span>
                      {booking.proposedTime && <p>Proposed time: {booking.proposedTime}</p>}
                      <small>Requested {new Date(booking.requestedAt).toLocaleString()}</small>
                      {['Accepted', 'Confirmed', 'Completed'].includes(booking.status) && <div style={{ marginTop: 12 }}><button className="book-button" onClick={() => { setTranscriptionBooking(booking); setActivePage('Call workspace'); setTranscriptionStatus('idle'); setTranscriptionError(''); setSessionAudioFile(null); setTranscriptionText(''); setSessionSummary(''); setSessionActionItems(''); setSummaryPublishNotice(''); const savedSummary = publishedSummaries.find(item => item.bookingId === booking.id); if (savedSummary) { setSessionSummary(savedSummary.summary || ''); setSessionActionItems((savedSummary.actionItems || []).join('\n')); setTranscriptionText(savedSummary.transcript || '') } }}>Open call workspace →</button></div>}
                    </div>
                    <div className="booking-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                      {booking.status === 'Requested' && (
                        <>
                          <button className="book-button" onClick={() => updateBookingStatus(booking.id, 'Accepted')}>Accept</button>
                          <button className="book-button" onClick={() => updateBookingStatus(booking.id, 'Declined')}>Decline</button>
                          <button className="book-button" onClick={() => {
                            const time = window.prompt('Enter a proposed date and time (for example: 20 Oct 2026, 4:00 PM)')
                            if (time && time.trim()) updateBookingStatus(booking.id, 'Reschedule proposed', time.trim())
                          }}>Propose time</button>
                        </>
                      )}
                      {booking.status === 'Accepted' && (
                        <button className="book-button" onClick={() => updateBookingStatus(booking.id, 'Confirmed')}>Confirm session</button>
                      )}
                      {booking.status === 'Confirmed' && (
                        <button className="book-button" onClick={() => updateBookingStatus(booking.id, 'Completed')}>Mark completed</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div>◷</div>
                <h3>No booking requests for {currentMentor?.Name || 'this mentor'} yet</h3>
                <p>Requests made to this mentor will appear here. Other mentors' requests are hidden.</p>
              </div>
            )}
          </section>
        )}

        {activePage === 'Call workspace' && selectedRole === 'Mentor' && (
          <section className="simple-page call-workspace-page">
            <style>{`
              .call-workspace-page { width:100%; max-width:1500px; margin:0 auto; padding:30px clamp(18px,3vw,44px) 56px; color:#17382b; }
              .call-workspace-page .page-intro { max-width:760px; margin:8px 0 0; color:#718078; font-size:13px; line-height:1.7; }
              .call-workspace-page > h1 { margin:5px 0 0; letter-spacing:-.04em; font-size:clamp(26px,2.2vw,34px); }
              .call-workspace-page .eyebrow { color:#418265; font-size:10px; font-weight:800; letter-spacing:.16em; }
              .call-step-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:22px 0; }
              .call-step-card { position:relative; display:flex; align-items:flex-start; gap:12px; background:linear-gradient(135deg,#fff 0%,#f8fbf8 100%); border:1px solid #e4ece6; border-radius:15px; padding:15px 16px; min-height:90px; }
              .call-step-number { flex:0 0 29px; display:grid; place-items:center; width:29px; height:29px; border-radius:9px; background:#e5f3e9; color:#176b4d; font-size:12px; font-weight:800; }
              .call-step-card strong { display:block; color:#193c2d; font-size:13px; margin:1px 0 5px; }
              .call-step-card p { color:#78857d; font-size:11px; line-height:1.55; margin:0; }
              .call-workspace-page .dashboard-panel { min-width:0; border:1px solid #e3ebe5; border-radius:16px; padding:20px; background:#fff; box-shadow:0 5px 20px rgba(24,64,43,.035); margin-bottom:16px; }
              .call-workspace-page .dashboard-panel-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
              .call-workspace-page .dashboard-panel-heading h2 { margin:0; color:#1d3e2f; font-size:15px; letter-spacing:-.02em; }
              .call-workspace-page .call-muted { color:#7b8980; font-size:11px; line-height:1.65; }
              .call-workspace-page .call-workspace-form { display:flex; flex-direction:column; gap:12px; }
              .call-upload-box { border:1px dashed #b9d5c4; border-radius:12px; padding:17px; background:#f7fbf8; }
              .call-upload-box label { display:block; color:#214b36; font-size:12px; font-weight:700; margin-bottom:9px; }
              .call-upload-box input { display:block; width:100%; color:#58675e; font:inherit; font-size:12px; }
              .call-help { color:#7a887f; font-size:11px; line-height:1.6; margin:8px 0 0; }
              .call-primary-button { display:inline-flex; align-items:center; justify-content:center; align-self:flex-start; border:1px solid #176b4d; border-radius:9px; padding:10px 14px; background:#176b4d; color:#fff; font-size:12px; font-weight:700; cursor:pointer; transition:background .18s ease,transform .18s ease,box-shadow .18s ease; }
              .call-primary-button:hover:not(:disabled) { background:#10563d; box-shadow:0 4px 12px rgba(23,107,77,.16); transform:translateY(-1px); }
              .call-primary-button:focus-visible { outline:3px solid #b9dfc7; outline-offset:2px; }
              .call-primary-button:disabled { opacity:.55; cursor:wait; transform:none; box-shadow:none; }
              .call-alert { border-radius:10px; padding:11px 13px; font-size:12px; line-height:1.55; margin-top:12px; }
              .call-alert.error { color:#9d2923; background:#fff0ef; border:1px solid #f8d6d2; }
              .call-alert.success { color:#216b4b; background:#edf8f1; border:1px solid #d6eddd; }
              .call-transcript-editor,.call-summary-editor { display:block; width:100%; min-width:0; box-sizing:border-box; border:1px solid #dfe8e1; border-radius:11px; padding:13px 14px; background:#fbfdfb; color:#263a2e; font:inherit; font-size:12px; line-height:1.7; resize:vertical; transition:border-color .18s ease,box-shadow .18s ease,background .18s ease; }
              .call-transcript-editor { min-height:270px; }
              .call-summary-editor { min-height:175px; }
              .call-transcript-editor:focus,.call-summary-editor:focus { outline:none; border-color:#75ae8b; background:#fff; box-shadow:0 0 0 3px rgba(61,139,91,.10); }
              .call-editor-grid { display:grid; grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr); gap:16px; align-items:stretch; }
              .call-editor-card { min-width:0; display:flex; flex-direction:column; }
              .call-editor-card .call-transcript-editor,.call-editor-card .call-summary-editor { flex:1; }
              .call-workspace-page .call-recording-panel { display:grid; grid-template-columns:minmax(0,1fr) minmax(300px,.9fr); gap:16px; align-items:stretch; }
              .call-workspace-page .call-recording-panel > .dashboard-panel { margin-bottom:0; }
              .call-workspace-page .call-action-panel { margin-top:16px; }
              .call-workspace-page .call-publish-footer { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; padding-top:16px; margin-top:16px; border-top:1px solid #edf1ed; }
              .call-workspace-page .call-publish-footer .call-primary-button:last-child { background:#124b35; padding:11px 16px; }
              .call-workspace-page textarea::placeholder { color:#a1aca4; }
              @media(max-width:1050px) { .call-workspace-page .call-recording-panel { grid-template-columns:1fr; } }
              @media(max-width:850px) { .call-editor-grid { grid-template-columns:1fr; } .call-step-grid { grid-template-columns:1fr; } .call-transcript-editor { min-height:210px; } }
              @media(max-width:600px) { .call-workspace-page { padding:24px 14px 36px; } .call-workspace-page .dashboard-panel { padding:15px; } .call-workspace-page .call-publish-footer { align-items:stretch; flex-direction:column; } .call-workspace-page .call-publish-footer button { width:100%; } }
            `}</style>
            <div className="eyebrow">MENTOR WORKSPACE</div>
            <h1>Call & transcription</h1>
            <p className="page-intro">Transcribe a mentoring conversation live through your browser microphone, or upload a recording to keep it with this workspace. Automatic transcription of uploaded files can be added later through a speech-to-text service.</p>
            {transcriptionBooking ? (
              <div className="dashboard-panel call-selected-session" style={{ marginTop: 20 }}>
                <div className="dashboard-panel-heading"><h2>Selected session</h2><span className="demo-tag">{transcriptionBooking.status}</span></div>
                <strong>{transcriptionBooking.student?.Name || 'Demo Student'} · {transcriptionBooking.mentor?.Name || currentMentor?.Name}</strong>
                <p className="call-muted" style={{ marginTop: 7 }}>Booking requested {new Date(transcriptionBooking.requestedAt).toLocaleString()}</p>
              </div>
            ) : (
              <div className="dashboard-panel" style={{ marginTop: 22 }}>
                <h2 style={{ marginTop: 0 }}>Choose a session</h2>
                <p className="call-muted">Open this workspace from an accepted, confirmed or completed booking in Mentor requests. If you're just testing the transcriber, you can upload a sample recording below without selecting a booking.</p>
              </div>
            )}
            <div className="call-step-grid">
              <div className="call-step-card"><div className="call-step-number">1</div><strong>Start live transcription</strong><p>Allow microphone access and speak naturally during the mentoring session.</p></div>
              <div className="call-step-card"><div className="call-step-number">2</div><strong>Or upload a recording</strong><p>Keep an audio file in the workspace; automatic file transcription is a future integration.</p></div>
              <div className="call-step-card"><div className="call-step-number">3</div><strong>Review notes</strong><p>Edit the transcript and prepare the session summary.</p></div>
            </div>
            <div className="call-recording-panel">
            <div className="dashboard-panel">
              <div className="dashboard-panel-heading"><h2>Live transcription</h2><span className="call-muted">Browser microphone</span></div>
              <p className="call-muted">Use this while the conversation is happening. Your browser may send audio to its speech-recognition provider; availability and accuracy depend on browser support and internet connection.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                <button className="call-primary-button" type="button" onClick={startLiveTranscription} disabled={liveTranscriptStatus === 'listening'}>Start live transcription →</button>
                <button className="call-primary-button" type="button" onClick={stopLiveTranscription} disabled={liveTranscriptStatus !== 'listening'} style={{ background: '#425348' }}>Stop transcription</button>
              </div>
              {liveTranscriptStatus === 'listening' && <div className="call-alert success" role="status">Listening… speak into your microphone. Recognized words will appear in the transcript below.</div>}
              {liveTranscriptStatus === 'stopped' && <div className="call-alert success" role="status">Live transcription stopped. You can edit the transcript below or start listening again.</div>}
              {liveTranscriptError && <div className="call-alert error" role="alert">{liveTranscriptError}</div>}
              {liveInterimText && <p className="call-help"><strong>Hearing:</strong> {liveInterimText}</p>}
              <p className="call-help">Tip: if the browser asks for microphone permission, choose Allow. For best results, test in the latest Google Chrome.</p>
            </div>
            <div className="dashboard-panel">
              <div className="dashboard-panel-heading"><h2>Recording</h2><span className="call-muted">Audio upload</span></div>
              <form className="call-workspace-form" onSubmit={transcribeSessionRecording}>
                <div className="call-upload-box">
                  <label htmlFor="session-audio">Choose an audio recording</label>
                  <input id="session-audio" type="file" accept="audio/*,.mp3,.wav,.m4a,.webm,.mp4" onChange={event => { setSessionAudioFile(event.target.files?.[0] || null); setTranscriptionError(''); if (transcriptionStatus === 'error') setTranscriptionStatus('idle') }} />
                  <p className="call-help">Upload a recording to keep it selected in this workspace. This prototype does not automatically transcribe uploaded files yet. Please ensure everyone in the recording has consented to its processing.</p>
                  {sessionAudioFile && <p className="call-help"><strong>Selected:</strong> {sessionAudioFile.name} · {(sessionAudioFile.size / (1024 * 1024)).toFixed(2)} MB</p>}
                </div>
                <button className="call-primary-button" type="submit">Check upload transcription options</button>
              </form>
              {transcriptionStatus === 'processing' && <div className="call-alert success" role="status">Your recording is being processed. Longer recordings may take a little while.</div>}
              {transcriptionError && <div className="call-alert error" role="alert">{transcriptionError}</div>}
              {transcriptionStatus === 'success' && <div className="call-alert success" role="status">Transcript received. Review and correct any errors before using it for session notes.</div>}
            </div>
            </div>
            <div className="call-editor-grid">
              <div className="dashboard-panel call-editor-card">
                <div className="dashboard-panel-heading"><h2>Raw transcript</h2><span className="call-muted">Editable</span></div>
                <p className="call-muted" style={{ marginTop: 0, marginBottom: 12 }}>Review the conversation text and correct any recognition mistakes.</p>
                <textarea className="call-transcript-editor" aria-label="Edit raw transcript" placeholder="Live transcription will appear here, or you can paste an existing transcript…" value={transcriptionText} onChange={event => setTranscriptionText(event.target.value)} />
                <p className="call-help">Transcript text may contain mistakes. Review it before publishing.</p>
              </div>
              <div className="dashboard-panel call-editor-card">
                <div className="dashboard-panel-heading"><h2>Session summary</h2><span className="call-muted">Student-facing</span></div>
                <p className="call-muted" style={{ marginTop: 0, marginBottom: 12 }}>Capture the key discussion points, advice, and decisions.</p>
                <textarea className="call-summary-editor" aria-label="Session summary draft" placeholder="Summarise what was discussed, advice given, decisions and next steps…" value={sessionSummary} onChange={event => { setSessionSummary(event.target.value); setSummaryPublishNotice('') }} />
              </div>
            </div>
            <div className="dashboard-panel call-action-panel">
              <div className="dashboard-panel-heading"><h2>Action items for the student</h2><span className="call-muted">Next steps</span></div>
              <p className="call-muted" style={{ marginTop: 0, marginBottom: 12 }}>Enter one task per line. These tasks will appear alongside the published summary in the student's session view.</p>
              <textarea className="call-summary-editor" aria-label="Session action items" placeholder={'Example: Research three UX portfolios\nPrepare a case study outline'} value={sessionActionItems} onChange={event => { setSessionActionItems(event.target.value); setSummaryPublishNotice('') }} />
              <div className="call-publish-footer"><span className="call-muted">Review the notes before sharing them with the student.</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><button className="call-primary-button" type="button" style={{ background: '#fff', color: '#176b4d' }} onClick={() => { navigator.clipboard?.writeText(transcriptionText).catch(() => {}); }}>Copy transcript</button><button className="call-primary-button" type="button" onClick={publishSessionSummary}>Publish summary to student →</button></div></div>
              {summaryPublishNotice && <div className={`call-alert ${summaryPublishNotice.startsWith('Summary published') ? 'success' : 'error'}`} role="status">{summaryPublishNotice}</div>}
            </div>
          </section>
        )}

        {activePage === 'Availability' && selectedRole === 'Mentor' && (
          <section className="simple-page availability-page">
            <style>{`
              .availability-page { width: min(100% - 48px, 1280px); margin: 0 auto; padding: 42px 0 56px; text-align: left; color: #173328; }
              .availability-page .eyebrow { margin-bottom: 10px; color: #398260; font-size: 10px; font-weight: 800; letter-spacing: 1.8px; }
              .availability-page h1 { margin: 0; color: #123327; font-size: clamp(30px, 3vw, 38px); line-height: 1.15; letter-spacing: -1.3px; font-weight: 750; }
              .availability-page .page-intro { max-width: 680px; margin: 12px 0 26px; color: #728078; font-size: 14px; line-height: 1.7; }
              .availability-page .availability-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 22px; margin-top: 0 !important; }
              .availability-page .dashboard-panel { min-width: 0; padding: 24px; border: 1px solid #e4ece7; border-radius: 18px; background: #fff; box-shadow: 0 8px 26px rgba(19, 54, 37, .045); }
              .availability-page .dashboard-panel-heading { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #edf2ee; }
              .availability-page .dashboard-panel-heading h2 { margin: 0; color: #1d3d2e; font-size: 17px; font-weight: 750; letter-spacing: -.35px; }
              .availability-page .availability-form { display: flex; flex-direction: column; gap: 9px; }
              .availability-page .availability-form label { margin-top: 4px; font-size: 11px; font-weight: 750; letter-spacing: .15px; color: #697a70; }
              .availability-page .availability-form input, .availability-page .availability-form select { box-sizing: border-box; width: 100%; min-height: 46px; border: 1px solid #dce7df; border-radius: 10px; padding: 10px 13px; background: #fbfdfb; color: #1d3328; font: inherit; font-size: 13px; outline: none; transition: border-color .18s ease, box-shadow .18s ease, background .18s ease; }
              .availability-page .availability-form input:focus, .availability-page .availability-form select:focus { border-color: #4c9971; background: #fff; box-shadow: 0 0 0 3px rgba(64, 143, 99, .12); }
              .availability-page .availability-time-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 14px; margin: 3px 0 6px; }
              .availability-page .availability-time-grid > div { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
              .availability-page .primary-button { width: 100%; min-height: 45px; margin-top: 8px; border: 0; border-radius: 10px; background: #123c2d; color: #fff; font-size: 12px; font-weight: 750; cursor: pointer; transition: transform .18s ease, background .18s ease, box-shadow .18s ease; }
              .availability-page .primary-button:hover { background: #1b5a40; box-shadow: 0 5px 14px rgba(18, 60, 45, .14); transform: translateY(-1px); }
              .availability-page .availability-list { margin-top: 20px; }
              .availability-page .availability-list-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0; border-top: 1px solid #edf2ee; }
              .availability-page .availability-list-row strong, .availability-page .availability-list-row small { display: block; }
              .availability-page .availability-list-row strong { color: #274335; font-size: 13px; font-weight: 750; }
              .availability-page .availability-list-row small { margin-top: 4px; color: #7a8980; font-size: 12px; }
              .availability-page .availability-list-row .book-button { flex: 0 0 auto; padding: 8px 11px; border: 1px solid #dce9e0; border-radius: 8px; background: #f7fbf8; color: #2b6d4b; font-size: 11px; font-weight: 700; cursor: pointer; }
              .availability-page .muted-copy { color: #89958d; font-size: 12px; line-height: 1.65; }
              .availability-page .availability-notice { margin-top: 20px; padding: 13px 16px; border: 1px solid #d8ebdf; border-radius: 11px; background: #f0f9f3; color: #23764f; font-size: 13px; }
              .availability-page .availability-footnote { margin-top: 20px; padding: 14px 16px; border-radius: 10px; background: #f6faf7; color: #7b8a80; font-size: 11px; line-height: 1.7; }
              @media (max-width: 900px) { .availability-page { width: min(100% - 32px, 680px); padding-top: 30px; } .availability-page .availability-layout { grid-template-columns: 1fr; gap: 16px; } }
              @media (max-width: 520px) { .availability-page .dashboard-panel { padding: 18px; border-radius: 14px; } .availability-page .availability-time-grid { grid-template-columns: 1fr; gap: 10px; } }
              @media (prefers-reduced-motion: no-preference) { .availability-page .availability-list-row { transition: background .18s ease; } .availability-page .availability-list-row:hover { background: #fbfdfb; } }
            `}</style>
            <div className="eyebrow">MENTOR WORKSPACE</div>
            <h1>My availability</h1>
            <p className="page-intro">Set your usual weekly hours, then add extra slots or block specific dates. Your schedule is saved in this browser for now.</p>

            <div className="dashboard-columns availability-layout">
              <div className="dashboard-panel">
                <div className="dashboard-panel-heading"><h2>Weekly schedule</h2></div>
                <form onSubmit={saveWeeklyAvailability} className="availability-form">
                  <label htmlFor="availability-day">Day of week</label>
                  <select id="availability-day" value={availabilityDay} onChange={event => setAvailabilityDay(event.target.value)}>
                    {weekdayNames.map(day => <option key={day} value={day}>{day}</option>)}
                  </select>
                  <div className="availability-time-grid">
                    <div><label htmlFor="weekly-start">Start time</label><input id="weekly-start" type="time" value={availabilityStart} onChange={event => setAvailabilityStart(event.target.value)} required /></div>
                    <div><label htmlFor="weekly-end">End time</label><input id="weekly-end" type="time" value={availabilityEnd} onChange={event => setAvailabilityEnd(event.target.value)} required /></div>
                  </div>
                  <button className="primary-button" type="submit">Save weekly hours</button>
                </form>
                <div className="availability-list">
                  {weekdayNames.filter(day => currentMentorAvailability.weekly?.[day]).map(day => (
                    <div className="availability-list-row" key={day}>
                      <div><strong>{day}</strong><small>{currentMentorAvailability.weekly[day].start}–{currentMentorAvailability.weekly[day].end}</small></div>
                      <button className="book-button" type="button" onClick={() => removeWeeklyDay(day)}>Remove</button>
                    </div>
                  ))}
                  {!weekdayNames.some(day => currentMentorAvailability.weekly?.[day]) && <p className="muted-copy">No weekly hours set yet. Add a day above.</p>}
                </div>
              </div>

              <div className="dashboard-panel">
                <div className="dashboard-panel-heading"><h2>Date-specific changes</h2></div>
                <form onSubmit={addDateOverride} className="availability-form">
                  <label htmlFor="override-date">Date</label>
                  <input id="override-date" type="date" value={overrideDate} min={new Date().toISOString().slice(0, 10)} onChange={event => setOverrideDate(event.target.value)} required />
                  <label htmlFor="override-type">Change type</label>
                  <select id="override-type" value={overrideType} onChange={event => setOverrideType(event.target.value)}>
                    <option value="extra">Add an extra available slot</option>
                    <option value="blocked">Block the whole date</option>
                  </select>
                  {overrideType === 'extra' && (
                    <div className="availability-time-grid">
                      <div><label htmlFor="override-start">Start time</label><input id="override-start" type="time" value={overrideStart} onChange={event => setOverrideStart(event.target.value)} required /></div>
                      <div><label htmlFor="override-end">End time</label><input id="override-end" type="time" value={overrideEnd} onChange={event => setOverrideEnd(event.target.value)} required /></div>
                    </div>
                  )}
                  <button className="primary-button" type="submit">Add date change</button>
                </form>
                <div className="availability-list">
                  {[...currentMentorAvailability.overrides].sort((a, b) => a.date.localeCompare(b.date)).map(item => (
                    <div className="availability-list-row" key={item.id}>
                      <div><strong>{item.date}</strong><small>{item.type === 'blocked' ? 'Unavailable all day' : `Extra slot: ${item.start}–${item.end}`}</small></div>
                      <button className="book-button" type="button" onClick={() => removeDateOverride(item.id)}>Remove</button>
                    </div>
                  ))}
                  {currentMentorAvailability.overrides.length === 0 && <p className="muted-copy">No date-specific changes yet.</p>}
                </div>
              </div>
            </div>
            {availabilityNotice && <p role="status" className="availability-notice">{availabilityNotice}</p>}
            <p className="availability-footnote">These settings are currently stored in this browser only and are not shared across devices. Booking-slot calculation can be connected to these rules in a later step.</p>
          </section>
        )}

        {activePage === 'My action plan' && (
          <section className="simple-page action-plan-page">
            <style>{`
              .action-plan-page { max-width: 1120px; margin: 0 auto; padding: 42px 44px 64px; text-align: left; color: #182b25; }
              .action-plan-page .eyebrow { margin-bottom: 12px; color: #287b5a; font-size: 11px; font-weight: 800; letter-spacing: 1.8px; }
              .action-plan-page h1 { margin: 0; color: #102c22; font-size: clamp(30px, 3vw, 38px); line-height: 1.15; letter-spacing: -1.25px; font-weight: 700; }
              .action-plan-page .page-intro { max-width: 620px; margin: 12px 0 28px; color: #718078; font-size: 14px; line-height: 1.7; }
              .action-plan-overview { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 26px; padding: 20px 22px; border: 1px solid #e2ece6; border-radius: 16px; background: linear-gradient(115deg, #f3faf6 0%, #ffffff 78%); }
              .action-plan-overview-copy { display: flex; align-items: center; gap: 14px; min-width: 0; }
              .action-plan-overview-icon { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; border-radius: 13px; background: #dff2e7; color: #216b4b; font-size: 21px; }
              .action-plan-overview h2 { margin: 0 0 5px; color: #193c2d; font-size: 16px; font-weight: 700; letter-spacing: -.2px; }
              .action-plan-overview p { margin: 0; color: #74837a; font-size: 12px; line-height: 1.5; }
              .action-plan-count { flex: 0 0 auto; min-width: 72px; padding: 10px 13px; border: 1px solid #dce9e1; border-radius: 12px; background: #fff; text-align: center; }
              .action-plan-count strong { display: block; color: #1d6948; font-size: 24px; line-height: 1.1; letter-spacing: -.8px; }
              .action-plan-count span { display: block; margin-top: 4px; color: #78877e; font-size: 10px; }
              .action-plan-list { overflow: hidden; border: 1px solid #e7ece8; border-radius: 16px; background: #fff; box-shadow: 0 5px 20px rgba(23, 55, 39, .035); }
              .action-plan-list-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 22px; border-bottom: 1px solid #edf1ee; }
              .action-plan-list-header h2 { margin: 0; color: #20372b; font-size: 16px; font-weight: 700; letter-spacing: -.25px; }
              .action-plan-list-header p { margin: 5px 0 0; color: #8a958e; font-size: 12px; }
              .action-plan-list-body { padding: 0 22px; }
              .action-plan-task { display: flex; align-items: center; gap: 15px; min-height: 78px; padding: 16px 0; border-bottom: 1px solid #f0f3f1; }
              .action-plan-task:last-child { border-bottom: 0; }
              .action-plan-task-number { display: grid; place-items: center; flex: 0 0 36px; width: 36px; height: 36px; border: 1px solid #dcebe1; border-radius: 11px; background: #f1f8f4; color: #327553; font-size: 12px; font-weight: 700; }
              .action-plan-task-copy { flex: 1; min-width: 0; color: #293b31; font-size: 14px; font-weight: 600; line-height: 1.55; overflow-wrap: anywhere; }
              .action-plan-task-mark { flex: 0 0 auto; color: #9aa79f; font-size: 18px; }
              .action-plan-empty { padding: 38px 22px; text-align: center; }
              .action-plan-empty-icon { display: grid; place-items: center; width: 48px; height: 48px; margin: 0 auto 12px; border-radius: 15px; background: #f0f7f2; color: #367854; font-size: 22px; }
              .action-plan-empty h3 { margin: 0 0 7px; color: #23382c; font-size: 15px; }
              .action-plan-empty p { max-width: 360px; margin: 0 auto; color: #7c8981; font-size: 12px; line-height: 1.6; }
              .action-plan-footnote { margin: 13px 2px 0; color: #89958d; font-size: 11px; line-height: 1.6; }
              @media (max-width: 700px) { .action-plan-page { padding: 28px 18px 40px; } .action-plan-overview { align-items: flex-start; padding: 16px; } .action-plan-overview-copy { gap: 10px; } .action-plan-overview-icon { flex-basis: 38px; width: 38px; height: 38px; } .action-plan-list-header { padding: 17px 16px; } .action-plan-list-body { padding: 0 16px; } .action-plan-task { gap: 11px; } }
              @media (prefers-reduced-motion: no-preference) { .action-plan-task { transition: background .18s ease; } .action-plan-task:hover { background: #fbfdfb; } }
            `}</style>
            <div className="eyebrow">SMALL STEPS, REAL PROGRESS</div>
            <h1>My action plan</h1>
            <p className="page-intro">A clear list of the next steps in your career journey. Start with one task and build momentum from there.</p>

            {(() => {
              const profileTasks = (currentStudent?.['Action Items'] || '').split(';').map(item => item.trim()).filter(Boolean).map((text, index) => ({ id: `profile-${index}-${text}`, text, source: 'Profile' }))
              const sessionTasks = publishedSummaries.filter(item => item.studentUsername === (currentStudent?.Username || '').toLowerCase()).flatMap(item => (item.actionItems || []).map((text, index) => ({ id: `${item.id}-${index}`, text, source: `Session with ${item.mentorName}` })))
              const allTasks = [...profileTasks, ...sessionTasks]
              return <>
            <div className="action-plan-overview">
              <div className="action-plan-overview-copy">
                <div className="action-plan-overview-icon">✓</div>
                <div>
                  <h2>Your next steps</h2>
                  <p>Tasks currently saved in your student profile</p>
                </div>
              </div>
              <div className="action-plan-count">
                <strong>{allTasks.length.toString().padStart(2, '0')}</strong>
                <span>{allTasks.length === 1 ? 'task listed' : 'tasks listed'}</span>
              </div>
            </div>

            <div className="action-plan-list">
              <div className="action-plan-list-header">
                <div><h2>Action items</h2><p>Your current focus, all in one place.</p></div>
              </div>
              {allTasks.length > 0 ? (
                <div className="action-plan-list-body">
                  {allTasks.map((item, index) => (
                    <div className="action-plan-task" key={item.id}>
                      <span className="action-plan-task-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="action-plan-task-copy">{item.text}<small style={{ display: 'block', marginTop: 4, color: '#829087', fontSize: 11, fontWeight: 400 }}>{item.source}</small></span>
                      <span className="action-plan-task-mark" aria-hidden="true">○</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="action-plan-empty">
                  <div className="action-plan-empty-icon">✓</div>
                  <h3>No action items yet</h3>
                  <p>When tasks are added to your student profile, they will appear here so you can keep track of your next steps.</p>
                </div>
              )}
            </div>
            <p className="action-plan-footnote">This plan combines profile tasks with action items from published mentoring summaries. Tasks are currently read-only and saved locally in this browser.</p>
              </>
            })()}
          </section>
        )}
      </main>
    </div>
  )
}

export default App
