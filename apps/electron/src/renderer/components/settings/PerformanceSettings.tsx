/**
 * 性能设置面板
 *
 * 让用户可以调整压缩、渲染等性能相关配置
 */

import React, { useState, useEffect } from 'react'

export interface PerformanceConfig {
  // 压缩设置
  compactionThresholdPercent: number
  keepRecentTokens: number
  useCompleteTurnSplit: boolean
  showCompactionNotifications: boolean

  // 渲染设置
  virtualizeMessageList: boolean
  messageRenderBatchSize: number
  enableAnimations: boolean

  // 性能监控
  enablePerformanceMonitoring: boolean
  showPerformanceMetrics: boolean
}

const DEFAULT_CONFIG: PerformanceConfig = {
  compactionThresholdPercent: 60,
  keepRecentTokens: 6000,
  useCompleteTurnSplit: true,
  showCompactionNotifications: true,
  virtualizeMessageList: true,
  messageRenderBatchSize: 50,
  enableAnimations: true,
  enablePerformanceMonitoring: false,
  showPerformanceMetrics: false,
}

export function PerformanceSettings() {
  const [config, setConfig] = useState<PerformanceConfig>(DEFAULT_CONFIG)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    // 从 IPC 加载当前配置
    window.electron.invoke('performance:getConfig').then((loadedConfig) => {
      if (loadedConfig) {
        setConfig({ ...DEFAULT_CONFIG, ...loadedConfig })
      }
    })
  }, [])

  const handleChange = (key: keyof PerformanceConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  const handleSave = async () => {
    await window.electron.invoke('performance:updateConfig', config)
    setIsDirty(false)
    // 提示用户重启生效
    window.electron.send('show-notification', {
      title: '设置已保存',
      body: '部分设置需要重启 Roy 后生效',
    })
  }

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG)
    setIsDirty(true)
  }

  const handleAutoOptimize = async () => {
    // 根据当前模型自动优化
    const modelId = await window.electron.invoke('agent:getCurrentModelId')
    let optimized = { ...config }

    if (modelId.includes('deepseek')) {
      optimized = {
        ...optimized,
        compactionThresholdPercent: 60,
        keepRecentTokens: 6000,
      }
    } else if (modelId.includes('claude')) {
      optimized = {
        ...optimized,
        compactionThresholdPercent: 70,
        keepRecentTokens: 8000,
      }
    }

    setConfig(optimized)
    setIsDirty(true)
  }

  return (
    <div className="performance-settings">
      <h2>性能优化</h2>

      {/* 快速操作 */}
      <div className="quick-actions">
        <button onClick={handleAutoOptimize} className="btn-secondary">
          🎯 根据当前模型自动优化
        </button>
      </div>

      {/* 压缩设置 */}
      <section className="settings-section">
        <h3>上下文压缩</h3>
        <p className="section-description">
          对话历史较长时，自动压缩可以保持响应速度
        </p>

        <div className="setting-item">
          <label htmlFor="compactionThreshold">
            压缩触发阈值
            <span className="value-display">{config.compactionThresholdPercent}%</span>
          </label>
          <input
            id="compactionThreshold"
            type="range"
            min="50"
            max="90"
            step="5"
            value={config.compactionThresholdPercent}
            onChange={(e) =>
              handleChange('compactionThresholdPercent', Number(e.target.value))
            }
          />
          <p className="hint">
            更低的阈值会更早触发压缩，避免卡顿。建议 DeepSeek: 60%，Claude: 70%
          </p>
        </div>

        <div className="setting-item">
          <label htmlFor="keepRecentTokens">
            保留最近内容
            <span className="value-display">{config.keepRecentTokens} tokens</span>
          </label>
          <input
            id="keepRecentTokens"
            type="range"
            min="3000"
            max="15000"
            step="1000"
            value={config.keepRecentTokens}
            onChange={(e) => handleChange('keepRecentTokens', Number(e.target.value))}
          />
          <p className="hint">
            更少的保留可以压缩得更彻底。建议 DeepSeek: 6000，Claude: 8000
          </p>
        </div>

        <div className="setting-item checkbox">
          <label>
            <input
              type="checkbox"
              checked={config.useCompleteTurnSplit}
              onChange={(e) =>
                handleChange('useCompleteTurnSplit', e.target.checked)
              }
            />
            使用完整轮次切分（推荐）
          </label>
          <p className="hint">压缩时保持对话轮次完整，避免上下文断裂</p>
        </div>

        <div className="setting-item checkbox">
          <label>
            <input
              type="checkbox"
              checked={config.showCompactionNotifications}
              onChange={(e) =>
                handleChange('showCompactionNotifications', e.target.checked)
              }
            />
            显示压缩通知
          </label>
          <p className="hint">压缩前后显示通知，让你知道发生了什么</p>
        </div>
      </section>

      {/* 渲染性能 */}
      <section className="settings-section">
        <h3>界面渲染</h3>
        <p className="section-description">优化长对话的滚动和显示性能</p>

        <div className="setting-item checkbox">
          <label>
            <input
              type="checkbox"
              checked={config.virtualizeMessageList}
              onChange={(e) =>
                handleChange('virtualizeMessageList', e.target.checked)
              }
            />
            启用虚拟滚动（推荐）
          </label>
          <p className="hint">只渲染可见的消息，大幅提升长对话性能</p>
        </div>

        <div className="setting-item">
          <label htmlFor="messageBatchSize">
            消息批处理大小
            <span className="value-display">{config.messageRenderBatchSize} 条</span>
          </label>
          <input
            id="messageBatchSize"
            type="range"
            min="10"
            max="100"
            step="10"
            value={config.messageRenderBatchSize}
            onChange={(e) =>
              handleChange('messageRenderBatchSize', Number(e.target.value))
            }
          />
          <p className="hint">更大的批次可能更快，但会增加内存占用</p>
        </div>

        <div className="setting-item checkbox">
          <label>
            <input
              type="checkbox"
              checked={config.enableAnimations}
              onChange={(e) => handleChange('enableAnimations', e.target.checked)}
            />
            启用动画效果
          </label>
          <p className="hint">关闭可提升性能，但界面会不那么流畅</p>
        </div>
      </section>

      {/* 性能监控 */}
      <section className="settings-section">
        <h3>性能监控</h3>
        <p className="section-description">开发者工具，用于诊断性能问题</p>

        <div className="setting-item checkbox">
          <label>
            <input
              type="checkbox"
              checked={config.enablePerformanceMonitoring}
              onChange={(e) =>
                handleChange('enablePerformanceMonitoring', e.target.checked)
              }
            />
            启用性能监控
          </label>
          <p className="hint">记录压缩和渲染性能数据</p>
        </div>

        <div className="setting-item checkbox">
          <label>
            <input
              type="checkbox"
              checked={config.showPerformanceMetrics}
              onChange={(e) =>
                handleChange('showPerformanceMetrics', e.target.checked)
              }
            />
            显示性能指标面板
          </label>
          <p className="hint">在界面上显示实时性能数据（开发模式）</p>
        </div>
      </section>

      {/* 保存按钮 */}
      <div className="settings-actions">
        <button onClick={handleReset} className="btn-secondary" disabled={!isDirty}>
          重置为默认
        </button>
        <button onClick={handleSave} className="btn-primary" disabled={!isDirty}>
          保存设置
        </button>
      </div>

      {isDirty && (
        <p className="save-hint">你有未保存的更改</p>
      )}
    </div>
  )
}
