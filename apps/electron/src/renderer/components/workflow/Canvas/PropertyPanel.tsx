/**
 * 属性面板 - 编辑节点属性
 *
 * 文案按「普通人能看懂」写：不出现 nodeId / upstream 这类术语，
 * 每个输入框都给出填什么、从哪来的例子。
 */

import React from 'react'
import type { WorkflowFlowNode, WorkflowNodeData } from './workflow-canvas-types'

interface PropertyPanelProps {
  node: WorkflowFlowNode
  onChange: (data: Partial<WorkflowNodeData>) => void
  onClose: () => void
}

/** 节点类型的显示名与说明（面板顶部用） */
const TYPE_LABEL: Record<string, { name: string; hint: string }> = {
  variable: { name: '输入参数', hint: '给整个流程准备一份参数，后面的步骤可以引用' },
  http: { name: 'HTTP 读取', hint: '从网址取回数据，只能读，不能提交或修改' },
  rss: { name: 'RSS 新闻', hint: '订阅一个新闻源，按时间筛选、自动去重' },
  webpage: { name: '网页读取', hint: '打开一个网页，取正文、链接或指定区域' },
  transform: { name: '数据整理', hint: '按某个字段去重、限制条数，可以记住处理过哪些' },
  condition: { name: '条件门', hint: '满足条件才继续往下走，不满足就停在这一步' },
  llm: { name: 'Agent / Skill', hint: '让模型整理或改写内容，可以指定用哪个技能' },
  file: { name: '保存成品', hint: '把结果写成文件，存到本次运行的目录里' },
  notification: { name: '完成通知', hint: '流程结束时弹一条桌面通知' },
}

/** 每个字段：标签、说明、占位示例、行高 */
type Field = { key: string; label: string; hint?: string; example?: string; rows?: number; options?: string[] }

const FIELDS: Record<string, Field[]> = {
  variable: [
    { key: 'value', label: '参数内容', hint: '写成 JSON，后面的步骤可以用 {{参数名}} 引用', example: '{"关键词": "AI", "条数": 10}', rows: 4 },
  ],
  http: [
    { key: 'url', label: '网址', hint: '要读取的完整地址，以 http 或 https 开头', example: 'https://api.example.com/news' },
  ],
  rss: [
    { key: 'url', label: '订阅地址', hint: '新闻源或博客的 RSS / Atom 地址', example: 'https://example.com/feed.xml' },
    { key: 'hours', label: '只要最近几小时的', hint: '填 0 表示不限时间', example: '24' },
    { key: 'limit', label: '最多保留几条', example: '20' },
    { key: 'includeUndated', label: '保留没有发布日期的条目', hint: '填 true 保留，填 false 丢掉', example: 'false' },
  ],
  webpage: [
    { key: 'url', label: '网页地址', hint: '要打开的页面，只读取内容，不会登录或提交表单', example: 'https://example.com/article' },
    { key: 'selector', label: '只看页面的哪一块（可不填）', hint: '不填就取整页正文。想精确取，可以填 article、main，或 .content 这样的类名', example: 'article' },
    { key: 'mode', label: '要什么内容', hint: 'text 取正文；links 取所有链接；html 取原始结构', example: 'text', options: ['text', 'links', 'html'] },
    { key: 'limit', label: '最多取几条', hint: '只对 links 和 html 有效', example: '20' },
  ],
  transform: [
    { key: 'items', label: '要整理的数据', hint: '一般接上一步的结果，保持默认即可', example: '{{upstream.items}}' },
    { key: 'key', label: '按哪个字段判重', hint: '内容里同名字段重复的只留一条', example: 'link' },
    { key: 'limit', label: '最多保留几条', example: '10' },
    { key: 'remember', label: '记住处理过的内容', hint: '填 true 时，以前处理过的条目这次会跳过，适合每天跑的日报', example: 'true' },
  ],
  condition: [
    { key: 'value', label: '要判断的内容', hint: '一般填上一步的结果', example: '{{upstream.items}}' },
    { key: 'operator', label: '怎么判断', hint: 'notEmpty 非空；equals 等于；greater 大于', example: 'notEmpty', options: ['notEmpty', 'equals', 'greater'] },
    { key: 'expected', label: '和什么比较', hint: '选 equals 或 greater 时才需要填', example: '10' },
  ],
  llm: [
    { key: 'prompt', label: '让 AI 做什么', hint: '用一句话说清目标，比如「把这些新闻整理成 5 条摘要」', example: '把上游新闻整理成 5 条中文摘要，每条一行', rows: 5 },
    { key: 'skill', label: '用哪个技能（可不填）', hint: '留空就用当前默认模型，不做额外加工', example: 'roy-document-writing' },
    { key: 'channelId', label: '用哪个渠道（可不填）', hint: '留空自动用第一个可用渠道', example: '' },
    { key: 'modelId', label: '用哪个模型（可不填）', hint: '留空用该渠道的默认模型', example: '' },
  ],
  file: [
    { key: 'filename', label: '保存成什么文件名', hint: '会存到本次运行的目录里，同名会覆盖', example: '日报.md' },
    { key: 'content', label: '写入什么内容', hint: '一般填上一步的输出', example: '{{upstream.response}}', rows: 4 },
  ],
  notification: [
    { key: 'title', label: '通知标题', example: '工作流完成' },
    { key: 'body', label: '通知内容', example: '成品已保存' },
  ],
}

