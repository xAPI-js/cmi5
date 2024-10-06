import { LaunchParameters } from "interfaces/LaunchParameters";
import { LaunchData } from "interfaces/LaunchData";

export interface LaunchContext {
  initializedDate: Date;
  launchParameters: LaunchParameters;
  launchData: LaunchData;
}
