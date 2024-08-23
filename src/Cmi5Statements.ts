import XAPI, {
  Agent,
  Context,
  InteractionActivityDefinition,
  InteractionComponent,
  LanguageMap,
  ObjectiveActivity,
  ResultScore,
  Statement,
  StatementObject,
} from "@xapi/xapi";
import { v4 as uuidv4 } from "uuid";
import { default as deepmerge } from "deepmerge";
import {
  LaunchContext,
  MoveOnOptions,
  NumericCriteria,
  NumericExact,
  NumericRange,
  PassOptions,
  Performance,
  PerformanceCriteria,
  Period,
  SendStatementOptions,
  StatementTransform,
} from "./interfaces";
import { Cmi5ContextActivity, Cmi5DefinedVerbs } from "./constants";

export function Cmi5DefinedStatement(
  ctx: LaunchContext,
  statement: Partial<Statement>
): Statement {
  // 9.4 Object - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#94-object
  const object: StatementObject = {
    objectType: "Activity",
    id: ctx.launchParameters.activityId,
  };
  const context: Context = {
    contextActivities: {
      category: [
        // 9.6.2.1 cmi5 Category Activity - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#9621-cmi5-category-activity
        Cmi5ContextActivity.CMI5,
      ],
    },
  };
  const cmi5DefinedStatementRequirements: Partial<Statement> = {
    object: object,
    context: context,
  };

  return Cmi5AllowedStatement(
    ctx,
    deepmerge.all([cmi5DefinedStatementRequirements, statement])
  );
}

export function Cmi5AllowedStatement(
  ctx: LaunchContext,
  statement: Partial<Statement>
): Statement {
  // 9.1 Statement ID - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#statement_id
  const id = uuidv4();
  // 9.2 Actor - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#92-actor
  const actor: Agent = ctx.launchParameters.actor;
  // 9.7 Timestamp - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#97-timestamp
  const timestamp = new Date().toISOString();
  // 10.0 xAPI State Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#100-xapi-state-data-model
  const context: Context = Object.assign({}, ctx.launchData.contextTemplate);
  // 9.6.1 Registration - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#961-registration
  context.registration = ctx.launchParameters.registration;
  const cmi5AllowedStatementRequirements: Partial<Statement> = {
    id: id,
    actor: actor,
    timestamp: timestamp,
    context: context,
  };

  return deepmerge.all([
    cmi5AllowedStatementRequirements,
    statement,
  ]) as Statement;
}

export function Cmi5CompleteStatement(
  ctx: LaunchContext,
  options?: SendStatementOptions
): Statement {
  // 10.0 xAPI State Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#100-xapi-state-data-model
  if (ctx.launchData.launchMode !== "Normal")
    throw new Error("Can only send COMPLETED when launchMode is 'Normal'");
  return Cmi5DefinedStatement(ctx, {
    // 9.3.3 Completed - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#933-completed
    verb: Cmi5DefinedVerbs.COMPLETED,
    result: {
      // 9.5.3 Completion - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#953-completion
      completion: true,
      // 9.5.4.1 Duration - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#completed-statement
      duration: XAPI.calculateISO8601Duration(ctx.initializedDate, new Date()),
    },
    context: {
      contextActivities: {
        category: [
          // 9.6.2.2 moveOn Category Activity - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#9622-moveon-category-activity
          Cmi5ContextActivity.MOVE_ON,
        ],
      },
    },
  });
}

