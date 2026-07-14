import { requireOptionalNativeModule } from "expo";

import {
  fallbackNativeAudioPolicy,
  normalizeNativeAudioPolicy,
  type NativeAudioPolicySnapshot,
} from "./NativeAudioPolicyState";

interface NativeAudioPolicyModule {
  readonly getCurrentState: () => unknown;
  readonly addListener: (
    event: "onPolicyChanged",
    listener: (state: unknown) => void,
  ) => { readonly remove: () => void };
}

const module = requireOptionalNativeModule<NativeAudioPolicyModule>("T3OnTheGoAudioPolicy");

export const readNativeAudioPolicy = () =>
  normalizeNativeAudioPolicy(module?.getCurrentState() ?? fallbackNativeAudioPolicy);

export const subscribeNativeAudioPolicy = (
  listener: (state: NativeAudioPolicySnapshot) => void,
) => {
  if (!module) return () => undefined;
  const subscription = module.addListener("onPolicyChanged", (state) =>
    listener(normalizeNativeAudioPolicy(state)),
  );
  return () => subscription.remove();
};
