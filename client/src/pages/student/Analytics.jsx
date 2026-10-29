import { api } from '../../api.js';
import { Gate, PageHeader, useAsync } from '../../components/ui.jsx';
import AnalyticsView from '../../components/AnalyticsView.jsx';

export default function Analytics() {
  const st = useAsync(() => api.get('/me/analytics'), []);
  return (
    <div className="page">
      <PageHeader title={"Results analysis"} sub={"Where you are strong and where you make mistakes — at a glance."} />
      <Gate state={st}>{(a) => <AnalyticsView a={a} />}</Gate>
    </div>
  );
}
