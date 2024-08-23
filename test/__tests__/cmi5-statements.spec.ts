import {
  LaunchContext,
  LaunchData,
  LaunchParameters,
} from "../../src/interfaces";
import { randomUUID } from "node:crypto";
import { Cmi5DefinedVerbs } from "../../src/constants";
import {
  Cmi5CompleteStatement,
  Cmi5PassStatement,
} from "../../src/Cmi5Statements";
import { ResultScore } from "@xapi/xapi";

describe("Cmi5 Statements", () => {
  const DEFAULT_LAUNCH_PARAMETERS: LaunchParameters = {
    activityId: randomUUID(),
    actor: { mbox: "test@example.com" },
    endpoint: "http://fake-lrs.example.com",
    fetch: "http://fake-fetch.lms.example.com",
    registration: randomUUID(),
  };
  const DEFAULT_LAUNCH_DATA: LaunchData = {
    contextTemplate: {},
    launchMode: "Normal",
    moveOn: "CompletedAndPassed",
  };
  const DEFAULT_LAUNCH_CONTEXT: LaunchContext = {
    initializedDate: new Date(),
    launchParameters: DEFAULT_LAUNCH_PARAMETERS,
    launchData: DEFAULT_LAUNCH_DATA,
  };

  describe("Cmi5CompleteStatement", () => {
    [
      { seconds: 125, expectedDuration: "PT2M5S" },
      { seconds: 31, expectedDuration: "PT31S" },
    ].forEach((ex) => {
      it(`calculates duration as time since initialized (${ex.seconds}s=${ex.expectedDuration})`, () => {
        const ctx: LaunchContext = {
          ...DEFAULT_LAUNCH_CONTEXT,
          initializedDate: new Date(Date.now() - ex.seconds * 1000),
        };
        const statement = Cmi5CompleteStatement(ctx);
        expect(statement.verb).toEqual(Cmi5DefinedVerbs.COMPLETED);
        expect(statement.result.duration).toEqual(ex.expectedDuration);
      });
    });

    ["Browse", "Review", null].forEach(
      (launchMode: LaunchData["launchMode"]) => {
        it(`throws exception if launchMode is '${launchMode}'`, async () => {
          const ctx: LaunchContext = {
            ...DEFAULT_LAUNCH_CONTEXT,
            launchData: {
              ...DEFAULT_LAUNCH_DATA,
              launchMode: launchMode,
            },
          };
          expect(() => Cmi5CompleteStatement(ctx)).toThrow(
            expect.objectContaining({
              message: "Can only send COMPLETED when launchMode is 'Normal'",
            })
          );
        });
      }
    );
  });

  describe("Cmi5PassStatement", () => {
    it("returns a statement with PASSED verb", async () => {
      const ctx = DEFAULT_LAUNCH_CONTEXT;
      const statement = Cmi5PassStatement(ctx);
      expect(statement.verb).toEqual(Cmi5DefinedVerbs.PASSED);
    });

    it("returns a statement with `result.success === true`", async () => {
      const ctx = DEFAULT_LAUNCH_CONTEXT;
      const resultScore: ResultScore = { scaled: 0.9 };
      const statement = Cmi5PassStatement(ctx, resultScore);
      expect(statement.result.success).toEqual(true);
    });

    describe("`statement.result.score`", () => {
      describe("when `launchData.masteryScore` is defined", () => {
        const ctx = {
          ...DEFAULT_LAUNCH_CONTEXT,
          launchData: {
            ...DEFAULT_LAUNCH_DATA,
            masteryScore: 0.5,
          },
        };

        describe("when `resultScore` is greater than `masteryScore`", () => {
          it("returns `statement.result.success === true`", async () => {
            expect(ctx.launchData.masteryScore).toBeGreaterThan(0);
            const resultScore: ResultScore = { scaled: 0.9 };
            expect(resultScore.scaled).toBeGreaterThan(
              ctx.launchData.masteryScore
            );
            const statement = Cmi5PassStatement(ctx, resultScore);
            expect(statement.result.success).toEqual(true);
          });

          it("returns a `ResultScore` when given a `ResultScore`", async () => {
            expect(ctx.launchData.masteryScore).toBeGreaterThan(0);
            const resultScore: ResultScore = { scaled: 0.9 };
            expect(resultScore.scaled).toBeGreaterThan(
              ctx.launchData.masteryScore
            );
            const statement = Cmi5PassStatement(ctx, resultScore);
            expect(statement.result.score).toEqual(resultScore);
          });

          it("returns a `ResultScore` when given a number", async () => {
            expect(ctx.launchData.masteryScore).toBeGreaterThan(0);
            const scaledScore = 0.75;
            expect(scaledScore).toBeGreaterThan(ctx.launchData.masteryScore);
            const statement = Cmi5PassStatement(ctx, scaledScore);
            expect(statement.result.score).toEqual({ scaled: scaledScore });
          });

          it("returns a statement when `resultScore === masteryScore`", async () => {
            expect(ctx.launchData.masteryScore).toBeGreaterThan(0);
            const scaledScore = ctx.launchData.masteryScore;
            expect(scaledScore).toBeGreaterThan(0);
            const statement = Cmi5PassStatement(ctx, scaledScore);
            expect(statement.result.score).toEqual({ scaled: scaledScore });
          });

          [
            { seconds: 93, expectedDuration: "PT1M33S" },
            { seconds: 7593, expectedDuration: "PT2H6M33S" },
          ].forEach((ex) => {
            it(`sends duration as time since initialized (${ex.seconds}=${ex.expectedDuration})`, async () => {
              const ctx: LaunchContext = {
                ...DEFAULT_LAUNCH_CONTEXT,
                initializedDate: new Date(Date.now() - ex.seconds * 1000),
                launchData: {
                  ...DEFAULT_LAUNCH_DATA,
                  masteryScore: 0.5,
                },
              };
              expect(ctx.launchData.masteryScore).toBeGreaterThan(0);
              const scaledScore = 0.9;
              expect(scaledScore).toBeGreaterThan(0);
              const statement = Cmi5PassStatement(ctx, scaledScore);
              expect(statement.result.duration).toEqual(ex.expectedDuration);
            });
          });
        });

        describe("when `resultScore` is less than `masteryScore`", () => {
          it("throws an error that learner has not met mastery score", async () => {
            expect(ctx.launchData.masteryScore).toBeGreaterThan(0);
            const resultScore = 0.4;
            expect(resultScore).toBeLessThan(ctx.launchData.masteryScore);
            expect(() => Cmi5PassStatement(ctx, resultScore)).toThrow(
              expect.objectContaining({
                message: "Learner has not met Mastery Score",
              })
            );
          });
        });

        describe("when `resultScore` is not provided", () => {
          it("throws an error that learner has not met mastery score", async () => {
            expect(ctx.launchData.masteryScore).toBeGreaterThan(0);
            expect(() => Cmi5PassStatement(ctx)).toThrow(
              expect.objectContaining({
                message: "Learner has not met Mastery Score",
              })
            );
          });
        });
      });
    });

    ["Browse", "Review", null].forEach(
      (launchMode: LaunchData["launchMode"]) => {
        it(`throws exception if launchMode is '${launchMode}'`, async () => {
          const ctx: LaunchContext = {
            ...DEFAULT_LAUNCH_CONTEXT,
            launchData: {
              ...DEFAULT_LAUNCH_DATA,
              launchMode: launchMode,
            },
          };
          expect(() => Cmi5PassStatement(ctx)).toThrow(
            expect.objectContaining({
              message: "Can only send PASSED when launchMode is 'Normal'",
            })
          );
        });
      }
    );
  });
});