export function Cmi5PassStatement(
  ctx: LaunchContext,
  score?: ResultScore | number,
  objectiveOrOptions?: ObjectiveActivity | PassOptions
): Statement {
  // 10.0 xAPI State Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#100-xapi-state-data-model
  if (ctx.launchData.launchMode !== "Normal")
    throw new Error("Can only send PASSED when launchMode is 'Normal'");
  const rScore = _toResultScore(score);
  // Best Practice #4 - AU Mastery Score - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
  if (
    ctx.launchData.masteryScore &&
    (!rScore ||
      isNaN(Number(rScore.scaled)) ||
      rScore.scaled < ctx.launchData.masteryScore)
  )
    throw new Error("Learner has not met Mastery Score");
  const objective = _isObjectiveActivity(objectiveOrOptions)
    ? objectiveOrOptions
    : objectiveOrOptions?.objectiveActivity;
  return Cmi5DefinedStatement(ctx, {
    // 9.3.4 Passed - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#934-passed
    verb: Cmi5DefinedVerbs.PASSED,
    result: {
      // 9.5.1 Score - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#951-score
      ...(rScore ? { score: rScore } : {}),
      // 9.5.2 Success - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#952-success
      success: true,
      // 9.5.4.1 Duration - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#passed-statement
      duration: XAPI.calculateISO8601Duration(ctx.initializedDate, new Date()),
    },
    context: {
      contextActivities: {
        // 9.6.2.2 moveOn Category Activity - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#9622-moveon-category-activity
        category: [Cmi5ContextActivity.MOVE_ON],
        // Best Practice #1 - Use of Objectives - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
        ...(objective ? { parent: [objective] } : {}),
      },
      ...(ctx.launchData.masteryScore
        ? {
            extensions: {
              "https://w3id.org/xapi/cmi5/context/extensions/masteryscore":
                ctx.launchData.masteryScore,
            },
          }
        : {}),
    },
  });
}

export function Cmi5FailStatement(
  ctx: LaunchContext,
  score?: ResultScore | number,
): Statement {
  // 10.0 xAPI State Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#100-xapi-state-data-model
  if (ctx.launchData.launchMode !== "Normal")
    throw new Error("Can only send FAILED when launchMode is 'Normal'");
  const rScore = _toResultScore(score);

  return Cmi5DefinedStatement(ctx, {
    // 9.3.5 Failed - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#935-failed
    verb: Cmi5DefinedVerbs.FAILED,
    result: {
      // 9.5.1 Score - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#951-score
      ...(rScore ? { score: rScore } : {}),
      // 9.5.2 Success - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#952-success
      success: false,
      // 9.5.4.1 Duration - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#failed-statement
      duration: XAPI.calculateISO8601Duration(ctx.initializedDate, new Date()),
    },
    context: {
      contextActivities: {
        category: [
          // 9.6.2.2 moveOn Category Activity - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#9622-moveon-category-activity
          Cmi5ContextActivity.MOVE_ON,
        ],
      },
      ...(ctx.launchData.masteryScore
        ? {
            extensions: {
              "https://w3id.org/xapi/cmi5/context/extensions/masteryscore":
                ctx.launchData.masteryScore,
            },
          }
        : {}),
    },
  });
}

export function Cmi5TerminateStatement(ctx: LaunchContext): Statement {
  return Cmi5DefinedStatement(ctx, {
    // 9.3.8 Terminated - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#938-terminated
    verb: Cmi5DefinedVerbs.TERMINATED,
    result: {
      // 9.5.4.1 Duration - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#terminated-statement
      duration: XAPI.calculateISO8601Duration(ctx.initializedDate, new Date()),
    },
  });
}

// "cmi5 allowed" Statements
export function Cmi5ProgressStatement(
  ctx: LaunchContext,
  percent: number
): Statement {
  return Cmi5AllowedStatement(ctx, {
    verb: XAPI.Verbs.PROGRESSED,
    object: {
      objectType: "Activity",
      id: ctx.launchParameters.activityId,
    },
    result: {
      extensions: {
        "https://w3id.org/xapi/cmi5/result/extensions/progress": percent,
      },
    },
  });
}

function setResultScore(resultScore: ResultScore, s: Statement): Statement {
  return {
    ...s,
    result: {
      ...(s.result || {}),
      score: resultScore,
    },
  };
}

export function Cmi5MoveOnStatementSendOptions(
  ctx: LaunchContext,
  options?: MoveOnOptions
): MoveOnOptions {
  if (options?.score && !ctx.launchData.masteryScore) {
    const rScore = _toResultScore(options?.score);
    const _setResultScore: StatementTransform = (s) =>
      setResultScore(rScore, s);
    const transformProvided = options?.transform;
    const transform =
      typeof transformProvided === "function"
        ? (s) => transformProvided(_setResultScore(s))
        : (s) => _setResultScore(s);
    return { ...options, transform };
  }
  return options || {};
}

