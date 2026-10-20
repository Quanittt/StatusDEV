import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { DevThemeBar } from '@/components/DevThemeBar'
import AppLayout from '@/layouts/AppLayout'
import AuthPage from '@/pages/AuthPage'
import ChatPage from '@/pages/ChatPage'
import ClientsPage from '@/pages/ClientsPage'
import NewProjectPage from '@/pages/NewProjectPage'
import NotFoundPage from '@/pages/NotFoundPage'
import PortalPage from '@/pages/PortalPage'
import ProjectPage from '@/pages/ProjectPage'
import ProjectsPage from '@/pages/ProjectsPage'
import SettingsPage from '@/pages/SettingsPage'

// Сторінка порівняння дизайну є лише в dev і не потрапляє в production-збірку.
const DesignPage = import.meta.env.DEV ? lazy(() => import('@/pages/DesignPage')) : null

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/p/:token" element={<PortalPage />} />
        {DesignPage && (
          <Route
            path="/design"
            element={
              <Suspense fallback={null}>
                <DesignPage />
              </Suspense>
            }
          />
        )}
        <Route element={<AppLayout />}>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<NewProjectPage />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/chat/:projectId?" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {import.meta.env.DEV && <DevThemeBar />}
    </>
  )
}
