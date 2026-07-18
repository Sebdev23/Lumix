import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AuthProvider } from '@core/auth/context/AuthContext'
import { NotificationProvider } from '@core/notifications/NotificationContext'
import { AppLayout } from '@shared/components/layout/AppLayout'
import { ErrorBoundary } from '@shared/components/ErrorBoundary'
import { ToastProvider } from '@shared/components/ui/Toast'

const ChatPage = lazy(() =>
  import('@features/chat/components/ChatPage').then((m) => ({ default: m.ChatPage })),
)
const ActivitiesPage = lazy(() =>
  import('@features/activities/components/ActivitiesPage').then((m) => ({
    default: m.ActivitiesPage,
  })),
)
const ErrorsPage = lazy(() =>
  import('@features/errors/components/ErrorsPage').then((m) => ({ default: m.ErrorsPage })),
)
const MinutaPage = lazy(() =>
  import('@features/minuta/components/MinutaPage').then((m) => ({ default: m.MinutaPage })),
)
const NotificationsPage = lazy(() =>
  import('@features/notifications/components/NotificationsPage').then((m) => ({
    default: m.NotificationsPage,
  })),
)
const TeamsPage = lazy(() =>
  import('@features/teams/components/TeamsPage').then((m) => ({ default: m.TeamsPage })),
)
const AdminPage = lazy(() =>
  import('@features/admin/components/AdminPage').then((m) => ({ default: m.AdminPage })),
)
const IngestasPage = lazy(() =>
  import('@features/ingestas/components/IngestasPage').then((m) => ({ default: m.IngestasPage })),
)
const MeetingsPage = lazy(() =>
  import('@features/meetings/components/MeetingsPage').then((m) => ({ default: m.MeetingsPage })),
)
const DashboardPage = lazy(() =>
  import('@features/dashboard/components/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
)
const GanttPage = lazy(() =>
  import('@features/gantt/components/GanttPage').then((m) => ({ default: m.GanttPage })),
)
const LoginPage = lazy(() =>
  import('@core/auth/components/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const SignUpPage = lazy(() =>
  import('@core/auth/components/SignUpPage').then((m) => ({ default: m.SignUpPage })),
)
const ChangePasswordPage = lazy(() =>
  import('@core/auth/components/ChangePasswordPage').then((m) => ({
    default: m.ChangePasswordPage,
  })),
)
const AuthGuard = lazy(() =>
  import('@core/auth/components/AuthGuard').then((m) => ({ default: m.AuthGuard })),
)
const ProfilePage = lazy(() =>
  import('@features/profile/components/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <NotificationProvider>
          <ToastProvider>
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignUpPage />} />
                  <Route path="/change-password" element={<ChangePasswordPage />} />
                  <Route
                    element={
                      <AuthGuard>
                        <AppLayout />
                      </AuthGuard>
                    }
                  >
                    <Route path="/chat" element={<ChatPage />} />
                    <Route path="/activities" element={<ActivitiesPage />} />
                    <Route path="/minuta" element={<MinutaPage />} />
                    <Route path="/errors" element={<ErrorsPage />} />
                    <Route path="/meetings" element={<MeetingsPage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/gantt" element={<GanttPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/teams" element={<TeamsPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/ingestas" element={<IngestasPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="*" element={<Navigate to="/chat" replace />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </NotificationProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
