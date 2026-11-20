import type {ResourceKind} from './free-plan.ts';

export type ResourceCounts=Record<ResourceKind,number>;
export type AdminUser={
 id:string;name:string;email:string;verified:boolean;suspended:boolean;created_at:number;owned:ResourceCounts;
 platform_role:'member'|'admin';login_name:string|null;
};
export type AdminResource={
 id:string;kind:ResourceKind;parent_id:string|null;parent_name:string|null;
 owner_id:string;owner_name:string;owner_email:string;name:string;description:string;
 archived:boolean;blocked:boolean;created_at:number;
};
export type AdminActivity={
 id:string;actor:string;action:string;target:string|null;created_at:number;management:boolean;
};
export type AdminOverview={
 users:{total:number;verified:number;pending:number;suspended:number};
 resources:ResourceCounts;archived:number;activity:AdminActivity[];
};
export type AdminPage<T>={items:T[];total:number;page:number;pageSize:number};
export type AdminMembership={id:string;scope_id:string;name:string;kind:ResourceKind;role:'viewer'|'editor';archived:boolean};
export type AdminUserDetails={
 user:AdminUser;resources:AdminResource[];memberships:AdminMembership[];activity:AdminActivity[];sessions:number;
};
