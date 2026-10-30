import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/student/Dashboard.jsx';
import Roadmap from './pages/student/Roadmap.jsx';
import Quizzes from './pages/student/Quizzes.jsx';
import Analytics from './pages/student/Analytics.jsx';
import Saved from './pages/student/Saved.jsx';
import Portfolio from './pages/student/Portfolio.jsx';
import Profile from './pages/Profile.jsx';
import QuizTaker from './pages/quiz/QuizTaker.jsx';
import Result from './pages/quiz/Result.jsx';
import Overview from './pages/master/Overview.jsx';
import Students from './pages/master/Students.jsx';
import StudentDetail from './pages/master/StudentDetail.jsx';
import Groups from './pages/master/Groups.jsx';
import QuizManager from './pages/master/QuizManager.jsx';
import QuizEditor from './pages/master/QuizEditor.jsx';
import RoadmapEditor from './pages/master/RoadmapEditor.jsx';
import Settings from './pages/master/Settings.jsx';
import Welcome from './pages/student/Welcome.jsx';
import Subscribe from './pages/student/Subscribe.jsx';
import PlacementTest from './pages/placement/PlacementTest.jsx';
import PlacementResult from './pages/placement/PlacementResult.jsx';
import Lesson from './pages/lesson/Lesson.jsx';
import QuestionBank from './pages/qbank/QuestionBank.jsx';
import QbankPractice from './pages/qbank/QbankPractice.jsx';
import QbankAdmin from './pages/master/QbankAdmin.jsx';
import LevelCheck, { LevelCheckResult } from './pages/lesson/LevelCheck.jsx';
import PublicLayout from './pages/public/PublicLayout.jsx';
import Landing from './pages/public/Landing.jsx';
import Practice from './pages/public/Practice.jsx';
import { AboutPage, PageView, SectionPage } from './pages/public/Pages.jsx';
import Website from './pages/master/Website.jsx';
import Support from './pages/master/Support.jsx';

export default function App() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spinner /></div>;
  // visitors: the website (home, free practice tests, guides) — sign-in only when they want it
  if (!user) return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Login />} />
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="practice" element={<Practice />} />
        <Route path="s/:id" element={<SectionPage />} />
        <Route path="p/:slug" element={<PageView />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<Landing />} />
      </Route>
    </Routes>
  );
  // the placement test is optional: new students see an invitation on the dashboard, nothing is blocked

  return (
    <Routes>
      {user.role === 'student' && <Route path="/quiz/:id" element={<QuizTaker />} />}
      {user.role === 'student' && <Route path="/placement/test" element={<PlacementTest />} />}
      {user.role === 'student' && <Route path="/lesson/:id/check" element={<LevelCheck />} />}
      {user.role === 'student' && <Route path="/question-bank/practice" element={<QbankPractice />} />}
      <Route path="/site" element={<PublicLayout />}>
        <Route index element={<Landing />} />
      </Route>
      <Route path="/s/:id" element={<PublicLayout />}><Route index element={<SectionPage />} /></Route>
      <Route path="/p/:slug" element={<PublicLayout />}><Route index element={<PageView />} /></Route>
      <Route path="/about" element={<PublicLayout />}><Route index element={<AboutPage />} /></Route>
      <Route element={<Layout />}>
        <Route path="practice" element={<Practice />} />
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
            <Route path="website" element={<Website />} />
            <Route path="support" element={<Support />} />
          </>
        ) : (
          <>
            <Route index element={<Dashboard />} />
            <Route path="roadmap" element={<Roadmap />} />
            <Route path="quizzes" element={<Quizzes />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="saved" element={<Saved />} />
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
        <Route path="profile" element={<Profile />} />
        <Route path="question-bank" element={<QuestionBank />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="signup" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