export function Cmi5MoveOnStatements(
  ctx: LaunchContext,
  options?: MoveOnOptions
): Statement[] {
  const statements: Statement[] = [];
  // 10.0 xAPI State Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#100-xapi-state-data-model
  if (ctx.launchData.launchMode !== "Normal") {
    throw new Error("Can only send FAILED when launchMode is 'Normal'");
  }

  if (options?.score) {
    const rScore = _toResultScore(options?.score);
    if (ctx.launchData.masteryScore) {
      if (rScore.scaled >= ctx.launchData.masteryScore) {
        statements.push(Cmi5PassStatement(ctx, rScore, options));
      } else {
        statements.push(Cmi5FailStatement(ctx, rScore));
      }
    }
  }

  statements.push(Cmi5CompleteStatement(ctx));
  if (!options?.disableSendTerminated) {
    statements.push(Cmi5TerminateStatement(ctx));
  }

  return statements;
}

export function Cmi5InteractionTrueFalseStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  answer: boolean,
  correctAnswer?: boolean,
  name?: LanguageMap,
  description?: LanguageMap,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return Cmi5InteractionStatement(
    ctx,
    testId,
    questionId,
    answer.toString(),
    {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      interactionType: "true-false",
      ...(correctAnswer !== undefined
        ? {
            correctResponsesPattern: correctAnswer ? ["true"] : ["false"],
          }
        : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
    success,
    duration,
    objective
  );
}

export function Cmi5InteractionChoiceStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  answerIds: string[],
  correctAnswerIds?: string[],
  choices?: InteractionComponent[],
  name?: LanguageMap,
  description?: LanguageMap,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return Cmi5InteractionStatement(
    ctx,
    testId,
    questionId,
    answerIds.join("[,]"),
    {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      interactionType: "choice",
      ...(correctAnswerIds
        ? {
            correctResponsesPattern: [correctAnswerIds.join("[,]")],
          }
        : {}),
      ...(choices ? { choices } : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
    success,
    duration,
    objective
  );
}

export function Cmi5InteractionFillInStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  answers: string[],
  correctAnswers?: string[],
  name?: LanguageMap,
  description?: LanguageMap,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return Cmi5InteractionStatement(
    ctx,
    testId,
    questionId,
    answers.join("[,]"),
    {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      interactionType: "fill-in",
      ...(correctAnswers
        ? {
            correctResponsesPattern: [correctAnswers.join("[,]")],
          }
        : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
    success,
    duration,
    objective
  );
}

export function Cmi5InteractionLongFillInStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  answers: string[],
  correctAnswers?: string[],
  name?: LanguageMap,
  description?: LanguageMap,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return Cmi5InteractionStatement(
    ctx,
    testId,
    questionId,
    answers.join("[,]"),
    {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      interactionType: "long-fill-in",
      ...(correctAnswers
        ? {
            correctResponsesPattern: [correctAnswers.join("[,]")],
          }
        : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
    success,
    duration,
    objective
  );
}

export function Cmi5InteractionLikertStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  answerId: string,
  correctAnswerId?: string,
  scale?: InteractionComponent[],
  name?: LanguageMap,
  description?: LanguageMap,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return Cmi5InteractionStatement(
    ctx,
    testId,
    questionId,
    answerId,
    {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      interactionType: "likert",
      ...(correctAnswerId
        ? {
            correctResponsesPattern: [correctAnswerId],
          }
        : {}),
      ...(scale ? { scale } : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
    success,
    duration,
    objective
  );
}

export function Cmi5InteractionMatchingStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  answers: { [sourceId: string]: string },
  correctAnswers?: { [sourceId: string]: string },
  source?: InteractionComponent[],
  target?: InteractionComponent[],
  name?: LanguageMap,
  description?: LanguageMap,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return Cmi5InteractionStatement(
    ctx,
    testId,
    questionId,
    Object.entries(answers)
      .map(([k, v]) => `${k}[.]${v}`)
      .join("[,]"),
    {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      interactionType: "matching",
      ...(correctAnswers
        ? {
            correctResponsesPattern: [
              Object.entries(correctAnswers)
                .map(([key, val]) => `${key}[.]${val}`)
                .join("[,]"),
            ],
          }
        : {}),
      ...(source ? { source } : {}),
      ...(target ? { target } : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
    success,
    duration,
    objective
  );
}

export function Cmi5InteractionPerformanceStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  answers: Performance,
  correctAnswers?: PerformanceCriteria[],
  steps?: InteractionComponent[],
  name?: LanguageMap,
  description?: LanguageMap,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return Cmi5InteractionStatement(
    ctx,
    testId,
    questionId,
    Object.entries(answers)
      .map(([k, v]) => `${k}[.]${v}`)
      .join("[,]"),
    {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      interactionType: "performance",
      ...(correctAnswers
        ? {
            correctResponsesPattern: [
              Object.entries(correctAnswers)
                .map(([k, v]) => `${k}[.]${_numericCriteriaToString(v)}`)
                .join("[,]"),
            ],
          }
        : {}),
      ...(steps ? { steps } : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
    success,
    duration,
    objective
  );
}

export function Cmi5InteractionSequencingStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  answerIds: string[],
  correctAnswerIds: string[],
  choices?: InteractionComponent[],
  name?: LanguageMap,
  description?: LanguageMap,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return Cmi5InteractionStatement(
    ctx,
    testId,
    questionId,
    answerIds.join("[,]"),
    {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      interactionType: "sequencing",
      ...(correctAnswerIds
        ? {
            correctResponsesPattern: [correctAnswerIds.join("[,]")],
          }
        : {}),
      ...(choices ? { choices } : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
    success,
    duration,
    objective
  );
}

export function Cmi5InteractionNumericStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  answer: number,
  correctAnswer: NumericCriteria,
  name?: LanguageMap,
  description?: LanguageMap,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  const correctAnswerObj = correctAnswer
    ? { correctResponsesPattern: [_numericCriteriaToString(correctAnswer)] }
    : {};
  return Cmi5InteractionStatement(
    ctx,
    testId,
    questionId,
    answer.toString(),
    {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      interactionType: "numeric",
      ...correctAnswerObj,
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
    success,
    duration,
    objective
  );
}

export function Cmi5InteractionOtherStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  answer: string,
  correctAnswer: string,
  name?: LanguageMap,
  description?: LanguageMap,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return Cmi5InteractionStatement(
    ctx,
    testId,
    questionId,
    answer,
    {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      interactionType: "other",
      ...(correctAnswer
        ? {
            correctResponsesPattern: [correctAnswer],
          }
        : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
    success,
    duration,
    objective
  );
}

export function Cmi5InteractionStatement(
  ctx: LaunchContext,
  testId: string,
  questionId: string,
  response: string,
  interactionDefinition: InteractionActivityDefinition,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return Cmi5AllowedStatement(ctx, {
    verb: XAPI.Verbs.ANSWERED,
    result: {
      response: response,
      ...(duration
        ? {
            duration: XAPI.calculateISO8601Duration(
              duration.start,
              duration.end
            ),
          }
        : {}),
      ...(typeof success === "boolean" ? { success } : {}),
    },
    object: {
      objectType: "Activity",
      // Best Practice #16 - AU should use a derived activity ID for “cmi.interaction” statements - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
      id: `${ctx.launchParameters.activityId}/test/${testId}/question/${questionId}`,
      definition: interactionDefinition,
    },
    // Best Practice #1 - Use of Objectives - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
    ...(objective
      ? {
          context: {
            contextActivities: {
              parent: [objective],
            },
          },
        }
      : {}),
  });
}

// Helper/utility functions

function _isObjectiveActivity(x?: unknown): x is ObjectiveActivity {
  return (
    x &&
    x.objectType === "Activity" &&
    typeof x.id === "string" &&
    x.definition.type === "http://adlnet.gov/expapi/activities/objective"
  );
}

function _toResultScore(s?: ResultScore | number): ResultScore | undefined {
  return _isNumber(s) ? { scaled: Number(s) } : s;
}

function _isNumber(n?: number | unknown): n is number {
  return !isNaN(Number(n));
}

function _isNumericExact(candidate: unknown): candidate is NumericExact {
  return typeof candidate === "object" && "exact" in candidate;
}

function _isNumericRange(candidate: unknown): candidate is NumericRange {
  return (
    typeof candidate === "object" && "min" in candidate && "max" in candidate
  );
}

function _numericCriteriaToString(
  criteria: NumericExact | NumericRange | unknown
) {
  if (_isNumericExact(criteria)) {
    return String(criteria.exact);
  } else if (_isNumericRange(criteria)) {
    const { min, max } = criteria;
    return `${min}:${max}`;
  } else {
    return ":";
  }
}
