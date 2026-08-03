import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { ApiError } from '../api/client';
import { login } from '../api/endpoints';
import type { MfaRequiredResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, Field, Input } from '../components/ui';

export function LoginPage() {
  const { token, signIn } = useAuth();
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      const result = await login(employeeId.trim(), password);
      if ('mfa_required' in result && (result as MfaRequiredResponse).mfa_required) {
        sessionStorage.setItem('dtr_mfa_token', (result as MfaRequiredResponse).mfa_token);
        navigate('/mfa');
        return;
      }
      if ('token' in result && result.token) {
        signIn(result.token, result.user);
        navigate('/');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors ?? {});
      } else {
        setError('Unexpected error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-deep ring-1 ring-deep-border">
            <ShieldCheck size={22} className="text-cyan-300" />
          </div>
          <h1 className="text-lg font-bold text-text">DTR Admin</h1>
          <p className="text-xs text-muted">Sign in with your employee account</p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Employee ID" required error={fieldErrors.employee_id?.[0]}>
            <Input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g. HR001"
              autoComplete="username"
              autoFocus
            />
          </Field>
          <Field label="Password" required error={fieldErrors.password?.[0]}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
