/**
 * UserProfileCard - 用户档案（头像 + 显示名称）
 *
 * 从「通用」抽出，账号页和通用页可共用同一份实现，避免两处各写一遍。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { Camera, ImagePlus } from 'lucide-react'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import { userProfileAtom } from '@/atoms/user-profile'
import { UserAvatar } from '../chat/UserAvatar'
import { SettingsSection, SettingsCard } from './primitives'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { cn } from '@/lib/utils'

/** emoji-mart 选择回调的 emoji 对象类型 */
interface EmojiMartEmoji {
  id: string
  name: string
  native: string
  unified: string
  keywords: string[]
  shortcodes: string
}

export function UserProfileCard(): React.ReactElement {
  const [userProfile, setUserProfile] = useAtom(userProfileAtom)
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [nameInput, setNameInput] = React.useState(userProfile.userName)
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  /** 头像：走主进程持久化，成功后回写 atom */
  const handleAvatarChange = async (avatar: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.updateUserProfile({ avatar })
      setUserProfile(updated)
      setShowEmojiPicker(false)
    } catch (error) {
      console.error('[用户档案] 更新头像失败:', error)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { void handleAvatarChange(String(reader.result)) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  /** 用户名：同样走主进程持久化 */
  const saveName = async (): Promise<void> => {
    const next = nameInput.trim()
    if (!next) { setNameInput(userProfile.userName); return }
    try {
      const updated = await window.electronAPI.updateUserProfile({ userName: next })
      setUserProfile(updated)
      setIsEditingName(false)
    } catch (error) {
      console.error('[用户档案] 更新用户名失败:', error)
    }
  }

  return (
    <SettingsSection title="用户档案" description="设置你的头像和显示名称">
      <SettingsCard>
        <div className="flex items-center gap-5 px-4 py-4">
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <div className="relative group/avatar cursor-pointer">
                <UserAvatar avatar={userProfile.avatar} size={64} />
                <div className="absolute inset-0 rounded-[20%] flex items-center justify-center bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                  <Camera className="size-5 text-white" />
                </div>
              </div>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" sideOffset={12} className="w-auto p-0 border-none shadow-xl">
              <Picker
                data={data}
                onEmojiSelect={(emoji: EmojiMartEmoji) => { void handleAvatarChange(emoji.native) }}
                locale="zh"
                theme="auto"
                previewPosition="none"
                skinTonePosition="search"
                perLine={8}
              />
              <div className="px-3 p-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px]',
                    'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition-colors',
                  )}
                >
                  <ImagePlus className="size-4" />
                  上传自定义图片
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => { void saveName() }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveName()
                  if (e.key === 'Escape') { setNameInput(userProfile.userName); setIsEditingName(false) }
                }}
                maxLength={30}
                autoFocus
                className="text-lg font-semibold text-foreground bg-transparent border-b-2 border-primary outline-none w-full max-w-[200px] pb-0.5"
              />
            ) : (
              <button
                type="button"
                onClick={() => { setNameInput(userProfile.userName); setIsEditingName(true) }}
                className="text-lg font-semibold text-foreground hover:text-primary transition-colors text-left"
              >
                {userProfile.userName}
              </button>
            )}
            <p className="text-[12px] text-foreground/40 mt-0.5">点击头像更换，点击名字编辑</p>
          </div>
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}
