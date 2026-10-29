/**
 * 统一流式内核出口（Slice 1）
 *
 * 对外只暴露这一层，屏蔽 sseParser / NexusStreamClient / interpreters 的内部结构。
 */
export { splitSseFrames, parseFrame } from './sseParser';
export {
  openStream,
  StreamHttpError,
  type OpenStreamOpts,
  type StreamCallbacks,
  type OpenStreamQuery,
} from './NexusStreamClient';
export {
  type StreamFrame,
  type FrameLog,
  type FrameInterpreter,
  type FrameInterpreterResult,
  frameStr,
  frameNum,
  frameArr,
} from './eventTypes';
export { agentInterpreter } from './interpreters/agentInterpreter';
export {
  interpretCurateFrame,
  type CurateInterpretation,
} from './interpreters/curateInterpreter';
export {
  interpretCodeFrame,
  type CodeInterpretation,
  type ScannedFileEntry,
} from './interpreters/codeInterpreter';
export {
  interpretCognitiveFrame,
  type CognitiveInterpretation,
  type CognitiveProgressItem,
} from './interpreters/cognitiveInterpreter';
