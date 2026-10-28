/**
 * Roy 产物打开契约 — 文案与文档类判断
 * 见 E:\\AIproject\\02-roy-harness\\docs\\Roy产物打开契约.md
 */

const PROJECT_DOC_EXT = /\.(md|mdx|txt|rst|markdown)$/i

/** 文档类产物：主按钮可用「打开项目文档」文案，通道仍是预览工作台 */
export function isRoyProjectDocPath(filePath: string): boolean {
  const base = filePath.split(/[\\/]/).pop() ?? filePath
  return PROJECT_DOC_EXT.test(base)
}

export function getRoyPrimaryOpenLabel(filePath: string): string {
  return isRoyProjectDocPath(filePath) ? '打开项目文档' : '打开工作台'
}

export const ROY_OPEN_WORKBENCH_LABEL = '打开工作台'
export const ROY_REVEAL_IN_FOLDER_LABEL = '在文件夹中显示'
export const ROY_OPEN_PROJECT_DOC_LABEL = '打开项目文档'
