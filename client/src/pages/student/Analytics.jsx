import { api } from '../../api.js';
import { Gate, PageHeader, useAsync } from '../../components/ui.jsx';
import StudentReport from '../master/StudentReport.jsx';

/** Results: everything you did (time, Question Bank, Take a quiz, practice tests, vocabulary, Word Arena). */
export default function Analytics() {
  const st = useAsync(() => api.get('/me/report'), []);
  return (
    <div className="page">
      <PageHeader title="Results" sub="Everything you practise is counted here: time, questions, tests, words and games." />
      <Gate state={st}>{(rep) => <StudentReport r={rep} self />}</Gate>
    </div>
  );
}
