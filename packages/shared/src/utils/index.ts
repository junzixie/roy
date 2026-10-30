/**
 * Shared utility functions for roy
 */

// Placeholder - will be expanded as needed
export function noop(): void {
  // no-op
}

export {
  createAgentRuntimeRequest,
  createAgentRuntimeResponse,
  isAgentRuntimeEnvelope,
  isAgentRuntimeError,
  serializeAgentRuntimeError,
} from './agent-runtime'

export { diffCapabilities } from './capabilities-diff'
export type { CapabilityChange } from './capabilities-diff'
export {
  DEFAULT_CONTEXT_WINDOW,
  ONE_MILLION_CONTEXT_WINDOW,
  CODEX_GPT_54_55_CONTEXT_WINDOW,
  CODEX_GPT_54_MINI_CONTEXT_WINDOW,
  CODEX_GPT_56_CONTEXT_WINDOW,
  inferCodexAlignedGPT5ContextWindow,
  supports1MContext,
  inferContextWindow,
} from './context-window'
export { calculateContextUsageRatio } from './context-usage'
export {
  getGeminiModelCapability,
  normalizeGeminiThinkingLevel,
  type GeminiModelCapability,
  type GeminiThinkingLevel,
} from './gemini-model-capabilities'
export {
  PI_AUTO_COMPACTION_THRESHOLD_RATIO,
  PI_AUTO_COMPACTION_MIN_PERCENT,
  PI_AUTO_COMPACTION_MAX_PERCENT,
  PI_AUTO_COMPACTION_ABSOLUTE_MAX_TOKENS,
  PI_IDLE_PRECOMPACT_WATERMARK_RATIO,
  PI_IDLE_PRECOMPACT_DELAY_MS,
  PI_IDLE_PRECOMPACT_NEAR_FULL_DELAY_MS,
  PI_COMPACTION_KEEP_RECENT_TOKENS,
  PI_COMPACTION_KEEP_RECENT_MIN_TOKENS,
  PI_COMPACTION_STRATEGY_RATIOS,
  normalizeCompactionPercent,
  getPiCompactionStrategyRatio,
  calculatePiAutoCompactionReserveTokens,
  calculatePiAutoCompactionThresholdTokens,
  calculatePiIdlePrecompactWatermarkTokens,
  shouldScheduleIdlePrecompact,
  resolveIdlePrecompactDelayMs,
  calculatePiCompactionKeepRecentTokens,
  isCompactionResidualTooHigh,
  describeCompactionResidual,
  PI_SHORT_TOOL_OUTPUT_CHARS,
  PI_SHORT_TOOL_OUTPUT_HEAD_CHARS,
  PI_SHORT_TOOL_OUTPUT_TAIL_CHARS,
  truncateToolResultText,
  truncateToolResultContent,
  pruneOversizedToolResultsInMessages,
  pruneToolResultsTiered,
  estimatePiMessagesChars,
  PI_TIERED_PRUNE_RECENT_KEEP,
  PI_TIERED_PRUNE_MID_CHARS,
  PI_TIERED_PRUNE_OLD_CHARS,
} from './pi-compaction'
export type { CompactionResidualBreakdown, PiCompactionCacheStrategy, PiCompactionThresholdOptions } from './pi-compaction'
export {
  ROY_CACHE_MODE_TO_RETENTION,
  ROY_DEFAULT_CACHE_MODE,
  cacheKeyForSession,
  normalizeCacheMode,
  resolveCacheRetention,
} from './prompt-cache-policy'
export type { CacheRetentionValue, RoyCacheMode } from './prompt-cache-policy'
export {
  inferMcpTransportType,
  normalizeMcpTransportType,
} from './mcp-transport'
export { removeMcpServerFromConfig } from './mcp-config'
export {
  THINKING_SIGNATURE_ERROR_CODE,
  THINKING_SIGNATURE_ERROR_TITLE,
  THINKING_SIGNATURE_ERROR_MESSAGE,
  isThinkingSignatureError,
  formatThinkingSignatureError,
  normalizeThinkingSignatureError,
} from './thinking-signature-error'
export { normalizePathForCompare } from './normalize-path'
export {
  MAX_NORMALIZED_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_QUERY_SOURCE_LENGTH,
  findBestSearchMatch,
  findBestSearchMatchInNormalized,
  normalizeSearchText,
  createSearchSnippet,
  insertTopSearchResult,
  type SearchMatch,
  type SearchMatchKind,
  type NormalizedSearchText,
  type SearchResultRank,
  type SearchSnippet,
} from './search-matching'
export {
  AUTOMATION_OCCURRENCE_SAMPLES_PER_DAY,
  getAutomationOccurrencesByDay,
} from './automation-schedule'
export type {
  AutomationOccurrenceDay,
  AutomationScheduleFields,
} from './automation-schedule'
export {
  getSDKCompactStatus,
  isPersistableSDKSystemMessage,
  type SDKCompactStatus,
} from './agent-system-message'
export {
  getSkillSlugFromEntryPath,
  createSkillActivationFromPath,
  mergeSkillActivations,
  collectSuccessfulSkillReadActivations,
  collectSkillActivations,
} from './skill-usage'

export {
  inferChannelApi,
  defaultNewChannelSetup,
  resolveChannelApi,
  buildChannelPreviewUrl,
  CHANNEL_API_PATHS,
  CHANNEL_API_LABELS,
  CHANNEL_API_HINTS,
} from './channel-api'

export {
  SKILL_SAFE_SLUG,
  SKILL_SAFE_VERSION_HEX12,
  SKILL_SAFE_SHA256,
  normalizeSkillSlug,
  isSafeSkillSlug,
  sha256Text,
  verifySkillPackageMeta,
} from './skill-integrity'
export type { SkillPackageMeta, SkillIntegrityResult } from './skill-integrity'

export { formatBytes, formatDuration } from './format'
