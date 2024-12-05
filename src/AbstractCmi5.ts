import axios from "axios";
import XAPI, {
  InteractionActivityDefinition,
  InteractionComponent,
  LanguageMap,
  ObjectiveActivity,
  ResultScore,
  Statement,
} from "@xapi/xapi";
import {
  AuthTokenResponse,
  LaunchData,
  LaunchParameters,
  LearnerPreferences,
  MoveOnOptions,
  NumericCriteria,
  PassOptions,
  Performance,
  PerformanceCriteria,
  Period,
  SendStatementOptions,
} from "./interfaces";
import { Cmi5DefinedVerbs } from "./constants";
import {
  Cmi5CompleteStatement,
  Cmi5DefinedStatement,
  Cmi5FailStatement,
  Cmi5InteractionChoiceStatement,
  Cmi5InteractionFillInStatement,
  Cmi5InteractionLikertStatement,
  Cmi5InteractionLongFillInStatement,
  Cmi5InteractionMatchingStatement,
  Cmi5InteractionNumericStatement,
  Cmi5InteractionOtherStatement,
  Cmi5InteractionPerformanceStatement,
  Cmi5InteractionSequencingStatement,
  Cmi5InteractionStatement,
  Cmi5InteractionTrueFalseStatement,
  Cmi5MoveOnStatements,
  Cmi5MoveOnStatementSendOptions,
  Cmi5PassStatement,
  Cmi5ProgressStatement,
  Cmi5TerminateStatement,
} from "./Cmi5Statements";
import { AdapterPromise } from "@xapi/xapi/dist/types/adapters";
import { XAPIConfig } from "@xapi/xapi/dist/types/XAPIConfig";

export * from "./interfaces";

function _applyTransform(
  mergedStatement: Statement,
  options: SendStatementOptions
) {
  return options && typeof options.transform === "function"
    ? options.transform(mergedStatement)
    : mergedStatement;
}

/**
 * Experience API cmi5 Profile (Quartz - 1st Edition)
 * Reference: https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md
 */
export default class AbstractCmi5 {
  private _launchParameters: LaunchParameters;
  private _launchData!: LaunchData;
  private _learnerPreferences!: LearnerPreferences;
  private _initializedDate!: Date;
  private _authToken: string | null = null;
  private _xapi: XAPI;
  private _xapiConfig: Pick<XAPIConfig, "adapter" | "version">;

