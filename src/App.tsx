import type { FC } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import OfficeCanvas from './components/OfficeCanvas';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { VerifyEmailWaitPage } from './pages/VerifyEmailWaitPage';
import { SelectPlanPage } from './pages/SelectPlanPage';

const App: FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* Authenticated but pre-office funnel */}
          <Route path="/verify-email-wait" element={<VerifyEmailWaitPage />} />
          <Route path="/select-plan" element={<SelectPlanPage />} />

          {/* Protected — requires verified email */}
          <Route
            path="/office"
            element={
              <ProtectedRoute>
                <OfficeCanvas />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
