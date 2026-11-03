import { useState } from 'react';
import { api } from '../../api.js';
import { Gate, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import AnalyticsView from '../../components/AnalyticsView.jsx';
import StudentReport from '../master/StudentReport.jsx';

/** Results: everything you did (time, Question Bank, quizzes, practice tests, vocabulary, Word Arena) plus quiz analysis. */
export default function Analytics() {
  const st = useAsync(() => Promise.all([api.get('/me/report'), api.get('/me/analytics')]), []);
  const [tab, setTab] = useState('all');
  return (
    <div className="page">
      <PageHeader title="Results analysis" sub="Everything you practise is counted here: time, questions, tests, words and games." />
      <Gate state={st}>{([rep, a]) => (
        <>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'all', label: 'Overview' }, { value: 'quiz', label: 'Teacher quizzes' }]} />
          {tab === 'all' ? <StudentReport r={rep} self /> : <AnalyticsView a={a} />}
        </>
      )}</Gate>
    </div>
  );
}