export function PropertyPanel({ node, onChange, onClose }: PropertyPanelProps) {
  const inputs = node.data.inputs ?? {}

  const handleInputChange = (key: string, value: string) => {
    onChange({
      inputs: {
        ...inputs,
        [key]: value
      }
    })
  }

  const typeInfo = TYPE_LABEL[node.type ?? ''] ?? { name: node.type ?? '未知步骤', hint: '' }
  const fields = FIELDS[node.type ?? ''] ?? []

  return (
    <div className="flex w-80 flex-col border-l border-border bg-content-area">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{typeInfo.name}</h2>
          {typeInfo.hint && <p className="mt-0.5 text-xs text-foreground/50">{typeInfo.hint}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-foreground/50 hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {fields.length === 0 ? (
          <p className="text-sm text-foreground/50">这个步骤没有需要填的内容，连好线就能用。</p>
        ) : (
          fields.map((field) => (
            <div className="mb-4" key={field.key}>
              <label className="mb-1 block text-sm font-medium">{field.label}</label>
              {field.options ? (
                <select
                  className="w-full rounded border border-border bg-content-area p-2 text-sm"
                  value={String(inputs[field.key] ?? field.options[0])}
                  onChange={(e) => handleInputChange(field.key, e.target.value)}
                >
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <textarea
                  className="w-full rounded border border-border bg-content-area p-2 text-sm"
                  rows={field.rows ?? 2}
                  value={String(inputs[field.key] ?? '')}
                  placeholder={field.example || ''}
                  onChange={(e) => handleInputChange(field.key, e.target.value)}
                />
              )}
              {field.hint && <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/45">{field.hint}</p>}
            </div>
          ))
        )}

        <details className="mt-6 rounded-lg border border-border/60 bg-foreground/[0.02] p-3">
          <summary className="cursor-pointer text-[12.5px] font-medium text-foreground/70">怎么引用前面步骤的结果？</summary>
          <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-foreground/55">
            <p>
              <span className="font-medium text-foreground/75">用上一步的结果</span>：写 <code className="rounded bg-foreground/[0.07] px-1">{'{{upstream.字段}}'}</code>，
              例如 <code className="rounded bg-foreground/[0.07] px-1">{'{{upstream.items}}'}</code> 就是上一步输出的列表。
            </p>
            <p>
              <span className="font-medium text-foreground/75">用指定某一步的结果</span>：写 <code className="rounded bg-foreground/[0.07] px-1">{'{{nodes.步骤标识.字段}}'}</code>。
              步骤标识就是画布上那个步骤的内部名字，点中它就能看到。
            </p>
            <p className="text-foreground/40">
              AI 步骤只负责整理文字，不会自动发布、付费或改文件；要保存成品，后面接一个「保存成品」步骤。
            </p>
          </div>
        </details>

        <div className="mt-4 border-t border-border/50 pt-3 text-[11.5px] text-foreground/35">
          步骤标识：<span className="font-mono text-foreground/50">{node.id}</span>
          <span className="ml-2 text-foreground/25">（连线时用来区分步骤，一般不用改）</span>
        </div>
      </div>
    </div>
  )
}
