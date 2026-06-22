import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@core/auth/context/AuthContext'
import { NotificationProvider } from '@core/notifications/NotificationContext'
import { AppLayout } from '@shared/components/layout/AppLayout'
import { ErrorBoundary } from '@shared/components/ErrorBoundary'
import { ChatPage } from '@features/chat/components/ChatPage'
import { ActivitiesPage } from '@features/activities/components/ActivitiesPage'
import { ErrorsPage } from '@features/errors/components/ErrorsPage'
import { NotificationsPage } from '@features/notifications/components/NotificationsPage'
import { TeamsPage } from '@features/teams/components/TeamsPage'
import { AdminPage } from '@features/admin/components/AdminPage'
import { IngestasPage } from '@features/ingestas/components/IngestasPage'
import { MeetingsPage } from '@features/meetings/components/MeetingsPage'
import { DashboardPage } from '@features/dashboard/components/DashboardPage'
import { GanttPage } from '@features/gantt/components/GanttPage'
import { LoginPage } from '@core/auth/components/LoginPage'
import { SignUpPage } from '@core/auth/components/SignUpPage'
import { ChangePasswordPage } from '@core/auth/components/ChangePasswordPage'
import { AuthGuard } from '@core/auth/components/AuthGuard'

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
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
                <Route path="/errors" element={<ErrorsPage />} />
                <Route path="/meetings" element={<MeetingsPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/gantt" element={<GanttPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/teams" element={<TeamsPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/ingestas" element={<IngestasPage />} />
                <Route path="*" element={<Navigate to="/chat" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