  constructor(config: {
    launchParameters: LaunchParameters;
    xapiConfig: Pick<XAPIConfig, "adapter" | "version">;
  }) {
    this._launchParameters = config.launchParameters;
    this._xapiConfig = config.xapiConfig;
    if (!this._launchParameters.fetch) {
      throw Error("Unable to construct, no `fetch` parameter found in URL.");
    } else if (!this._launchParameters.endpoint) {
      throw Error("Unable to construct, no `endpoint` parameter found in URL");
    } else if (!this._launchParameters.actor) {
      throw Error("Unable to construct, no `actor` parameter found in URL.");
    } else if (!this._launchParameters.activityId) {
      throw Error(
        "Unable to construct, no `activityId` parameter found in URL."
      );
    } else if (!this._launchParameters.registration) {
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

  public get launchParameters(): LaunchParameters | null {
    return this._launchParameters;
  }

  public getLaunchParameters(): LaunchParameters {
    return this._launchParameters;
  }

  public get launchData(): LaunchData {
    return this._launchData;
  }

  public getLaunchData(): LaunchData {
    return this._launchData;
  }

  // Best Practice #17 – Persist AU Session State - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
  public getAuthToken(): string {
    return this._authToken;
  }

  public get initializedDate(): Date {
    return this._initializedDate;
  }

  public getInitializedDate(): Date {
    return this._initializedDate;
  }

  // 11.0 xAPI Agent Profile Data Model - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#110-xapi-agent-profile-data-model
  public getLearnerPreferences(): LearnerPreferences {
    return this._learnerPreferences;
  }

  // "cmi5 defined" Statements
  public async initialize(sessionState?: {
    authToken: string;
    initializedDate: Date;
  }): AdapterPromise<string[] | void> {
    // Best Practice #17 – Persist AU Session State - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
    const authToken = sessionState
      ? sessionState.authToken
      : await this.getAuthTokenFromLMS(this._launchParameters.fetch);
    this._authToken = authToken;
    this._xapi = new XAPI({
      ...this._xapiConfig,
      endpoint: this._launchParameters.endpoint,
      auth: `Basic ${authToken}`,
    });
    this._launchData = await this.getLaunchDataFromLMS();
    this._learnerPreferences = await this.getLearnerPreferencesFromLMS();

    if (sessionState) {
      // Best Practice #17 – Persist AU Session State - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
      this._initializedDate = sessionState.initializedDate;
    } else {
      this._initializedDate = new Date();
      // 9.3.2 Initialized - https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#932-initialized
      const statement = Cmi5DefinedStatement(this, {
        verb: Cmi5DefinedVerbs.INITIALIZED,
      });
      return this.sendXapiStatement(statement);
    }
  }

  public complete(options?: SendStatementOptions): AdapterPromise<string[]> {
    const statement = Cmi5CompleteStatement(this);
    return this.sendXapiStatement(statement, options);
  }

  public pass(
    score?: ResultScore | number,
    objectiveOrOptions?: ObjectiveActivity | PassOptions
  ): AdapterPromise<string[]> {
    const statement = Cmi5PassStatement(this, score, objectiveOrOptions);
    return this.sendXapiStatement(statement, objectiveOrOptions as PassOptions);
  }

  public fail(
    score?: ResultScore | number,
    options?: SendStatementOptions
  ): AdapterPromise<string[]> {
    const statement = Cmi5FailStatement(this, score);
    return this.sendXapiStatement(statement, options);
  }

  public terminate(): AdapterPromise<string[]> {
    const statement = Cmi5TerminateStatement(this);
    return this.sendXapiStatement(statement);
  }

  // "cmi5 allowed" Statements
  public progress(percent: number): AdapterPromise<string[]> {
    const statement = Cmi5ProgressStatement(this, percent);
    return this.sendXapiStatement(statement);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
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
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionTrueFalseStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /* eslint-disable @typescript-eslint/no-unused-vars */
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
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionChoiceStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
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
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionFillInStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
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
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionLongFillInStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
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
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionLikertStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
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
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionMatchingStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
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
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionPerformanceStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
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
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionSequencingStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
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
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionNumericStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
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
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionOtherStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  public interaction(
    testId: string,
    questionId: string,
    response: string,
    interactionDefinition: InteractionActivityDefinition,
    success?: boolean,
    duration?: Period,
    objective?: ObjectiveActivity
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): AdapterPromise<string[]> {
    /* eslint-disable prefer-rest-params */
    // @ts-expect-error TS doesn't like spreading arguments
    const statement = Cmi5InteractionStatement(this, ...arguments);
    /* eslint-enable prefer-rest-params */
    return this.sendXapiStatement(statement);
  }

  public async moveOn(options?: MoveOnOptions): Promise<string[]> {
    const moveOnStatements = Cmi5MoveOnStatements(this, options);
    const sendOptions = Cmi5MoveOnStatementSendOptions(this, options);
    const newStatementIds: string[] = [];
    for (const statement of moveOnStatements) {
      await this.sendXapiStatement(statement, sendOptions);
      newStatementIds.push(statement.id);
    }
    return newStatementIds;
  }

  private async getAuthTokenFromLMS(fetchUrl: string): Promise<string> {
    const response = await axios.post<AuthTokenResponse>(fetchUrl);
    return response.data["auth-token"];
  }

  private async getLaunchDataFromLMS(): Promise<LaunchData> {
    const launchDataResponse = await (this._xapi.getState({
      agent: this._launchParameters.actor,
      activityId: this._launchParameters.activityId,
      stateId: "LMS.LaunchData",
      registration: this._launchParameters.registration,
    }) as AdapterPromise<LaunchData>);
    return launchDataResponse.data;
  }

  private async getLearnerPreferencesFromLMS(): Promise<LearnerPreferences> {
    try {
      const learnerPrefResponse = await (this._xapi.getAgentProfile({
        agent: this._launchParameters.actor,
        profileId: "cmi5LearnerPreferences",
      }) as AdapterPromise<LearnerPreferences>);
      return learnerPrefResponse.data;
    } catch {
      return {};
    }
  }

  public async sendXapiStatement(
    statement: Statement,
    options?: SendStatementOptions
  ): AdapterPromise<string[]> {
    const sendStatement = _applyTransform(statement, options);
    return this._xapi.sendStatement({
      statement: sendStatement,
    });
  }
}
