import { NavLink } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import { IconBolt, IconTarget } from './icons.jsx';

/** One "Practice" section: timed practice tests and the Question Bank side by side. */
export default function PracticeTabs() {
  const { user } = useAuth();
  if (!user || user.role !== 'student') return null;
  return (
    <nav className="ptabs" aria-label="Practice">
      <NavLink to="/practice" end><IconBolt width={17} height={17} /> Practice tests</NavLink>
      <NavLink to="/question-bank" end><IconTarget width={17} height={17} /> Question Bank</NavLink>
    </nav>
  );
}
