/**
 * ProtectedRoute — wraps any route that requires authentication.
 *
 * Enforces the full onboarding funnel:
 *   1. Not logged in       → /login
 *   2. Email not verified   → /verify-email-wait
 *   3. No plan selected yet → /select-plan
 *   4. All clear            → render children (office + in-app onboarding)
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Step 1: Block until email is verified
  if (user && !user.emailVerified) {
    return <Navigate to="/verify-email-wait" replace />;
  }

  // Step 2: Block until plan is selected
  if (user && !user.planSelected) {
    return <Navigate to="/select-plan" replace />;
  }

  // Step 3: All clear — render office (onboarding happens in-app)
  return <>{children}</>;
}
