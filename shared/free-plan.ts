export const freePlanLimits = {organization:1,project:2,space:3} as const;
export type ResourceKind = keyof typeof freePlanLimits;

export const resourceUnits = {
 organization: {singular:'organization',plural:'organizations'},
 project: {singular:'project',plural:'projects'},
 space: {singular:'workspace',plural:'workspaces'},
} as const;

export function freePlanLimitMessage(kind:ResourceKind) {
 const limit=freePlanLimits[kind];
 const unit=limit===1 ? resourceUnits[kind].singular : resourceUnits[kind].plural;
 return `The Free plan allows ${limit} ${unit} per account.`;
}
