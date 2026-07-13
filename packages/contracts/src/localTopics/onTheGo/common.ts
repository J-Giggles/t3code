import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "../../baseSchemas.ts";

export const OnTheGoCommandId = TrimmedNonEmptyString.pipe(Schema.brand("OnTheGoCommandId"));
export type OnTheGoCommandId = typeof OnTheGoCommandId.Type;

export const OnTheGoDeviceId = TrimmedNonEmptyString.pipe(Schema.brand("OnTheGoDeviceId"));
export type OnTheGoDeviceId = typeof OnTheGoDeviceId.Type;
export const OnTheGoConfirmationId = TrimmedNonEmptyString.pipe(
  Schema.brand("OnTheGoConfirmationId"),
);
export type OnTheGoConfirmationId = typeof OnTheGoConfirmationId.Type;

export const OnTheGoInputSource = Schema.Literals(["voice", "visual", "keyboard", "touch"]);
export type OnTheGoInputSource = typeof OnTheGoInputSource.Type;
