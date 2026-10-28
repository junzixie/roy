/**
 * 打开文件：显示打开后截的小图（只给用户看，模型只拿到一行路径）
 */
import * as React from 'react'
import { DefaultResultRenderer } from './default-result'

const PREFIX = '预览图：'

export function OpenFileResultRenderer({ result, isError }: { result: string; isError: boolean }): React.ReactElement {
  const lines = result.split('\n')
  const previewLine = lines.find((l) => l.startsWith(PREFIX))
  const text = lines.filter((l) => !l.startsWith(PREFIX)).join('\n')
  const [src, setSrc] = React.useState<string | null>(null)
  React.useEffect(() => {
    setSrc(null)
    if (!previewLine) return
    void window.electronAPI.computerReadPreview(previewLine.slice(PREFIX.length).trim()).then(setSrc).catch(() => setSrc(null))
  }, [previewLine])
  return (
    <div className="space-y-2">
      {src && <img src={src} alt="打开后的窗口" className="max-h-[260px] max-w-full rounded-md border border-border/60" />}
      <DefaultResultRenderer result={text} isError={isError} />
    </div>
  )
}
