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
import {
  AuthTokenResponse,
  LaunchData,
  LaunchParameters,
  LearnerPreferences,
  PassOptions,
  Performance,
  PerformanceCriteria,
  Period,
  MoveOnOptions,
  NumericCriteria,
  NumericExact,
  NumericRange,
  SendStatementOptions,
} from "./interfaces";
import { Cmi5DefinedVerbs, Cmi5ContextActivity } from "./constants";
import { default as deepmerge } from "deepmerge";
import axios, { AxiosPromise, AxiosResponse } from "axios";
import { v4 as uuidv4 } from "uuid";
import { Cmi5InteractionStatement, Cmi5ProgressStatement } from "Cmi5Statements";

export * from "./interfaces";

function _isObjectiveActivity(x?: any): boolean {
  return (
    x &&
    x.objectType === "Activity" &&
    typeof x.id === "string" &&
    x.definition &&
    typeof x.definition === "object" &&
    x.definition.type === "http://adlnet.gov/expapi/activities/objective"
  );
}

function _toResultScore(s?: ResultScore | number): ResultScore | undefined {
  return !isNaN(Number(s))
    ? {
        scaled: Number(s),
      }
    : (s as ResultScore);
}

function isNumericExact(candidate: unknown): candidate is NumericExact {
  return typeof candidate === "object" && "exact" in candidate;
}

function isNumericRange(candidate: unknown): candidate is NumericRange {
  return (
    typeof candidate === "object" && "min" in candidate && "max" in candidate
  );
}

function numericCriteriaToString(
  criteria: NumericExact | NumericRange | unknown
) {
  if (isNumericExact(criteria)) {
    return String(criteria.exact);
  } else if (isNumericRange(criteria)) {
    const { min, max } = criteria;
    return `${min}:${max}`;
  } else {
    return ":";
  }
}

/**
 * Experience API cmi5 Profile (Quartz - 1st Edition)
 * Reference: https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md
 */
export default class AbstractCmi5 {
  private launchParameters: LaunchParameters;
  private launchData!: LaunchData;
  private learnerPreferences!: LearnerPreferences;
  private initializedDate!: Date;
  private authToken: string | null = null;
  private _xapi: XAPI;

  constructor(launchParameters: LaunchParameters) {
    this.launchParameters = launchParameters;
    if (!this.launchParameters.fetch) {
      throw Error("Unable to construct, no `fetch` parameter found in URL.");
    } else if (!this.launchParameters.endpoint) {
      throw Error("Unable to construct, no `endpoint` parameter found in URL");
    } else if (!this.launchParameters.actor) {
      throw Error("Unable to construct, no `actor` parameter found in URL.");
    } else if (!this.launchParameters.activityId) {
      throw Error(
        "Unable to construct, no `activityId` parameter found in URL."
      );
    } else if (!this.launchParameters.registration) {
      throw Error(
        "Unable to construct, no `registration` parameter found in URL."
      );
    }
  }

  public get xapi(): XAPI | null {
    return this._xapi;
  }

  public get isAuthenticated(): boolean {
    return Boolean(this._xapi);
  }

  public getLaunchParameters(): LaunchParameters {
    return this.launchParameters;
  }

  public getLaunchData(): LaunchData {
    return this.launchData;
  }

  // Best Practice #17 – Persist AU Session State - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
  public getAuthToken(): string {
    return this.authToken;
  }

  public getInitializedDate(): Date {
    return this.initializedDate;
  }

  // 11.0 xAPI Agent Profile Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#110-xapi-agent-profile-data-model
  public getLearnerPreferences(): LearnerPreferences {
    return this.learnerPreferences;
  }

  // "cmi5 defined" Statements
  public async initialize(sessionState?: {
    authToken: string;
    initializedDate: Date;
  }): AxiosPromise<string[] | void> {
    // Best Practice #17 – Persist AU Session State - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
    const authToken = sessionState ? sessionState.authToken : (await this.getAuthTokenFromLMS(this.launchParameters.fetch));
    this.authToken = authToken;
    this._xapi = new XAPI({
      endpoint: this.launchParameters.endpoint,
      auth: `Basic ${authToken}`,
    });
    this.launchData = await this.getLaunchDataFromLMS();
    this.learnerPreferences = await this.getLearnerPreferencesFromLMS();

    if (sessionState) {
      // Best Practice #17 – Persist AU Session State - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
      this.initializedDate = sessionState.initializedDate;
    } else {
      this.initializedDate = new Date();
      // 9.3.2 Initialized - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#932-initialized
      return this.sendCmi5DefinedStatement({
        verb: Cmi5DefinedVerbs.INITIALIZED,
      });
    }
  }

