/**
 * 节点基类
 * 所有自定义节点都应该继承这个类
 */

export abstract class BaseNode {
  abstract type: string
  abstract name: string
  abstract description: string
  abstract icon: string

  abstract inputs: NodeInput[]
  abstract outputs: NodeOutput[]

  abstract execute(inputs: Record<string, any>): Promise<any>

  /**
   * 验证输入
   */
  validate(inputs: Record<string, any>): ValidationResult {
    const errors: string[] = []

    this.inputs
      .filter(input => input.required)
      .forEach(input => {
        if (inputs[input.name] === undefined || inputs[input.name] === '') {
          errors.push(`缺少必需输入：${input.label || input.name}`)
        }
      })

    return { valid: errors.length === 0, errors }
  }

  /**
   * 获取节点元数据（用于 UI 显示）
   */
  getMetadata(): NodeMetadata {
    return {
      type: this.type,
      name: this.name,
      description: this.description,
      icon: this.icon,
      inputs: this.inputs,
      outputs: this.outputs
    }
  }
}

export interface NodeInput {
  name: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file'
  required: boolean
  default?: any
  description?: string
  placeholder?: string
  options?: Array<{ label: string; value: any }>
}

export interface NodeOutput {
  name: string
  label: string
  type: string
  description?: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface NodeMetadata {
  type: string
  name: string
  description: string
  icon: string
  inputs: NodeInput[]
  outputs: NodeOutput[]
}
