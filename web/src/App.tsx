import { Route, Routes } from 'react-router-dom'

import AppLayout from '@/layouts/AppLayout'
import AuthPage from '@/pages/AuthPage'
import ChatPage from '@/pages/ChatPage'
import ClientsPage from '@/pages/ClientsPage'
import NewProjectPage from '@/pages/NewProjectPage'
import NotFoundPage from '@/pages/NotFoundPage'
import PortalPage from '@/pages/PortalPage'
import ProjectPage from '@/pages/ProjectPage'
import ProjectsPage from '@/pages/ProjectsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/p/:token" element={<PortalPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<NewProjectPage />} />
        <Route path="/projects/:id" element={<ProjectPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/chat/:projectId?" element={<ChatPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
