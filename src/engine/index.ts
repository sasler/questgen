export { validateWorld } from "./world-validator";
export type { ValidationError, ValidationResult } from "./world-validator";

export {
  applyAction,
  checkWinCondition,
  getAvailableExits,
} from "./game-engine";
export type { ActionResult, StateChange } from "./game-engine";

export { buildLocalContext } from "./context-builder";
export type { LocalContext } from "./context-builder";
