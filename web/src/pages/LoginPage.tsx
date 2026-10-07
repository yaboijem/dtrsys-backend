import { useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { login } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Button, Field, Input } from '../components/ui';

export function LoginPage() {
  const { token, signIn } = useAuth();
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      if (result.token) {
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
    <div className="flex min-h-full items-center justify-center bg-bg p-4 sm:p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-7 flex flex-col items-center gap-2.5">
          <img src="/logo.png" alt="DTR" width={48} height={48} className="h-12 w-12 rounded-xl shadow-sm" />
          <h1 className="text-xl font-bold tracking-tight text-text">DTR Admin</h1>
          <p className="text-sm text-muted">Sign in with your employee account</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Employee ID" required error={fieldErrors.employee_id?.[0]}>
            <Input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="Enter your employee ID"
              autoComplete="username"
              autoFocus
            />
          </Field>
          <Field label="Password" required error={fieldErrors.password?.[0]}>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-muted hover:text-text"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
