export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class DialogueScriptNotFound extends ModuleError {
  constructor(idOrAlias: string) {
    super(
      "dialogue.script_not_found",
      404,
      `dialogue script not found: ${idOrAlias}`,
    );
    this.name = "DialogueScriptNotFound";
  }
}

export class DialogueScriptAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "dialogue.script_alias_conflict",
      409,
      `dialogue script alias already exists: ${alias}`,
    );
    this.name = "DialogueScriptAliasConflict";
  }
}

export class DialogueInvalidGraph extends ModuleError {
  constructor(reason: string) {
    super("dialogue.invalid_graph", 400, `dialogue graph invalid: ${reason}`);
    this.name = "DialogueInvalidGraph";
  }
}

export class DialogueScriptInactive extends ModuleError {
  constructor(alias: string) {
    super(
      "dialogue.script_inactive",
      409,
      `dialogue script is inactive: ${alias}`,
    );
    this.name = "DialogueScriptInactive";
  }
}

export class DialogueProgressNotFound extends ModuleError {
  constructor(scriptAlias: string, endUserId: string) {
    super(
      "dialogue.progress_not_found",
      404,
      `no progress for script=${scriptAlias} user=${endUserId}`,
    );
    this.name = "DialogueProgressNotFound";
  }
}

export class DialogueAlreadyCompleted extends ModuleError {
  constructor(scriptAlias: string) {
    super(
      "dialogue.already_completed",
      409,
      `script ${scriptAlias} is already completed; call /reset if repeatable`,
    );
    this.name = "DialogueAlreadyCompleted";
  }
}

export class DialogueInvalidOption extends ModuleError {
  constructor(reason: string) {
    super("dialogue.invalid_option", 400, reason);
    this.name = "DialogueInvalidOption";
  }
}

export class DialogueOptionRequired extends ModuleError {
  constructor(nodeId: string) {
    super(
      "dialogue.option_required",
      400,
      `node ${nodeId} has options; an optionId must be provided to advance`,
    );
    this.name = "DialogueOptionRequired";
  }
}

export class DialogueNotRepeatable extends ModuleError {
  constructor(scriptAlias: string) {
    super(
      "dialogue.not_repeatable",
      409,
      `script ${scriptAlias} is not repeatable`,
    );
    this.name = "DialogueNotRepeatable";
  }
}

export class DialogueUnknownReward extends ModuleError {
  constructor(definitionId: string) {
    super(
      "dialogue.unknown_reward",
      400,
      `dialogue reward references unknown item definition: ${definitionId}`,
    );
    this.name = "DialogueUnknownReward";
  }
}
