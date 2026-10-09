import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { login } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Button, Field, Input } from '../components/ui';
import { cn } from '../lib/cn';

function loginFailure(err: unknown): { alert: string | null; fields: Record<string, string>; credentials: boolean } {
  if (!(err instanceof ApiError)) {
    return { alert: 'Could not sign in. Try again.', fields: {}, credentials: false };
  }
  if (err.status === 0 || err.code === 'network_error') {
    return { alert: 'Cannot reach the server. Check your connection and try again.', fields: {}, credentials: false };
  }
  const fields: Record<string, string> = {};
  const idMsg = err.errors?.employee_id?.[0] ?? '';
  const passwordMsg = err.errors?.password?.[0] ?? '';
  if (/required/i.test(idMsg)) fields.employee_id = 'Enter your employee ID.';
  if (/required/i.test(passwordMsg)) fields.password = 'Enter your password.';
  if (Object.keys(fields).length > 0) {
    return { alert: null, fields, credentials: false };
  }
  const raw = idMsg || passwordMsg || err.message;
  if (/credentials are incorrect|do(?:es)? not match/i.test(raw)) {
    return {
      alert: 'That employee ID and password do not match. Check both and try again.',
      fields: {},
      credentials: true,
    };
  }
  return { alert: raw || 'Could not sign in. Try again.', fields: {}, credentials: false };
}

export function LoginPage() {
  const { token, signIn } = useAuth();
  const navigate = useNavigate();
  const employeeIdRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [credentialsFailed, setCredentialsFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (token) {
    return <Navigate to="/" replace />;
  }

  function clearFailure() {
    setError(null);
    setFieldErrors({});
    setCredentialsFailed(false);
  }

  function focusField(field: 'employee_id' | 'password', select = false) {
    const el = field === 'employee_id' ? employeeIdRef.current : passwordRef.current;
    el?.focus();
    if (select) el?.select();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = employeeId.trim();
    const nextFields: Record<string, string> = {};
    if (!id) nextFields.employee_id = 'Enter your employee ID.';
    if (!password) nextFields.password = 'Enter your password.';
    if (Object.keys(nextFields).length > 0) {
      setError(null);
      setCredentialsFailed(false);
      setFieldErrors(nextFields);
      focusField(nextFields.employee_id ? 'employee_id' : 'password');
      return;
    }

    clearFailure();
    setLoading(true);
    try {
      const result = await login(id, password);
      if (result.user) {
        signIn('session', result.user);
        navigate('/');
      }
    } catch (err) {
      const failure = loginFailure(err);
      setError(failure.alert);
      setFieldErrors(failure.fields);
      setCredentialsFailed(failure.credentials);
      if (failure.fields.employee_id) focusField('employee_id');
      else if (failure.fields.password) focusField('password');
      else if (failure.credentials) focusField('employee_id', true);
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

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field label="Employee ID" required error={fieldErrors.employee_id}>
            <Input
              ref={employeeIdRef}
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                clearFailure();
              }}
              placeholder="Enter your employee ID"
              autoComplete="username"
              autoFocus
              aria-invalid={credentialsFailed || !!fieldErrors.employee_id || undefined}
              className={cn((credentialsFailed || fieldErrors.employee_id) && 'border-danger focus:border-danger')}
            />
          </Field>
          <Field label="Password" required error={fieldErrors.password}>
            <div className="relative">
              <Input
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearFailure();
                }}
                placeholder="Enter your password"
                autoComplete="current-password"
                aria-invalid={credentialsFailed || !!fieldErrors.password || undefined}
                className={cn('pr-11', (credentialsFailed || fieldErrors.password) && 'border-danger focus:border-danger')}
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
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <p>{error}</p>
            </div>
          )}
          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
