export const registrationModes=['email','automatic','manual'] as const;
export type RegistrationMode=typeof registrationModes[number];
export type RegistrationSettings={mode:RegistrationMode;automaticAvailable:boolean;emailAvailable:boolean};
export type CaptchaChallenge={id:string;image:string};
