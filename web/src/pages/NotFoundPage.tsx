import { Link } from 'react-router-dom';
import { Button } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <div className="font-mono text-5xl font-bold text-text">404</div>
      <p className="text-sm text-muted">The page you are looking for does not exist.</p>
      <Link to="/">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
