import { useState } from 'react'
import { supabase } from '@infrastructure/supabase/client'

interface UploadResult {
  url: string
  name: string
  type: string
}

export function useFileUpload() {
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File): Promise<UploadResult | null> => {
    setUploading(true)
    try {
      const filePath = `chat/${Date.now()}-${file.name}`
      const { error } = await supabase.storage
        .from('chat-files')
        .upload(filePath, file)

      if (error) throw error

      const { data: urlData } = supabase.storage
        .from('chat-files')
        .getPublicUrl(filePath)

      return {
        url: urlData.publicUrl,
        name: file.name,
        type: file.type,
      }
    } catch (err) {
      console.error('Upload failed:', err)
      return null
    } finally {
      setUploading(false)
    }
  }

  return { upload, uploading }
}
