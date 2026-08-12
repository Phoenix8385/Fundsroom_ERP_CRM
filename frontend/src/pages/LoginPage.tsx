import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { FormError, TextInput } from '../components/Form';
import { Spinner } from '../components/Feedback';
import { useAuth } from '../context/AuthContext';
import { errorMessage, statusOf } from '../lib/api';

/**
 * The signature moment: four abstract crates drifting behind the wordmark.
 *
 * Purely decorative, so the whole stack is aria-hidden and pointer-events:none
 * — it must never take a click meant for the form or get read out as content.
 * The float is plain CSS on `transform` only, which keeps it on the compositor
 * and off the main thread; nothing here can delay the form from mounting.
 */
function HeroShapes() {
  return (
    <div className="hero-shapes" aria-hidden="true">
      <span className="crate crate--1" />
      <span className="crate crate--2" />
      <span className="crate crate--3" />
      <span className="crate crate--4" />
    </div>
  );
}

export default function LoginPage() {
  const { session, restoring, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (restoring) {
    return (
      <div className="page-center">
        <Spinner label="Restoring your session" />
      </div>
    );
  }

  if (session) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }

    setSubmitting(true);

    try {
      await login(email.trim(), password);
    } catch (err) {
      // The interceptor deliberately leaves a 401 from /auth/login alone, so the
      // message lands here instead of bouncing the page.
      setError(
        statusOf(err) === 401
          ? 'Invalid email or password'
          : errorMessage(err, 'Could not sign you in'),
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth__hero">
        <HeroShapes />

        {/* Real content, so it stays in the accessibility tree — only the
            shapes behind it are hidden. Entrance runs once on mount. */}
        <div className="hero-copy">
          <p className="hero-copy__mark">
            <span className="hero-copy__glyph" aria-hidden="true" />
            Fundsroom
          </p>
          <p className="hero-copy__tagline">
            Stock, customers and delivery challans — one calm system for the warehouse floor.
          </p>
        </div>
      </section>

      <section className="auth__panel">
        <form className="auth__card" onSubmit={handleSubmit} noValidate>
          <div className="auth__head">
            <h1>Sign in</h1>
            <p>Use the account your administrator issued.</p>
          </div>

          <FormError message={error} />

          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@company.com"
            autoFocus
            required
            disabled={submitting}
          />

          <TextInput
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            required
            disabled={submitting}
          />

          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? <Spinner label="Signing in" /> : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}