  public complete(options?: SendStatementOptions): AxiosPromise<string[]> {
    // 10.0 xAPI State Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#100-xapi-state-data-model
    if (this.launchData.launchMode !== "Normal")
      return Promise.reject(
        new Error("Can only send COMPLETED when launchMode is 'Normal'")
      );
    return this.sendCmi5DefinedStatement(
      {
        // 9.3.3 Completed - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#933-completed
        verb: Cmi5DefinedVerbs.COMPLETED,
        result: {
          // 9.5.3 Completion - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#953-completion
          completion: true,
          // 9.5.4.1 Duration - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#completed-statement
          duration: XAPI.calculateISO8601Duration(
            this.initializedDate,
            new Date()
          ),
        },
        context: {
          contextActivities: {
            category: [
              // 9.6.2.2 moveOn Category Activity - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#9622-moveon-category-activity
              Cmi5ContextActivity.MOVE_ON,
            ],
          },
        },
      },
      options
    );
  }

  public pass(
    score?: ResultScore | number,
    objectiveOrOptions?: ObjectiveActivity | PassOptions
  ): AxiosPromise<string[]> {
    // 10.0 xAPI State Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#100-xapi-state-data-model
    if (this.launchData.launchMode !== "Normal")
      return Promise.reject(
        new Error("Can only send PASSED when launchMode is 'Normal'")
      );
    const rScore = _toResultScore(score);
    // Best Practice #4 - AU Mastery Score - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
    if (
      this.launchData.masteryScore &&
      (!rScore ||
        isNaN(Number(rScore.scaled)) ||
        rScore.scaled < this.launchData.masteryScore)
    )
      return Promise.reject(new Error("Learner has not met Mastery Score"));
    const [objective, options] = _isObjectiveActivity(objectiveOrOptions)
      ? [objectiveOrOptions as ObjectiveActivity, undefined]
      : [
          (objectiveOrOptions as PassOptions)
            ? (objectiveOrOptions as PassOptions).objectiveActivity
            : undefined,
          objectiveOrOptions as SendStatementOptions,
        ];
    return this.sendCmi5DefinedStatement(
      {
        // 9.3.4 Passed - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#934-passed
        verb: Cmi5DefinedVerbs.PASSED,
        result: {
          // 9.5.1 Score - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#951-score
          ...(rScore ? { score: rScore } : {}),
          // 9.5.2 Success - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#952-success
          success: true,
          // 9.5.4.1 Duration - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#passed-statement
          duration: XAPI.calculateISO8601Duration(
            this.initializedDate,
            new Date()
          ),
        },
        context: {
          contextActivities: {
            category: [
              // 9.6.2.2 moveOn Category Activity - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#9622-moveon-category-activity
              Cmi5ContextActivity.MOVE_ON,
            ],
            // Best Practice #1 - Use of Objectives - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
            ...(objective
              ? {
                  parent: [objective as ObjectiveActivity],
                }
              : {}),
          },
          ...(this.launchData.masteryScore
            ? {
                extensions: {
                  "https://w3id.org/xapi/cmi5/context/extensions/masteryscore":
                    this.launchData.masteryScore,
                },
              }
            : {}),
        },
      },
      options
    );
  }

  public fail(
    score?: ResultScore | number,
    options?: SendStatementOptions
  ): AxiosPromise<string[]> {
    // 10.0 xAPI State Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#100-xapi-state-data-model
    if (this.launchData.launchMode !== "Normal")
      return Promise.reject(
        new Error("Can only send FAILED when launchMode is 'Normal'")
      );
    const rScore = _toResultScore(score);
    return this.sendCmi5DefinedStatement(
      {
        // 9.3.5 Failed - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#935-failed
        verb: Cmi5DefinedVerbs.FAILED,
        result: {
          // 9.5.1 Score - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#951-score
          ...(rScore ? { score: rScore } : {}),
          // 9.5.2 Success - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#952-success
          success: false,
          // 9.5.4.1 Duration - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#failed-statement
          duration: XAPI.calculateISO8601Duration(
            this.initializedDate,
            new Date()
          ),
        },
        context: {
          contextActivities: {
            category: [
              // 9.6.2.2 moveOn Category Activity - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#9622-moveon-category-activity
              Cmi5ContextActivity.MOVE_ON,
            ],
          },
          ...(this.launchData.masteryScore
            ? {
                extensions: {
                  "https://w3id.org/xapi/cmi5/context/extensions/masteryscore":
                    this.launchData.masteryScore,
                },
              }
            : {}),
        },
      },
      options
    );
  }

