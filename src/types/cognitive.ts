/**
 * 认知画像类型定义
 * 与后端 DTO 1:1 映射，支持个人反思和认知偏差分析
 */

/**
 * 个人认知画像 (镜像对齐 PersonaProfile)
 * 对应后端: PersonaProfileDTO
 */
export interface PersonaProfile {
  /** 画像唯一标识 */
  profileId: string;

  /** 最后更新时间 (Epoch milliseconds) */
  updatedAt: number;

  /**
   * 认知偏差列表
   * 记录用户在特定领域的已识别偏差
   */
  biases: Array<{
    /** 偏差名称 (如: confirmation_bias, anchoring_bias) */
    biasName: string;

    /** 偏差在实际行为中的具体表现 */
    manifestation: string;

    /** 该偏差出现的频率 (0.0~1.0) */
    frequency: number;

    /** 系统对偏差识别的置信度 */
    confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;

  /**
   * 认知盲点映射 (领域 -> 盲点程度)
   * key: 知识领域 (如: system_design, algorithms)
   * value: 盲点程度 (0.0~1.0，1.0 表示完全盲区)
   */
  blindSpots: Record<string, number>;

  /**
   * 注意力标签
   * 标记用户持续关注的主题或需要改进的领域
   */
  attentionTags: string[];

  /** 累计反思天数 (用于长期成长追踪) */
  totalReflectiveDays: number;
}

/**
 * 日志条目 (Journal Entry)
 * 对应后端: JournalEntryDTO
 * 记录用户的思考过程、问题和行动计划
 */
export interface JournalEntry {
  /** 日志唯一标识 */
  entryId: string;

  /** 用户原始输入内容 */
  rawContent: string;

  /** 记录日期 (ISO-8601 格式: YYYY-MM-DD) */
  recordDate: string;

  /** 用户标记的标签 */
  tags: string[];

  /**
   * AI 智能提取的结构化内容
   */
  extraction: {
    /** 此日志中的关键突破点或洞察 */
    breakthroughs: string[];

    /**
     * 遇到的障碍及分析
     * 帮助识别认知偏差和知识盲点
     */
    blockers: Array<{
      /** 问题表现症状 */
      symptom: string;

      /** 根本原因分析 */
      rootCause: string;

      /** 涉及的技术领域 */
      technicalDomain: string;
    }>;

    /**
     * MVP 级别的行动项
     * 优先级高且可立即执行的改进方向
     */
    mvpActions: string[];
  };

  /** 日志创建时间 (Epoch milliseconds) */
  createdAt: number;
}

/**
 * 导师反思提示 (Tutor Reflection Prompt)
 * 对应后端: TutorReflectionPromptDTO
 * 基于用户认知档案生成的个性化反思问题
 */
export interface TutorReflectionPrompt {
  /** 提示唯一标识 */
  promptId: string;

  /**
   * 目标学习领域
   * (如: system_design, backend_architecture, problem_solving)
   */
  targetDomain: string;

  /** 该反思会话的上下文总结 */
  contextSummary: string;

  /**
   * 核心冲突或矛盾
   * 触发本次反思的关键认知不一致
   */
  coreConflict: string;

  /**
   * 反思问题列表
   * 设计用于挑战用户的现有假设
   */
  questions: Array<{
    /** 问题在列表中的顺序 */
    index: number;

    /** 对比的概念 A */
    conceptA: string;

    /** 对比的概念 B */
    conceptB: string;

    /** 完整的反思问题文本 */
    questionText: string;
  }>;

  /**
   * 知识链接
   * 关联的历史日志条目和相关洞察
   */
  knowledgeLinks: Array<{
    /** 关联的历史日志 ID */
    historicalEntryId: string;

    /** 关系类型 (如: contradicts, reinforces, extends) */
    relationType: string;

    /** 链接处的关键洞察 */
    insight: string;
  }>;
}


/**
 * API 响应类型定义
 */

/**
 * 日记审查 API 响应
 * 后端端点: POST /api/v1/journal/review
 */
export interface JournalReviewResponse {
  /** 是否成功处理 */
  success: boolean;

  data: {
    /** 结构化提取后的日志条目 */
    entry: JournalEntry;

    /**
     * Append-only 物理落盘路径
     * 格式: YYYY/MM/DD/entry-{id}.json（与后端 generateRelativePath 一致）
     * 例: 2026/10/25/entry-2026-10-25-001.json
     */
    physicalPath: string;

    /**
     * 处理统计信息（与后端 ProcessingStats 字段一一对应）
     */
    processingStats?: {
      /** 识别的突破点数量 */
      breakthroughCount: number;

      /** 识别的阻碍数量 */
      blockerCount: number;

      /** 提取的行动项数量 */
      actionCount: number;

      /** 处理耗时 (毫秒) */
      processingTimeMs: number;
    };
  };

  /** 错误消息 (success=false 时存在) */
  message?: string;

  /** 详细的校验错误 */
  validationErrors?: Record<string, string>;
}
