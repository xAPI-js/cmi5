import XAPI from "@xapi/xapi";
import { LaunchParameters } from "./interfaces";
import AbstractCmi5 from "./AbstractCmi5";
import { XAPIConfig } from "@xapi/xapi/dist/types/XAPIConfig";

export * from "./interfaces";

export default class Cmi5 extends AbstractCmi5 {
  private static _instance: Cmi5 | null = null;

  constructor(config?: {
    launchParameters?: LaunchParameters;
    xapiConfig?: Pick<XAPIConfig, "adapter" | "version">;
  }) {
    const launchParameters =
      config?.launchParameters ?? Cmi5.getLaunchParametersFromLMS();
    const xapiConfig = config?.xapiConfig ?? {};
    super({ launchParameters, xapiConfig });
  }

  static get instance(): Cmi5 {
    if (!Cmi5._instance) {
      Cmi5._instance = new Cmi5();
    }
    return Cmi5._instance;
  }

  static clearInstance(): void {
    Cmi5._instance = null;
  }

  public static get isCmiAvailable(): boolean {
    if (!window || typeof window !== "object") {
      return false;
    }
    if (!window.location || typeof window.location.search !== "string") {
      return false;
    }
    const p = new URLSearchParams(window.location.search);
    return Boolean(
      // true if has all required cmi5 query params
      p.get("fetch") &&
        p.get("endpoint") &&
        p.get("actor") &&
        p.get("registration") &&
        p.get("activityId")
    );
  }

  protected static getLaunchParametersFromLMS(): LaunchParameters {
    return XAPI.getSearchQueryParamsAsObject(
      window.location.search
    ) as unknown as LaunchParameters;
  }
}
