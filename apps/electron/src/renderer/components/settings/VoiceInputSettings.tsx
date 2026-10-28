/**
 * VoiceInputSettings — 语音输入设置
 */

import * as React from 'react'
import { ExternalLink, Loader2, TestTube2, Mic, MicOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  SettingsCard,
  SettingsInput,
  SettingsSecretInput,
  SettingsSection,
  SettingsSelect,
  SettingsTextarea,
  SettingsToggle,
} from './primitives'
import type { VoiceAuthMode, VoiceDictationSettings, MicPermissionResult } from '../../../types'
import {
  loadTtsEnabled,
  saveTtsEnabled,
  loadTtsEngine,
  saveTtsEngine,
  mirrorTtsPrefsFromMain,
  speakWorkbenchTts,
  stopBrowserTts,
  type RoyTtsEngine,
} from '@/lib/roy-workbench-prefs'
import type { VoiceTtsSettings } from '../../../types'

const ENDPOINT_OPTIONS = [
  { value: 'async', label: '双向流式优化版' },
  { value: 'duplex', label: '双向流式标准版' },
]

const OUTPUT_OPTIONS = [
  { value: 'auto', label: '自动：Roy 激活时写入对话框，否则写入当前光标' },
  { value: 'clipboard', label: '仅复制到剪贴板' },
  { value: 'roy-input', label: '仅写入 Roy 输入框' },
]

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: '自动识别' },
  { value: 'zh-CN', label: '中文普通话' },
  { value: 'en-US', label: '英语' },
  { value: 'yue-CN', label: '粤语' },
  { value: 'ja-JP', label: '日语' },
  { value: 'ko-KR', label: '韩语' },
]

const VOLCENGINE_SPEECH_SERVICE_URL = 'https://console.volcengine.com/speech/service/'
const VOLCENGINE_TTS_CONSOLE_URL = 'https://console.volcengine.com/speech/service/tts'
const MINIMAX_CONSOLE_URL = 'https://platform.minimaxi.com/'

const TTS_ENGINE_OPTIONS = [
  { value: 'system', label: '系统 speechSynthesis（本机，免密钥）' },
  { value: 'doubao', label: '豆包 TTS（火山引擎语音合成）' },
  { value: 'minimax', label: 'Minimax TTS' },
]

const AUTH_MODE_OPTIONS = [
  { value: 'legacy', label: '旧版：APP ID + Access Token' },
  { value: 'apiKey', label: '新版：API Key（豆包语音新控制台）' },
]

const VOLCENGINE_API_KEY_URL = 'https://console.volcengine.com/speech/app'

const DOUBAO_V3_DEFAULT_SPEAKER = 'zh_female_vv_uranus_bigtts'
const DOUBAO_LEGACY_DEFAULT_VOICE = 'BV001_streaming'

/** 常见 Resource ID ↔ speaker 配对提示 */
const DOUBAO_TTS_PAIRING_HINT =
  '常见配对：seed-tts-2.0 ↔ zh_female_vv_uranus_bigtts（Vivi 2.0）/ zh_female_xiaohe_uranus_bigtts / zh_male_m191_uranus_bigtts；' +
  'seed-icl-2.0 ↔ 控制台声音复刻音色 ID；seed-tts-1.0 ↔ 1.0 音色库 ID。旧版 BV001_streaming 只能走「旧版」鉴权，不能当 V3 speaker。'

function isLegacyDoubaoVoiceType(value: string): boolean {
  const s = value.trim()
  if (!s) return true
  if (/^BV[\w.-]*$/i.test(s)) return true
  if (/_streaming$/i.test(s) && !/_bigtts$/i.test(s)) return true
  return false
}

