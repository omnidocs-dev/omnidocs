import {useState} from 'react';
import {Eye,EyeSlash} from '@phosphor-icons/react';

export function normalizeSixDigitCode(value:string){
 const digits=value.replace(/[٠-٩۰-۹]/g,digit=>String(digit.charCodeAt(0)&15)).replace(/[\s\p{Cf}-]/gu,'');
 return /^\d*$/.test(digits)?digits.slice(0,6):'';
}

export function SixDigitField({label,value,onChange,autoComplete='off',disabled=false}:{
 label:string;value:string;onChange:(value:string)=>void;autoComplete?:string;disabled?:boolean;
}){
 return <label>{label}<input required dir="ltr" inputMode="numeric" autoComplete={autoComplete} pattern="[0-9]{6}"
  disabled={disabled} value={value} onChange={event=>onChange(normalizeSixDigitCode(event.target.value))}/></label>;
}

export function PasswordField({value,onChange,minLength=1,isNew=false}:{
 value:string;onChange:(value:string)=>void;minLength?:number;isNew?:boolean;
}) {
 const [visible,setVisible]=useState(false);
 return <label>Password
  <span className="account-password">
   <input required type={visible?'text':'password'} minLength={minLength} maxLength={128}
    autoComplete={isNew?'new-password':'current-password'}
    value={value} onChange={event=>onChange(event.target.value)}/>
   <button type="button" className="icon-button" aria-label={visible?'Hide password':'Show password'}
    onClick={()=>setVisible(state=>!state)}>{visible?<EyeSlash size={19}/>:<Eye size={19}/>}</button>
  </span>
 </label>;
}
