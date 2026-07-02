import { WebPlugin } from "@capacitor/core";

import type {
  ActivityBridgePlugin,
  EndActivityOptions,
  GetPushToStartTokenResult,
  IsSupportedResult,
  StartActivityOptions,
  StartActivityResult,
} from "./definitions";

/**
 * No-op fallback used on web and Android (there is no native implementation on
 * those platforms). Every method resolves to a neutral value so callers can
 * treat Live Activities as simply unavailable.
 */
export class ActivityBridgeWeb extends WebPlugin implements ActivityBridgePlugin {
  async isSupported(): Promise<IsSupportedResult> {
    return { liveActivities: false, pushToStart: false };
  }

  async getPushToStartToken(): Promise<GetPushToStartTokenResult> {
    return { token: null };
  }

  async startActivity(_options: StartActivityOptions): Promise<StartActivityResult> {
    return { activityId: null };
  }

  async endActivity(_options: EndActivityOptions): Promise<void> {
    // no-op
  }
}
