import XAPI, { InteractionActivityDefinition, ObjectiveActivity, Statement } from "@xapi/xapi";
import { LaunchParameters, Period } from "./interfaces";
import { AxiosPromise } from "axios";

export function Cmi5ProgressStatement(launchParameters: LaunchParameters, percent: number): Statement {
  return {
    verb: XAPI.Verbs.PROGRESSED,
    object: {
      objectType: "Activity",
      id: launchParameters.activityId,
    },
    result: {
      extensions: {
        "https://w3id.org/xapi/cmi5/result/extensions/progress": percent,
      },
    },
  }
}

export function Cmi5InteractionStatement(
  launchParameters: LaunchParameters,
  testId: string,
  questionId: string,
  response: string,
  interactionDefinition: InteractionActivityDefinition,
  success?: boolean,
  duration?: Period,
  objective?: ObjectiveActivity
): Statement {
  return {
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
      id: `${launchParameters.activityId}/test/${testId}/question/${questionId}`,
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
  };
}