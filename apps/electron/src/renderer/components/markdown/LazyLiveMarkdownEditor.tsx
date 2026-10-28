import * as React from 'react'
import type { LiveMarkdownEditorHandle } from './LiveMarkdownEditor'
export type { LiveMarkdownEditorHandle, LiveMarkdownTextSelection, LiveMarkdownPropertyEntry, LiveMarkdownFindOptions } from './LiveMarkdownEditor'
const Editor = React.lazy(() => import('./LiveMarkdownEditor').then(m => ({ default: m.LiveMarkdownEditor })))
type Props = React.ComponentPropsWithoutRef<typeof Editor>
export const LiveMarkdownEditor = React.forwardRef<LiveMarkdownEditorHandle, Props>(function LazyLiveMarkdownEditor(props, ref) {
  return <React.Suspense fallback={<div role="status" className="p-4 text-muted-foreground">正在加载编辑器…</div>}><Editor {...props} ref={ref} /></React.Suspense>
})
