/**
 * 压缩通知组件
 *
 * 在压缩前后给用户清晰的反馈
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface CompactionInfo {
  type: 'preview' | 'progress' | 'complete'
  beforeTokens?: number
  afterTokens?: number
  freedTokens?: number
  keptTurns?: number
  estimatedSeconds?: number
}

interface Props {
  info: CompactionInfo
  onDismiss?: () => void
}

export function CompactionNotification({ info, onDismiss }: Props) {
  const formatTokens = (tokens: number) => {
    if (tokens >= 10000) {
      return `${(tokens / 1000).toFixed(1)}k`
    }
    return tokens.toLocaleString()
  }

  const renderContent = () => {
    switch (info.type) {
      case 'preview':
        return (
          <div className="compaction-preview">
            <div className="icon">⏳</div>
            <div className="content">
              <div className="title">即将压缩上下文</div>
              <div className="details">
                当前对话已达到 {formatTokens(info.beforeTokens || 0)} tokens
                {info.keptTurns && `，将保留最近 ${info.keptTurns} 轮对话`}
                {info.estimatedSeconds && ` · 预计 ${info.estimatedSeconds} 秒`}
              </div>
            </div>
          </div>
        )

      case 'progress':
        return (
          <div className="compaction-progress">
            <div className="spinner" />
            <div className="content">
              <div className="title">正在压缩上下文...</div>
              <div className="details">请稍候，这通常需要 2-5 秒</div>
            </div>
          </div>
        )

      case 'complete':
        return (
          <div className="compaction-complete">
            <div className="icon">✓</div>
            <div className="content">
              <div className="title">压缩完成</div>
              <div className="details">
                {info.beforeTokens && info.afterTokens && (
                  <>
                    {formatTokens(info.beforeTokens)} → {formatTokens(info.afterTokens)} tokens
                    {info.freedTokens && ` · 释放 ${formatTokens(info.freedTokens)}`}
                  </>
                )}
                {info.keptTurns && ` · 保留最近 ${info.keptTurns} 轮`}
              </div>
            </div>
            {onDismiss && (
              <button className="dismiss-btn" onClick={onDismiss} aria-label="关闭">
                ×
              </button>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="compaction-notification"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
      >
        {renderContent()}
      </motion.div>
    </AnimatePresence>
  )
}

// CSS 样式（可以放在对应的 .css 文件中）
export const compactionNotificationStyles = `
.compaction-notification {
  position: sticky;
  top: 0;
  z-index: 100;
  margin: 1rem 0;
  padding: 1rem 1.5rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.compaction-preview,
.compaction-progress,
.compaction-complete {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.compaction-notification .icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.compaction-notification .spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.compaction-notification .content {
  flex: 1;
  min-width: 0;
}

.compaction-notification .title {
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.compaction-notification .details {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.compaction-notification .dismiss-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--color-text-tertiary);
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s;
  flex-shrink: 0;
}

.compaction-notification .dismiss-btn:hover {
  background: var(--color-surface-3);
  color: var(--color-text-primary);
}

/* 不同类型的颜色区分 */
.compaction-preview {
  border-left: 3px solid var(--color-warning);
}

.compaction-progress {
  border-left: 3px solid var(--color-info);
}

.compaction-complete {
  border-left: 3px solid var(--color-success);
}
`
