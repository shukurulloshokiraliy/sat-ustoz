import { Component, lazy, Suspense, useEffect } from 'react';
import { countVisit } from './visit.js';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { OfflineBar } from './offline.js';
import { UpdateBar } from './updates.jsx';
import ActivityTracker from './components/ActivityTracker.jsx';
import { useAuth } from './context.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/student/Dashboard.jsx';
import { LimitWall } from './usage.jsx';

// pages load on demand: a smaller first download on mobile data (each page is its own file).
// After a new deploy an open tab may ask for an old file name: reload once to get the new version.
const page = (load) => lazy(() => load().then((m) => { try { sessionStorage.removeItem('chunk-reload'); } catch { /* ignore */ } return m; }).catch((e) => {
  let again = false; try { again = !sessionStorage.getItem('chunk-reload'); sessionStorage.setItem('chunk-reload', '1'); } catch { /* ignore */ }
  if (again && navigator.onLine) { window.location.reload(); return new Promise(() => {}); }
  throw e;
}));
const MockTaker = page(() => import('./pages/mock/MockTaker.jsx'));
const MockResult = page(() => import('./pages/mock/MockResult.jsx'));
const Leaderboard = page(() => import('./pages/student/Leaderboard.jsx'));
const Finance = page(() => import('./pages/master/Finance.jsx'));
const Progress = page(() => import('./pages/master/Progress.jsx'));
const Reports = page(() => import('./pages/master/Reports.jsx'));
const Quality = page(() => import('./pages/master/Quality.jsx'));
const Mistakes = page(() => import('./pages/student/Mistakes.jsx'));
const MistakeReview = page(() => import('./pages/student/Mistakes.jsx').then((m) => ({ default: m.MistakeReview })));
const Assignments = page(() => import('./pages/student/Assignments.jsx'));
const FullMocks = page(() => import('./pages/fullmock/FullMocks.jsx'));
const FullMockTaker = page(() => import('./pages/fullmock/FullMockTaker.jsx'));
const FullMockResult = page(() => import('./pages/fullmock/FullMockResult.jsx'));
const FullMockAdmin = page(() => import('./pages/master/FullMockAdmin.jsx'));
const Consultations = page(() => import('./pages/student/Consultations.jsx'));
const ConsultationsAdmin = page(() => import('./pages/master/ConsultationsAdmin.jsx'));
const Roadmap = page(() => import('./pages/student/Roadmap.jsx'));
const Quizzes = page(() => import('./pages/student/Quizzes.jsx'));
const Analytics = page(() => import('./pages/student/Analytics.jsx'));
const Saved = page(() => import('./pages/student/Saved.jsx'));
const Portfolio = page(() => import('./pages/student/Portfolio.jsx'));
const Profile = page(() => import('./pages/Profile.jsx'));
const QuizTaker = page(() => import('./pages/quiz/QuizTaker.jsx'));
const Result = page(() => import('./pages/quiz/Result.jsx'));
const Students = page(() => import('./pages/master/Students.jsx'));
const StudentDetail = page(() => import('./pages/master/StudentDetail.jsx'));
const Groups = page(() => import('./pages/master/Groups.jsx'));
const QuizManager = page(() => import('./pages/master/QuizManager.jsx'));
const QuizEditor = page(() => import('./pages/master/QuizEditor.jsx'));
const RoadmapEditor = page(() => import('./pages/master/RoadmapEditor.jsx'));
const Settings = page(() => import('./pages/master/Settings.jsx'));
const Welcome = page(() => import('./pages/student/Welcome.jsx'));
const Subscribe = page(() => import('./pages/student/Subscribe.jsx'));
const PlacementTest = page(() => import('./pages/placement/PlacementTest.jsx'));
const PlacementResult = page(() => import('./pages/placement/PlacementResult.jsx'));
const Lesson = page(() => import('./pages/lesson/Lesson.jsx'));
const QuestionBank = page(() => import('./pages/qbank/QuestionBank.jsx'));
const QbankPractice = page(() => import('./pages/qbank/QbankPractice.jsx'));
const QbankAdmin = page(() => import('./pages/master/QbankAdmin.jsx'));
const LevelCheck = page(() => import('./pages/lesson/LevelCheck.jsx'));
const LevelCheckResult = page(() => import('./pages/lesson/LevelCheck.jsx').then((m) => ({ default: m.LevelCheckResult })));
const Practice = page(() => import('./pages/public/Practice.jsx'));
const AboutPage = page(() => import('./pages/public/Pages.jsx').then((m) => ({ default: m.AboutPage })));
const PageView = page(() => import('./pages/public/Pages.jsx').then((m) => ({ default: m.PageView })));
const SectionPage = page(() => import('./pages/public/Pages.jsx').then((m) => ({ default: m.SectionPage })));
const Website = page(() => import('./pages/master/Website.jsx'));
const Support = page(() => import('./pages/master/Support.jsx'));
const VocabHome = page(() => import('./pages/vocab/VocabHome.jsx'));
const VocabUnit = page(() => import('./pages/vocab/VocabUnit.jsx'));
const VocabReview = page(() => import('./pages/vocab/VocabUnit.jsx').then((m) => ({ default: m.VocabReview })));
const GameHub = page(() => import('./pages/game/GameHub.jsx'));
const Play = page(() => import('./pages/game/Play.jsx'));
const JoinCode = page(() => import('./pages/game/Play.jsx').then((m) => ({ default: m.JoinCode })));
const Login = page(() => import('./pages/Login.jsx'));
const Live = page(() => import('./pages/student/Live.jsx'));
const Overview = page(() => import('./pages/master/Overview.jsx'));
const PublicLayout = page(() => import('./pages/public/PublicLayout.jsx'));
const Landing = page(() => import('./pages/public/Landing.jsx'));
const LocalPage = page(() => import('./pages/public/LocalPage.jsx'));
const Wait = () => <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><Spinner /></div>;

