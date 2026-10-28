/** 手机遥控：侧栏「更多工具」进入的独立整页（原来在设置 → 通用里）。 */
import React from 'react'
import { SettingsCard, SettingsSection } from '@/components/settings/primitives'
import { MobileRemoteSettings } from '@/components/settings/MobileRemoteSettings'

export function MobileRemoteView(): React.ReactElement {
  return (
    <div className="roy-page-enter flex h-full min-h-0 flex-col bg-content-area">
      <div className="shrink-0 px-6 pb-3 pt-4">
        <h1 className="text-[16px] font-semibold text-foreground">手机遥控</h1>
        <p className="mt-0.5 text-[12.5px] text-foreground/45">手机和电脑连同一个 Wi-Fi 后，可查看对话、新建对话、发消息和确认操作</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        <div className="mx-auto max-w-2xl">
          <SettingsSection title="连接手机" description="打开开关后点「显示二维码」，用手机扫码，再在电脑弹窗里点允许">
            <SettingsCard><MobileRemoteSettings /></SettingsCard>
          </SettingsSection>
        </div>
      </div>
    </div>
  )
}
