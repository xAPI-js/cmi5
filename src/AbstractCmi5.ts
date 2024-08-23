import axios, { AxiosPromise, AxiosResponse } from "axios";
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
  PassOptions,
  Performance,
  PerformanceCriteria,
  Period,
  MoveOnOptions,
  NumericCriteria,
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

export * from "./interfaces";

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

  constructor(launchParameters: LaunchParameters) {
    this._launchParameters = launchParameters;
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
  }): AxiosPromise<string[] | void> {
    // Best Practice #17 – Persist AU Session State - https://aicc.github.io/CMI-5_Spec_Current/best_practices/
    const authToken = sessionState
      ? sessionState.authToken
      : await this.getAuthTokenFromLMS(this._launchParameters.fetch);
    this._authToken = authToken;
    this._xapi = new XAPI({
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

  public complete(options?: SendStatementOptions): AxiosPromise<string[]> {
    const statement = Cmi5CompleteStatement(this);
    return this.sendXapiStatement(statement, options);
  }

  public pass(
    score?: ResultScore | number,
    objectiveOrOptions?: ObjectiveActivity | PassOptions
  ): AxiosPromise<string[]> {
    const statement = Cmi5PassStatement(this, score, objectiveOrOptions);
    return this.sendXapiStatement(statement, objectiveOrOptions as PassOptions);
  }

  public fail(
    score?: ResultScore | number,
    options?: SendStatementOptions
  ): AxiosPromise<string[]> {
    const statement = Cmi5FailStatement(this, score);
    return this.sendXapiStatement(statement, options);
  }

  public terminate(): AxiosPromise<string[]> {
    const statement = Cmi5TerminateStatement(this);
    return this.sendXapiStatement(statement);
  }

  // "cmi5 allowed" Statements
  public progress(percent: number): AxiosPromise<string[]> {
    const statement = Cmi5ProgressStatement(this, percent);
    return this.sendXapiStatement(statement);
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
    const statement = Cmi5InteractionTrueFalseStatement(
      this,
      testId,
      questionId,
      answer,
      correctAnswer,
      name,
      description,
      success,
      duration,
      objective
    );
    return this.sendXapiStatement(statement);
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
    const statement = Cmi5InteractionChoiceStatement(
      this,
      testId,
      questionId,
      answerIds,
      correctAnswerIds,
      choices,
      name,
      description,
      success,
      duration,
      objective
    );
    return this.sendXapiStatement(statement);
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
    const statement = Cmi5InteractionFillInStatement(
      this,
      testId,
      questionId,
      answers,
      correctAnswers,
      name,
      description,
      success,
      duration,
      objective
    );
    return this.sendXapiStatement(statement);
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
    const statement = Cmi5InteractionLongFillInStatement(
      this,
      testId,
      questionId,
      answers,
      correctAnswers,
      name,
      description,
      success,
      duration,
      objective
    );
    return this.sendXapiStatement(statement);
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
    const statement = Cmi5InteractionLikertStatement(
      this,
      testId,
      questionId,
      answerId,
      correctAnswerId,
      scale,
      name,
      description,
      success,
      duration,
      objective
    );
    return this.sendXapiStatement(statement);
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
    const statement = Cmi5InteractionMatchingStatement(
      this,
      testId,
      questionId,
      answers,
      correctAnswers,
      source,
      target,
      name,
      description,
      success,
      duration,
      objective
    );
    return this.sendXapiStatement(statement);
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
    const statement = Cmi5InteractionPerformanceStatement(
      this,
      testId,
      questionId,
      answers,
      correctAnswers,
      steps,
      name,
      description,
      success,
      duration,
      objective
    );
    return this.sendXapiStatement(statement);
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
    const statement = Cmi5InteractionSequencingStatement(
      this,
      testId,
      questionId,
      answerIds,
      correctAnswerIds,
      choices,
      name,
      description,
      success,
      duration,
      objective
    );
    return this.sendXapiStatement(statement);
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
    const statement = Cmi5InteractionNumericStatement(
      this,
      testId,
      questionId,
      answer,
      correctAnswer,
      name,
      description,
      success,
      duration,
      objective
    );
    return this.sendXapiStatement(statement);
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
    const statement = Cmi5InteractionOtherStatement(
      this,
      testId,
      questionId,
      answer,
      correctAnswer,
      name,
      description,
      success,
      duration,
      objective
    );

    return this.sendXapiStatement(statement);
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
      this,
      testId,
      questionId,
      response,
      interactionDefinition,
      success,
      duration,
      objective
    );
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

  private appendStatementIds(
    response: AxiosResponse<string[]>,
    toIds: string[]
  ): void {
    // eslint-disable-next-line prefer-spread
    toIds.push.apply(toIds, response.data);
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
    }) as AxiosPromise<LaunchData>);
    return launchDataResponse.data;
  }

  private async getLearnerPreferencesFromLMS(): Promise<LearnerPreferences> {
    try {
      const learnerPrefResponse = await (this._xapi.getAgentProfile({
        agent: this._launchParameters.actor,
        profileId: "cmi5LearnerPreferences",
      }) as AxiosPromise<LearnerPreferences>);
      return learnerPrefResponse.data;
    } catch (err) {
      return {};
    }
  }

  public async sendXapiStatement(
    mergedStatement: Statement,
    options?: SendStatementOptions
  ): AxiosPromise<string[]> {
    const sendStatement =
      options && typeof options.transform === "function"
        ? options.transform(mergedStatement)
        : mergedStatement;
    return this._xapi.sendStatement({
      statement: sendStatement,
    });
  }
}
