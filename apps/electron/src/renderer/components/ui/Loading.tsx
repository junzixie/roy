import * as React from 'react'
/** 与 Arthur 相同的三点节奏；只在加载时挂载。 */
export function Loading({ text = '正在加载', className = '', compact = false }: { text?: string; className?: string; compact?: boolean }): React.ReactElement {
  const Tag = compact ? 'span' : 'div'
  return <Tag role="status" aria-live="polite" className={`${compact ? 'inline-flex items-center gap-2' : 'flex flex-col items-center justify-center gap-3.5 py-16'} text-[12.5px] text-muted-foreground ${className}`}>
    <span aria-hidden="true" className={`roy-loader-dots ${compact ? '' : 'lg'}`}><i/><i/><i/></span><span>{text}</span>
  </Tag>
}
