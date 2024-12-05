import { LaunchParameters } from "./LaunchParameters";
import { LaunchData } from "./LaunchData";

export interface LaunchContext {
  initializedDate: Date;
  launchParameters: LaunchParameters;
  launchData: LaunchData;
}
