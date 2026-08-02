import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { ApiError } from '../api/client';
import { verifyMfa } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Button, Field, Input } from '../components/ui';

export function MfaPage() {
  const { token, signIn } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  const mfaToken = sessionStorage.getItem('dtr_mfa_token') ?? '';

  if (token) {
    return <Navigate to="/" replace />;
  }

  if (!mfaToken) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      const result = await verifyMfa(mfaToken, (code ?? '').trim(), recoveryMode ? (code ?? '').trim() : undefined);
      sessionStorage.removeItem('dtr_mfa_token');
      signIn(result.token, result.user);
      navigate('/');
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
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-white">
            <ShieldCheck size={22} />
          </div>
          <h1 className="text-lg font-bold text-text">Two-factor authentication</h1>
          <p className="text-center text-xs text-muted">
            {recoveryMode ? 'Enter one of your recovery codes to sign in.' : 'Enter the 6-digit code from your authenticator app.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={recoveryMode ? 'Recovery code' : 'Verification code'} required error={fieldErrors.code?.[0]}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={recoveryMode ? 'XXXX-XXXX-XXXX-XXXX' : '000000'}
              inputMode={recoveryMode ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              autoFocus
            />
          </Field>
          <Button type="submit" loading={loading} className="w-full">
            Verify
          </Button>
          <button
            type="button"
            onClick={() => {
              setRecoveryMode((v) => !v);
              setCode('');
              setError(null);
            }}
            className="w-full text-center text-xs font-medium text-primary hover:underline cursor-pointer"
          >
            {recoveryMode ? 'Use authenticator code instead' : 'Use a recovery code instead'}
          </button>
        </form>
      </div>
    </div>
  );
}
