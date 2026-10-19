import { http } from '@/lib/api'
import type { FileItem } from '@/lib/types'

// Завантаження в R2 у три кроки: адреса від API -> PUT файлу прямо в сховище -> підтвердження в API.
async function putToStorage(uploadUrl: string, file: File) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error('Не вдалося завантажити файл у сховище')
}

export async function uploadProjectFile(projectId: string, file: File): Promise<FileItem> {
  const meta = { name: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size }
  const { uploadUrl, storageKey } = await http.post<{ uploadUrl: string; storageKey: string }>(
    `/projects/${projectId}/files/presign`,
    meta,
  )
  await putToStorage(uploadUrl, new File([file], file.name, { type: meta.mimeType }))
  return http.post<FileItem>(`/projects/${projectId}/files`, { ...meta, storageKey })
}

export async function uploadLogo(file: File): Promise<void> {
  const { uploadUrl, storageKey } = await http.post<{ uploadUrl: string; storageKey: string }>('/me/logo/presign', {
    mimeType: file.type,
    sizeBytes: file.size,
  })
  await putToStorage(uploadUrl, file)
  await http.put('/me/logo', { storageKey })
}
