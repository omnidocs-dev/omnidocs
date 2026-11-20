export const portSides=['left','right','top','bottom'] as const;
export function parsePort(id?:string|null){const match=id?.match(/^port-(left|right|top|bottom)-([0-2])$/);return match?{side:match[1] as typeof portSides[number],fraction:[0.25,0.5,0.75][Number(match[2])]}:undefined;}
