import { useEffect, useState } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { ensureInitialized } from './db/init'
import { initAudioUnlock } from './lib/audio'
import { AppShell } from './components/layout/AppShell'
import { RequireParent } from './components/layout/RequireParent'
import { OnboardingPage } from './pages/OnboardingPage'
import { ChildHomePage } from './pages/ChildHomePage'
import { ParentPinPage } from './pages/ParentPinPage'
import { ParentDashboardPage } from './pages/ParentDashboardPage'
import { ParentChildrenPage } from './pages/ParentChildrenPage'
import { ParentSettingsPage } from './pages/ParentSettingsPage'
import { ParentTasksPage } from './pages/ParentTasksPage'
import { ParentRewardsPage } from './pages/ParentRewardsPage'
import { ParentGrowthPage } from './pages/ParentGrowthPage'
import { ParentArchivePage } from './pages/ParentArchivePage'
import { ParentHealthHubPage } from './pages/ParentHealthHubPage'
import { GenericRecordListPage } from './pages/GenericRecordListPage'
import { ParentExamsPage } from './pages/ParentExamsPage'
import { ParentAnecdotesPage } from './pages/ParentAnecdotesPage'
import { ParentTalentsPage } from './pages/ParentTalentsPage'
import { ParentReportPage } from './pages/ParentReportPage'
import { TimelinePage } from './pages/TimelinePage'
import { KidRewardsPage } from './pages/KidRewardsPage'
import { KidBadgesPage } from './pages/KidBadgesPage'
import { LearnHomePage } from './pages/LearnHomePage'
import { StudySessionPage } from './pages/StudySessionPage'
import { MathDrillPage } from './pages/MathDrillPage'
import { EnglishTalkPage } from './pages/EnglishTalkPage'
import { ErrorBookPage } from './pages/ErrorBookPage'
import { ParentLearningPage } from './pages/ParentLearningPage'

function AppRoutes() {
  const childCount = useLiveQuery(() => db.children.count(), [])

  if (childCount === undefined) return null
  if (childCount === 0) {
    return (
      <Routes>
        <Route path="*" element={<OnboardingPage />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<ChildHomePage />} />
        <Route path="/rewards" element={<KidRewardsPage />} />
        <Route path="/badges" element={<KidBadgesPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/learn" element={<LearnHomePage />} />
        <Route path="/learn/math" element={<MathDrillPage />} />
        <Route path="/learn/talk" element={<EnglishTalkPage />} />
        <Route path="/learn/errorbook" element={<ErrorBookPage />} />
        <Route path="/learn/session/:deckId/:mode" element={<StudySessionPage />} />
        <Route
          path="/parent/learn"
          element={
            <RequireParent>
              <ParentLearningPage />
            </RequireParent>
          }
        />
        <Route path="/parent/pin" element={<ParentPinPage />} />
        <Route
          path="/parent"
          element={
            <RequireParent>
              <ParentDashboardPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/children"
          element={
            <RequireParent>
              <ParentChildrenPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/settings"
          element={
            <RequireParent>
              <ParentSettingsPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/tasks"
          element={
            <RequireParent>
              <ParentTasksPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/rewards"
          element={
            <RequireParent>
              <ParentRewardsPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/growth"
          element={
            <RequireParent>
              <ParentGrowthPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/archive"
          element={
            <RequireParent>
              <ParentArchivePage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/health"
          element={
            <RequireParent>
              <ParentHealthHubPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/records/:module"
          element={
            <RequireParent>
              <GenericRecordListPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/exams"
          element={
            <RequireParent>
              <ParentExamsPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/anecdotes"
          element={
            <RequireParent>
              <ParentAnecdotesPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/talents"
          element={
            <RequireParent>
              <ParentTalentsPage />
            </RequireParent>
          }
        />
        <Route
          path="/parent/report"
          element={
            <RequireParent>
              <ParentReportPage />
            </RequireParent>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

// 单文件/Artifact 部署没有服务端路由,改用 hash 路由
const Router = import.meta.env.VITE_ARTIFACT ? HashRouter : BrowserRouter

export default function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    initAudioUnlock()
    ensureInitialized().then(() => setReady(true))
  }, [])

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-4xl">🌱</div>
  }

  return (
    <Router>
      <AppRoutes />
    </Router>
  )
}