export default function App() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  // the teacher's Visitors count (teachers themselves are not counted)
  useEffect(() => { if (!loading && user?.role !== 'master') countVisit(loc.pathname); }, [loc.pathname, loading, user?.role]);
  if (loading) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spinner /></div>;
  // visitors: the website (home, free practice tests, guides) — sign-in only when they want it
  if (!user) return (
    <Suspense fallback={<Wait />}><OfflineBar />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Login />} />
      <Route path="/play/:code" element={<Play />} />
      <Route path="/game" element={<JoinCode />} />
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="practice" element={<Practice />} />
        <Route path="s/:id" element={<SectionPage />} />
        <Route path="p/:slug" element={<PageView />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="uz" element={<LocalPage />} />
        <Route path="uz/:slug" element={<LocalPage />} />
        <Route path="ru" element={<LocalPage />} />
        <Route path="*" element={<Landing />} />
      </Route>
    </Routes></Suspense>
  );
  // the placement test is optional: new students see an invitation on the dashboard, nothing is blocked

  return (
    <Suspense fallback={<Wait />}><OfflineBar /><UpdateBar />{user.role === 'student' && <><ActivityTracker /><LimitWall /></>}
    <PageGuard path={loc.pathname}><Routes>
      {user.role === 'student' && <Route path="/quiz/:id" element={<QuizTaker />} />}
      {user.role === 'student' && <Route path="/placement/test" element={<PlacementTest />} />}
      {user.role === 'student' && <Route path="/lesson/:id/check" element={<LevelCheck />} />}
      {user.role === 'student' && <Route path="/question-bank/practice" element={<QbankPractice />} />}
      {user.role === 'student' && <Route path="/mistakes/review" element={<MistakeReview />} />}
      {user.role === 'student' && <Route path="/mock" element={<MockTaker />} />}
      {user.role === 'student' && <Route path="/exam/:itemId" element={<MockTaker />} />}
      {user.role === 'student' && <Route path="/full-mock/:aid" element={<FullMockTaker />} />}
      <Route path="/site" element={<PublicLayout />}>
        <Route index element={<Landing />} />
      </Route>
      <Route path="/s/:id" element={<PublicLayout />}><Route index element={<SectionPage />} /></Route>
      <Route path="/p/:slug" element={<PublicLayout />}><Route index element={<PageView />} /></Route>
      <Route path="/about" element={<PublicLayout />}><Route index element={<AboutPage />} /></Route>
      <Route path="/uz" element={<PublicLayout />}><Route index element={<LocalPage />} /><Route path=":slug" element={<LocalPage />} /></Route>
      <Route path="/ru" element={<PublicLayout />}><Route index element={<LocalPage />} /></Route>
      <Route path="/play/:code" element={<Play />} />
      <Route element={<Layout />}>
        <Route path="practice" element={<Practice />} />
        <Route path="vocab" element={<VocabHome />} />
        <Route path="vocab/deck/:deckId" element={<VocabHome />} />
        <Route path="vocab/unit/:id" element={<VocabUnit />} />
        <Route path="vocab/review" element={<VocabReview />} />
        <Route path="game" element={<GameHub />} />
        {user.role === 'master' ? (
          <>
            <Route index element={<Overview />} />
            <Route path="students" element={<Students />} />
            <Route path="students/:id" element={<StudentDetail />} />
            <Route path="groups" element={<Groups />} />
            <Route path="quizzes" element={<QuizManager />} />
            <Route path="quizzes/new" element={<QuizEditor />} />
            <Route path="quizzes/:id/edit" element={<QuizEditor />} />
            <Route path="roadmap" element={<RoadmapEditor />} />
            <Route path="settings" element={<Settings />} />
            <Route path="question-bank/manage" element={<QbankAdmin />} />
            <Route path="full-mocks" element={<FullMockAdmin />} />
            <Route path="consultations" element={<ConsultationsAdmin />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="finance" element={<Finance />} />
            <Route path="progress" element={<Progress />} />
            <Route path="reports" element={<Reports />} />
            <Route path="quality" element={<Quality />} />
            <Route path="assignments" element={<Assignments />} />
            <Route path="website" element={<Website />} />
            <Route path="support" element={<Support />} />
          </>
        ) : (
          <>
            <Route index element={<Dashboard />} />
            <Route path="roadmap" element={<Roadmap />} />
            <Route path="quizzes" element={<Quizzes />} />
            <Route path="mock/:id" element={<MockResult />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="assignments" element={<Assignments />} />
            <Route path="full-mocks" element={<FullMocks />} />
            <Route path="consultations" element={<Consultations />} />
            <Route path="full-mock/result/:aid" element={<FullMockResult />} />
            <Route path="saved" element={<Saved />} />
            <Route path="mistakes" element={<Mistakes />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="subscribe" element={<Subscribe />} />
            <Route path="welcome" element={<Welcome />} />
            <Route path="placement" element={<Welcome />} />
          </>
        )}
        <Route path="result/:id" element={<Result />} />
        <Route path="placement/result/:id" element={<PlacementResult />} />
        <Route path="lesson/:id" element={<Lesson />} />
        <Route path="lesson-check/:id" element={<LevelCheckResult />} />
        <Route path="live" element={<Live />} />
        <Route path="profile" element={<Profile />} />
        <Route path="question-bank" element={<QuestionBank />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="signup" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes></PageGuard></Suspense>
  );
}

/** A page that crashes shows what went wrong (and a way out) instead of a white screen. */
class PageGuard extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error(err); }
  componentDidUpdate(prev) { if (prev.path !== this.props.path && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="crash">
        <h2>This page could not open</h2>
        <p className="muted">Reload it. If it happens again, send a screenshot of this message to the developer.</p>
        <code>{String(this.state.err?.message || this.state.err).slice(0, 300)}</code>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
          <a className="btn ghost" href="/">Go to the dashboard</a>
        </div>
      </div>
    );
  }
}