export function VoiceInputSettings(): React.ReactElement {
  const [settings, setSettings] = React.useState<VoiceDictationSettings | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [micPermission, setMicPermission] = React.useState<MicPermissionResult | null>(null)
  const [requestingPermission, setRequestingPermission] = React.useState(false)
  const [ttsEnabled, setTtsEnabled] = React.useState(() => loadTtsEnabled())
  const [ttsEngine, setTtsEngine] = React.useState<RoyTtsEngine>(() => loadTtsEngine())
  const [ttsSettings, setTtsSettings] = React.useState<VoiceTtsSettings | null>(null)
  const [ttsSaving, setTtsSaving] = React.useState(false)
  const [ttsTesting, setTtsTesting] = React.useState(false)

  const refreshMicPermission = React.useCallback(async () => {
    try {
      const result = await window.electronAPI.checkMicrophonePermission()
      setMicPermission(result)
    } catch (error) {
      console.error('[语音输入] 检查麦克风权限失败:', error)
    }
  }, [])

  React.useEffect(() => {
    window.electronAPI.getVoiceDictationSettings()
      .then(setSettings)
      .catch((error) => {
        console.error('[语音输入] 加载设置失败:', error)
        toast.error('加载语音输入设置失败')
      })
    window.electronAPI.getVoiceTtsSettings()
      .then((tts) => {
        setTtsSettings(tts)
        mirrorTtsPrefsFromMain(tts)
        setTtsEnabled(!!tts.enabled)
        if (tts.engine === 'system' || tts.engine === 'doubao' || tts.engine === 'minimax') {
          setTtsEngine(tts.engine)
        }
      })
      .catch((error) => {
        console.error('[语音合成] 加载设置失败:', error)
      })
    refreshMicPermission()
  }, [refreshMicPermission])

  const handleRequestMicPermission = React.useCallback(async () => {
    setRequestingPermission(true)
    try {
      const result = await window.electronAPI.requestMicrophonePermission()
      setMicPermission(result)
      if (result.status === 'granted') {
        toast.success('麦克风权限已授权')
      } else if (result.status === 'denied') {
        toast.error('麦克风权限已被拒绝，请在系统设置中允许')
      }
    } catch (error) {
      console.error('[语音输入] 请求麦克风权限失败:', error)
      toast.error('请求麦克风权限失败')
    } finally {
      setRequestingPermission(false)
    }
  }, [])

  const update = React.useCallback(async (updates: Partial<VoiceDictationSettings>) => {
    if (!settings) return
    const optimistic = { ...settings, ...updates, provider: 'doubao' as const }
    setSettings(optimistic)
    setSaving(true)
    try {
      const saved = await window.electronAPI.updateVoiceDictationSettings(optimistic)
      setSettings(saved)
      window.electronAPI.reregisterGlobalShortcuts().catch(console.error)
    } catch (error) {
      console.error('[语音输入] 保存设置失败:', error)
      toast.error('保存语音输入设置失败')
    } finally {
      setSaving(false)
    }
  }, [settings])


  const updateTts = React.useCallback(async (updates: Partial<VoiceTtsSettings>) => {
    const base = ttsSettings ?? {
      enabled: ttsEnabled,
      engine: ttsEngine,
      doubaoAuthMode: 'legacy' as VoiceAuthMode,
      doubaoAppId: '',
      doubaoAccessToken: '',
      doubaoApiKey: '',
      doubaoResourceId: 'seed-tts-2.0',
      doubaoCluster: 'volcano_tts',
      doubaoVoiceType: 'BV001_streaming',
      doubaoSpeaker: 'zh_female_vv_uranus_bigtts',
      minimaxApiKey: '',
      minimaxGroupId: '',
      minimaxVoiceId: 'male-qn-qingse',
      minimaxModel: 'speech-02-hd',
    }
    const optimistic = { ...base, ...updates }
    setTtsSettings(optimistic)
    if (typeof updates.enabled === 'boolean') {
      setTtsEnabled(updates.enabled)
      saveTtsEnabled(updates.enabled)
      if (!updates.enabled) stopBrowserTts()
    }
    if (updates.engine === 'system' || updates.engine === 'doubao' || updates.engine === 'minimax') {
      setTtsEngine(updates.engine)
      saveTtsEngine(updates.engine)
    }
    setTtsSaving(true)
    try {
      const saved = await window.electronAPI.updateVoiceTtsSettings(optimistic)
      setTtsSettings(saved)
      mirrorTtsPrefsFromMain(saved)
    } catch (error) {
      console.error('[语音合成] 保存设置失败:', error)
      toast.error('保存语音合成设置失败')
    } finally {
      setTtsSaving(false)
    }
  }, [ttsSettings, ttsEnabled, ttsEngine])
  const handleTest = React.useCallback(async () => {
    if (!settings) {
      toast.error('语音输入设置尚未加载完成，请稍后再试')
      return
    }
    const authMode = settings.authMode ?? 'legacy'
    if (!settings.resourceId?.trim()) {
      toast.error('请先填写 Resource ID（识别默认 volc.seedasr.sauc.duration）')
      return
    }
    if (authMode === 'apiKey') {
      if (!settings.apiKey?.trim()) {
        toast.error('新版鉴权：请先填写豆包 API Key，再点测试连接')
        return
      }
    } else if (!settings.appId?.trim() || !settings.accessToken?.trim()) {
      toast.error('旧版鉴权：请先填写 APP ID 与 Access Token，再点测试连接')
      return
    }
    if (!window.electronAPI?.testVoiceDictationConnection) {
      toast.error('测试接口未就绪（IPC 未暴露），请重启 Roy 后再试')
      return
    }
    setTesting(true)
    try {
      const result = await window.electronAPI.testVoiceDictationConnection(settings)
      if (result.success) {
        toast.success(result.message || '豆包 ASR 连接成功')
      } else {
        toast.error(result.message || '豆包 ASR 连接失败')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      toast.error(`测试连接失败: ${message}`)
    } finally {
      setTesting(false)
    }
  }, [settings])

  if (!settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        正在加载语音输入设置...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="语音输入（豆包识别）"
        description="默认与推荐：豆包（火山）实时识别。工具台唤醒、点球说话、全局听写都走这里。可切换旧版（APP ID+Token）或新版（API Key）；未配置前无法识别。"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <TestTube2 className="mr-1.5 size-3.5" />}
            测试连接
          </Button>
        }
      >
        <div className="rounded-lg bg-muted/55 px-4 py-3 text-sm text-muted-foreground shadow-sm">
          <div className="mb-1.5 font-medium text-foreground">配置方式</div>
          <div className="space-y-1 leading-relaxed">
            <p>
              打开
              <a
                href={VOLCENGINE_SPEECH_SERVICE_URL}
                target="_blank"
                rel="noreferrer"
                className="mx-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                火山引擎语音服务控制台
                <ExternalLink className="size-3" />
              </a>
              ，选择旧版服务界面。
            </p>
            <p>找到“豆包流式语音识别模型2.0”类目，选择已申请对应权限的应用。</p>
            <p>在页面下方对照填写 APP ID、Access Token 和 Resource ID，然后点击“测试连接”。</p>
          </div>
        </div>

        {/* 麦克风权限状态 */}
        {micPermission && (
          <div className="rounded-lg border px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {micPermission.status === 'granted' ? (
                  <Mic className="size-4 text-green-500" />
                ) : micPermission.status === 'denied' ? (
                  <MicOff className="size-4 text-destructive" />
                ) : micPermission.status === 'not-determined' ? (
                  <Mic className="size-4 text-amber-500" />
                ) : (
                  <Mic className="size-4 text-muted-foreground" />
                )}
                <div>
                  <span className="font-medium text-foreground">麦克风权限</span>
                  <span className="ml-2 text-muted-foreground">
                    {micPermission.status === 'granted'
                      ? '已授权，语音输入可正常使用'
                      : micPermission.status === 'denied'
                      ? '已被系统阻止，请在系统设置中允许 Roy 访问麦克风'
                      : micPermission.status === 'not-determined'
                      ? '未授权，使用语音输入前需要先授权'
                      : '当前系统不支持预检，录音时将自动弹出权限请求'}
                  </span>
                </div>
              </div>
              {(micPermission.status === 'not-determined' || micPermission.status === 'denied') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRequestMicPermission}
                  disabled={requestingPermission}
                >
                  {requestingPermission ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : micPermission.status === 'not-determined' ? (
                    <Mic className="mr-1.5 size-3.5" />
                  ) : (
                    <MicOff className="mr-1.5 size-3.5" />
                  )}
                  {micPermission.status === 'not-determined' ? '允许麦克风权限' : '重新请求权限'}
                </Button>
              )}
            </div>
          </div>
        )}

        <SettingsCard>
          <SettingsToggle
            label="启用语音输入"
            description="启用后可使用 Ctrl+～ 打开语音输入浮窗，再按一次停止。"
            checked={settings.enabled}
            onCheckedChange={(enabled) => update({ enabled })}
          />
          <SettingsSelect
            label="豆包鉴权模式"
            description="旧版用 APP ID + Access Token；新版控制台只需 API Key。Resource ID 两种模式都要填。"
            value={settings.authMode ?? 'legacy'}
            onValueChange={(authMode) => update({ authMode: authMode as VoiceAuthMode })}
            options={AUTH_MODE_OPTIONS}
          />
          {(settings.authMode ?? 'legacy') === 'legacy' ? (
            <>
              <SettingsInput
                label="豆包 APP ID"
                description="对应 X-Api-App-Key，请填写火山引擎控制台中的 APP ID。"
                value={settings.appId}
                onChange={(appId) => update({ appId })}
                placeholder="请输入 APP ID"
              />
              <SettingsSecretInput
                label="豆包 Access Token"
                description="对应 X-Api-Access-Key，保存时会加密。"
                value={settings.accessToken}
                onChange={(accessToken) => update({ accessToken })}
                placeholder="请输入 Access Token"
              />
            </>
          ) : (
            <SettingsSecretInput
              label="豆包 API Key"
              description="对应 X-Api-Key（新版控制台），保存时会加密。"
              value={settings.apiKey ?? ''}
              onChange={(apiKey) => update({ apiKey })}
              placeholder="请输入 API Key"
            />
          )}
          <SettingsInput
            label="Resource ID"
            description="默认使用豆包语音识别模型 2.0 小时版（volc.seedasr.sauc.duration）。"
            value={settings.resourceId}
            onChange={(resourceId) => update({ resourceId })}
            placeholder="volc.seedasr.sauc.duration"
          />
          <SettingsSelect
            label="连接模式"
            description="优化版只在结果变化时返回新包，实时体验更好。"
            value={settings.endpointMode}
            onValueChange={(endpointMode) => update({ endpointMode: endpointMode as VoiceDictationSettings['endpointMode'] })}
            options={ENDPOINT_OPTIONS}
          />
          <SettingsSelect
            label="识别语言"
            description="自动识别适合中英文和方言混合输入。"
            value={settings.language || 'auto'}
            onValueChange={(language) => update({ language: language === 'auto' ? '' : language })}
            options={LANGUAGE_OPTIONS}
          />
          <SettingsTextarea
            label="自定义热词"
            description="每行或逗号分隔一个词，会在本次识别请求中直传给豆包，用于改善产品名、技术词和人名识别。"
            value={settings.customHotwords}
            onChange={(customHotwords) => update({ customHotwords })}
            placeholder={"Roy\nJotai\nShadcnUI\nClaude Code"}
            minHeight={112}
          />
          <SettingsSelect
            label="输出方式"
            description="默认写入当前光标位置；如果唤起时 Roy 是当前激活窗口，会写入当前 Chat 或 Agent 输入框。自动粘贴失败时会保留到剪贴板。"
            value={settings.outputMode}
            onValueChange={(outputMode) => update({ outputMode: outputMode as VoiceDictationSettings['outputMode'] })}
            options={OUTPUT_OPTIONS}
          />
        </SettingsCard>
      </SettingsSection>


      <SettingsSection
        title="语音合成"
        description="在语音识别下方单独配置。默认关闭；打开并选择引擎后，AI 工具台会按所选引擎朗读回复。密钥仅保存在本机（加密），不会写进仓库。"
      >
        <SettingsCard>
          <SettingsToggle
            label="接入语音合成"
            description="打开后允许 Roy 朗读试听/回复。关闭则只显示文字（唤醒短应答「在」仍可用本机临时出声）。"
            checked={ttsEnabled}
            onCheckedChange={(on) => { void updateTts({ enabled: on }) }}
          />
          <SettingsSelect
            label="合成引擎"
            description="系统：本机免密钥；豆包 / Minimax：需在下方填控制台凭证后才能云端发声。"
            value={ttsEngine}
            onValueChange={(engine) => { void updateTts({ engine: engine as RoyTtsEngine }) }}
            options={TTS_ENGINE_OPTIONS}
          />

          {ttsEngine === 'doubao' && (
            <>
              <div className="rounded-lg bg-muted/55 px-4 py-3 text-sm text-muted-foreground shadow-sm">
                <p className="mb-1.5 font-medium text-foreground">豆包 TTS 配置</p>
                <p className="leading-relaxed">
                  <strong className="text-foreground">旧版</strong>走 openspeech v1：在
                  <a href={VOLCENGINE_TTS_CONSOLE_URL} target="_blank" rel="noreferrer" className="mx-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                    语音合成控制台
                    <ExternalLink className="size-3" />
                  </a>
                  取 APP ID / Access Token / Cluster，音色为 voice_type（如 BV001_streaming）。
                  <strong className="text-foreground">新版</strong>走 V3 HTTP：在
                  <a href={VOLCENGINE_API_KEY_URL} target="_blank" rel="noreferrer" className="mx-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                    API Key 管理
                    <ExternalLink className="size-3" />
                  </a>
                  创建 Key，填 Resource ID（如 seed-tts-2.0）与 speaker 音色 ID。
                </p>
              </div>
              <SettingsSelect
                label="豆包 TTS 鉴权模式"
                description="与上方识别可各自选择；新版与旧版凭证互不通用。"
                value={ttsSettings?.doubaoAuthMode ?? 'legacy'}
                onValueChange={(doubaoAuthMode) => {
                  const mode = doubaoAuthMode as VoiceAuthMode
                  const patch: Partial<VoiceTtsSettings> = { doubaoAuthMode: mode }
                  if (mode === 'apiKey') {
                    const cur = (ttsSettings?.doubaoSpeaker || ttsSettings?.doubaoVoiceType || '').trim()
                    if (!cur || isLegacyDoubaoVoiceType(cur)) {
                      patch.doubaoSpeaker = DOUBAO_V3_DEFAULT_SPEAKER
                      if (!ttsSettings?.doubaoResourceId?.trim()) patch.doubaoResourceId = 'seed-tts-2.0'
                    }
                  } else {
                    const cur = (ttsSettings?.doubaoVoiceType || '').trim()
                    if (!cur || !isLegacyDoubaoVoiceType(cur)) {
                      patch.doubaoVoiceType = DOUBAO_LEGACY_DEFAULT_VOICE
                    }
                  }
                  void updateTts(patch)
                }}
                options={AUTH_MODE_OPTIONS}
              />
              {(ttsSettings?.doubaoAuthMode ?? 'legacy') === 'legacy' ? (
                <>
                  <SettingsInput
                    label="豆包 TTS APP ID"
                    value={ttsSettings?.doubaoAppId ?? ''}
                    onChange={(doubaoAppId) => { void updateTts({ doubaoAppId }) }}
                    placeholder="火山语音合成 APP ID"
                  />
                  <SettingsSecretInput
                    label="豆包 TTS Access Token"
                    description="保存时加密。"
                    value={ttsSettings?.doubaoAccessToken ?? ''}
                    onChange={(doubaoAccessToken) => { void updateTts({ doubaoAccessToken }) }}
                    placeholder="Access Token"
                  />
                  <SettingsInput
                    label="Cluster"
                    value={ttsSettings?.doubaoCluster ?? 'volcano_tts'}
                    onChange={(doubaoCluster) => { void updateTts({ doubaoCluster }) }}
                    placeholder="volcano_tts"
                  />
                  <SettingsInput
                    label="音色 voice_type"
                    value={ttsSettings?.doubaoVoiceType ?? 'BV001_streaming'}
                    onChange={(doubaoVoiceType) => { void updateTts({ doubaoVoiceType }) }}
                    placeholder="BV001_streaming"
                  />
                </>
              ) : (
                <>
                  <SettingsSecretInput
                    label="豆包 TTS API Key"
                    description="对应 X-Api-Key，保存时加密。"
                    value={ttsSettings?.doubaoApiKey ?? ''}
                    onChange={(doubaoApiKey) => { void updateTts({ doubaoApiKey }) }}
                    placeholder="API Key"
                  />
                  <SettingsInput
                    label="Resource ID"
                    description={DOUBAO_TTS_PAIRING_HINT}
                    value={ttsSettings?.doubaoResourceId ?? 'seed-tts-2.0'}
                    onChange={(doubaoResourceId) => { void updateTts({ doubaoResourceId }) }}
                    placeholder="seed-tts-2.0"
                  />
                  <SettingsInput
                    label="音色 speaker（V3）"
                    description="须与上方 Resource ID 同代。2.0 示例：zh_female_vv_uranus_bigtts。勿填旧版 BV001_streaming。"
                    value={
                      ttsSettings?.doubaoSpeaker
                      || (isLegacyDoubaoVoiceType(ttsSettings?.doubaoVoiceType ?? '')
                        ? DOUBAO_V3_DEFAULT_SPEAKER
                        : (ttsSettings?.doubaoVoiceType ?? DOUBAO_V3_DEFAULT_SPEAKER))
                    }
                    onChange={(doubaoSpeaker) => { void updateTts({ doubaoSpeaker }) }}
                    placeholder="zh_female_vv_uranus_bigtts"
                  />
                </>
              )}
            </>
          )}

          {ttsEngine === 'minimax' && (
            <>
              <div className="rounded-lg bg-muted/55 px-4 py-3 text-sm text-muted-foreground shadow-sm">
                <p className="mb-1.5 font-medium text-foreground">Minimax TTS 配置</p>
                <p className="leading-relaxed">
                  在
                  <a href={MINIMAX_CONSOLE_URL} target="_blank" rel="noreferrer" className="mx-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                    Minimax 开放平台
                    <ExternalLink className="size-3" />
                  </a>
                  创建接口密钥，填写 Group ID 与 API Key；音色如 male-qn-qingse，模型默认 speech-02-hd。
                </p>
              </div>
              <SettingsInput
                label="Minimax Group ID"
                value={ttsSettings?.minimaxGroupId ?? ''}
                onChange={(minimaxGroupId) => { void updateTts({ minimaxGroupId }) }}
                placeholder="GroupId"
              />
              <SettingsSecretInput
                label="Minimax API Key"
                description="保存时加密。"
                value={ttsSettings?.minimaxApiKey ?? ''}
                onChange={(minimaxApiKey) => { void updateTts({ minimaxApiKey }) }}
                placeholder="API Key"
              />
              <SettingsInput
                label="音色 voice_id"
                value={ttsSettings?.minimaxVoiceId ?? 'male-qn-qingse'}
                onChange={(minimaxVoiceId) => { void updateTts({ minimaxVoiceId }) }}
                placeholder="male-qn-qingse"
              />
              <SettingsInput
                label="模型"
                value={ttsSettings?.minimaxModel ?? 'speech-02-hd'}
                onChange={(minimaxModel) => { void updateTts({ minimaxModel }) }}
                placeholder="speech-02-hd"
              />
            </>
          )}

          {ttsEngine === 'system' && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              使用 Windows / 本机 speechSynthesis，不上传文本。若系统未装中文语音包，可能听起来不自然——可改选豆包或 Minimax。
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ttsTesting}
              onClick={() => {
                void (async () => {
                  setTtsTesting(true)
                  try {
                    if (!window.electronAPI?.testVoiceTtsConnection || !window.electronAPI?.synthesizeVoiceTts) {
                      toast.error('试听接口未就绪（IPC 未暴露），请重启 Roy 后再试')
                      return
                    }
                    const base = ttsSettings ?? {
                      enabled: true,
                      engine: ttsEngine,
                      doubaoAuthMode: 'legacy' as VoiceAuthMode,
                      doubaoAppId: '',
                      doubaoAccessToken: '',
                      doubaoApiKey: '',
                      doubaoResourceId: 'seed-tts-2.0',
                      doubaoCluster: 'volcano_tts',
                      doubaoVoiceType: DOUBAO_LEGACY_DEFAULT_VOICE,
                      doubaoSpeaker: DOUBAO_V3_DEFAULT_SPEAKER,
                      minimaxApiKey: '',
                      minimaxGroupId: '',
                      minimaxVoiceId: 'male-qn-qingse',
                      minimaxModel: 'speech-02-hd',
                    }
                    const overrides: Partial<VoiceTtsSettings> = {
                      ...base,
                      enabled: true,
                      engine: ttsEngine,
                    }
                    if (ttsEngine === 'doubao') {
                      const mode = overrides.doubaoAuthMode ?? 'legacy'
                      if (mode === 'apiKey') {
                        if (!overrides.doubaoApiKey?.trim()) {
                          toast.error('新版鉴权：请先填写豆包 TTS API Key')
                          return
                        }
                        if (isLegacyDoubaoVoiceType(overrides.doubaoSpeaker || overrides.doubaoVoiceType || '')) {
                          overrides.doubaoSpeaker = DOUBAO_V3_DEFAULT_SPEAKER
                        }
                      } else if (!overrides.doubaoAppId?.trim() || !overrides.doubaoAccessToken?.trim()) {
                        toast.error('旧版鉴权：请先填写 APP ID 与 Access Token')
                        return
                      }
                    }
                    if (ttsEngine === 'minimax') {
                      if (!overrides.minimaxApiKey?.trim() || !overrides.minimaxGroupId?.trim()) {
                        toast.error('请先填写 Minimax 的 Group ID 与 API Key')
                        return
                      }
                    }
                    if (!ttsEnabled) {
                      toast.message('将临时用当前配置试听（未改「启用语音合成」开关）')
                    }
                    const result = await window.electronAPI.testVoiceTtsConnection(overrides)
                    if (!result.success) {
                      toast.error(result.message || '语音合成连接失败')
                      return
                    }
                    if (ttsEngine === 'system') {
                      await speakWorkbenchTts('语音合成已接入。你好，Roy 工作台试听。', { force: true })
                      toast.success(result.message || '系统合成试听完成')
                      return
                    }
                    const syn = await window.electronAPI.synthesizeVoiceTts({
                      text: '语音合成已接入。你好，Roy 工作台试听。',
                      updates: overrides,
                    })
                    if (syn.useBrowserSpeechSynthesis) {
                      await speakWorkbenchTts('语音合成已接入。你好，Roy 工作台试听。', { force: true })
                      toast.success('已用系统合成试听')
                      return
                    }
                    if (!syn.success || !syn.audioBase64) {
                      toast.error(syn.message || '合成失败，未返回音频')
                      return
                    }
                    const bin = atob(syn.audioBase64)
                    const bytes = new Uint8Array(bin.length)
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
                    const blob = new Blob([bytes], { type: syn.mimeType || 'audio/mpeg' })
                    const url = URL.createObjectURL(blob)
                    await new Promise<void>((resolve, reject) => {
                      const audio = new Audio(url)
                      audio.onended = () => { URL.revokeObjectURL(url); resolve() }
                      audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('音频播放失败')) }
                      void audio.play().catch(reject)
                    })
                    toast.success(result.message || '试听成功：已播放合成音频')
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : String(error))
                  } finally {
                    setTtsTesting(false)
                  }
                })()
              }}
            >
              {ttsTesting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="mr-1.5 h-3.5 w-3.5" />}
              试听合成
            </Button>
            {(ttsSaving || saving) && (
              <span className="text-xs text-muted-foreground">正在保存…</span>
            )}
          </div>
        </SettingsCard>
      </SettingsSection>

      {saving && (
        <p className="text-xs text-muted-foreground">正在保存语音输入设置...</p>
      )}
    </div>
  )
}