  public terminate(): AxiosPromise<string[]> {
    return this.sendCmi5DefinedStatement({
      // 9.3.8 Terminated - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#938-terminated
      verb: Cmi5DefinedVerbs.TERMINATED,
      result: {
        // 9.5.4.1 Duration - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#terminated-statement
        duration: XAPI.calculateISO8601Duration(
          this.initializedDate,
          new Date()
        ),
      },
    });
  }

  // "cmi5 allowed" Statements
  public progress(percent: number): AxiosPromise<string[]> {
    const statement = Cmi5ProgressStatement(this.launchParameters, percent);
    return this.sendCmi5AllowedStatement(statement);
  }

  public interactionTrueFalse(
    testId: string,
    questionId: string,
    answer: boolean,
    correctAnswer?: boolean,
    name?: LanguageMap,
    description?: LanguageMap,
    success?: boolean,
    duration?: Period,
    objective?: ObjectiveActivity
  ): AxiosPromise<string[]> {
    return this.interaction(
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

  public interactionChoice(
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
  ): AxiosPromise<string[]> {
    return this.interaction(
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

  public interactionFillIn(
    testId: string,
    questionId: string,
    answers: string[],
    correctAnswers?: string[],
    name?: LanguageMap,
    description?: LanguageMap,
    success?: boolean,
    duration?: Period,
    objective?: ObjectiveActivity
  ): AxiosPromise<string[]> {
    return this.interaction(
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

  public interactionLongFillIn(
    testId: string,
    questionId: string,
    answers: string[],
    correctAnswers?: string[],
    name?: LanguageMap,
    description?: LanguageMap,
    success?: boolean,
    duration?: Period,
    objective?: ObjectiveActivity
  ): AxiosPromise<string[]> {
    return this.interaction(
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

  public interactionLikert(
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
  ): AxiosPromise<string[]> {
    return this.interaction(
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

  public interactionMatching(
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
  ): AxiosPromise<string[]> {
    return this.interaction(
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

  public interactionPerformance(
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
  ): AxiosPromise<string[]> {
    return this.interaction(
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
                  .map(([k, v]) => `${k}[.]${numericCriteriaToString(v)}`)
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

  public interactionSequencing(
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
  ): AxiosPromise<string[]> {
    return this.interaction(
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

  public interactionNumeric(
    testId: string,
    questionId: string,
    answer: number,
    correctAnswer: NumericCriteria,
    name?: LanguageMap,
    description?: LanguageMap,
    success?: boolean,
    duration?: Period,
    objective?: ObjectiveActivity
  ): AxiosPromise<string[]> {
    const correctAnswerObj = correctAnswer
      ? { correctResponsesPattern: [numericCriteriaToString(correctAnswer)] }
      : {};
    return this.interaction(
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

  public interactionOther(
    testId: string,
    questionId: string,
    answer: string,
    correctAnswer: string,
    name?: LanguageMap,
    description?: LanguageMap,
    success?: boolean,
    duration?: Period,
    objective?: ObjectiveActivity
  ): AxiosPromise<string[]> {
    return this.interaction(
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

  public interaction(
    testId: string,
    questionId: string,
    response: string,
    interactionDefinition: InteractionActivityDefinition,
    success?: boolean,
    duration?: Period,
    objective?: ObjectiveActivity
  ): AxiosPromise<string[]> {
    const statement = Cmi5InteractionStatement(
      this.launchParameters,
      testId,
      questionId,
      response,
      interactionDefinition,
      success,
      duration,
      objective
    );
    return this.sendCmi5AllowedStatement(statement);
  }

  private setResultScore(resultScore: ResultScore, s: Statement): Statement {
    return {
      ...s,
      result: {
        ...(s.result || {}),
        score: resultScore,
      },
    };
  }

  public async moveOn(options?: MoveOnOptions): Promise<string[]> {
    let effectiveOptions = options;
    // 10.0 xAPI State Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#100-xapi-state-data-model
    if (this.launchData.launchMode !== "Normal")
      return Promise.reject(
        new Error("Can only send FAILED when launchMode is 'Normal'")
      );
    const newStatementIds: string[] = [];
    if (effectiveOptions?.score) {
      const rScore = _toResultScore(effectiveOptions?.score);
      if (this.launchData.masteryScore) {
        if (rScore.scaled >= this.launchData.masteryScore) {
          this.appendStatementIds(
            await this.pass(rScore, effectiveOptions),
            newStatementIds
          );
        } else {
          this.appendStatementIds(
            await this.fail(rScore, effectiveOptions),
            newStatementIds
          );
        }
      } else {
        const _setResultScore = (s: Statement): Statement => {
          return this.setResultScore(rScore, s);
        };
        const transformProvided = effectiveOptions?.transform;
        effectiveOptions = {
          ...(effectiveOptions || {}),
          transform:
            typeof transformProvided === "function"
              ? // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
                (s) => transformProvided(_setResultScore(s))
              : // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
                (s) => _setResultScore(s),
        };
      }
    }
    this.appendStatementIds(
      await this.complete(effectiveOptions),
      newStatementIds
    );
    if (!options?.disableSendTerminated) {
      this.appendStatementIds(await this.terminate(), newStatementIds);
    }
    return newStatementIds;
  }

  private appendStatementIds(
    response: AxiosResponse<string[]>,
    toIds: string[]
  ): void {
    // eslint-disable-next-line prefer-spread
    toIds.push.apply(toIds, response.data);
  }

  private async getAuthTokenFromLMS(
    fetchUrl: string
  ): Promise<string> {
    const response = await axios.post<AuthTokenResponse>(fetchUrl);
    return response.data["auth-token"];
  }

  private async getLaunchDataFromLMS(): Promise<LaunchData> {
    const launchDataResponse = await (this._xapi.getState({
      agent: this.launchParameters.actor,
      activityId: this.launchParameters.activityId,
      stateId: "LMS.LaunchData",
      registration: this.launchParameters.registration,
    }) as AxiosPromise<LaunchData>);
    return launchDataResponse.data
  }

  private async getLearnerPreferencesFromLMS(): Promise<LearnerPreferences> {
    try {
      const learnerPrefResponse = await (this._xapi.getAgentProfile({
        agent: this.launchParameters.actor,
        profileId: "cmi5LearnerPreferences",
      }) as AxiosPromise<LearnerPreferences>);
      return learnerPrefResponse.data;
    } catch(err) {
      return {};
    }
  }

  private async sendCmi5DefinedStatement(
    statement: Partial<Statement>,
    options?: SendStatementOptions
  ): AxiosPromise<string[]> {
    // 9.4 Object - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#94-object
    const object: StatementObject = {
      objectType: "Activity",
      id: this.launchParameters.activityId,
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
    const mergedStatement: Partial<Statement> = deepmerge.all([
      cmi5DefinedStatementRequirements,
      statement,
    ]);
    return this.sendCmi5AllowedStatement(mergedStatement, options);
  }

  public async sendCmi5AllowedStatement(
    statement: Partial<Statement>,
    options?: SendStatementOptions
  ): AxiosPromise<string[]> {
    // 9.1 Statement ID - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#statement_id
    const id = uuidv4();
    // 9.2 Actor - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#92-actor
    const actor: Agent = this.launchParameters.actor;
    // 9.7 Timestamp - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#97-timestamp
    const timestamp = new Date().toISOString();
    // 10.0 xAPI State Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#100-xapi-state-data-model
    const context: Context = Object.assign({}, this.launchData.contextTemplate);
    // 9.6.1 Registration - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#961-registration
    context.registration = this.launchParameters.registration;
    const cmi5AllowedStatementRequirements: Partial<Statement> = {
      id: id,
      actor: actor,
      timestamp: timestamp,
      context: context,
    };
    const mergedStatement = deepmerge.all([
      cmi5AllowedStatementRequirements,
      statement,
    ]) as Statement;
    const sendStatement =
      options && typeof options.transform === "function"
        ? options.transform(mergedStatement)
        : mergedStatement;
    return this._xapi.sendStatement({
      statement: sendStatement,
    });
  }
}
